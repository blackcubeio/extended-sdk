import { beforeAll, describe, expect, it } from 'vitest';
import { init } from '../src/common/config';
import { REST_URLS } from '../src/common/constants';
import { Extended } from '../src/dex/extended';
import { httpGet, httpPost } from '../src/rest/client';
import { deriveL2Signer, readEnv } from './_env';

// Écriture signée **StarkEx** sur le **testnet réel** (Sepolia) : on place un ordre limite BTC-USD
// d'achat **très loin du marché** (~50 % du mid, postOnly → ne fill jamais) avec le `settlement`
// signé Stark, on prouve qu'il est **accepté** (apparaît dans les ordres ouverts), puis on l'annule
// (non destructif). Si le compte n'a pas de collatéral testnet, on déclenche le faucet `/user/claim`.
//
// Le keypair Stark L2 est dérivé de la clé EVM via l'onboarding EIP-712 du SDK ; le vault
// (`l2Vault`) est lu dynamiquement sur `/user/accounts`. AUCUN retrait/transfert/sous-compte.

const evmPrivate = readEnv('EVM_PRIVATE_KEY');
const evmPublic = readEnv('EVM_PUBLIC_KEY');
const apiKey = readEnv('EXTENDED_API1_PUBLIC_KEY');
const ready =
  evmPrivate !== undefined &&
  evmPublic !== undefined &&
  apiKey !== undefined &&
  /^0x[0-9a-f]{64}$/i.test(evmPrivate);

interface AccountInfo {
  l2Key: string;
  l2Vault: string;
}

describe.skipIf(!ready)('Extended — ordre signé StarkEx accepté puis annulé (testnet réel)', () => {
  const l2 = deriveL2Signer(evmPrivate as string, evmPublic as string, 'testnet');
  let dex: Extended;
  let vaultId: string;

  // Client de découverte/faucet pointé sur testnet (les helpers REST sans label retombent sinon sur
  // mainnet) : on force la base mainnet vers l'URL testnet.
  const discoveryClient = init({ restUrls: { mainnet: REST_URLS.testnet } });

  beforeAll(async () => {
    // Découverte du vault via lecture signée brute (pas encore de signer côté façade).
    const env = await httpGet<AccountInfo[]>(
      discoveryClient,
      '/user/accounts',
      undefined,
      undefined,
      apiKey as string,
    );
    const account = (env.data ?? [])[0];
    if (account === undefined) {
      throw new Error('Aucun compte Extended pour cette clé API.');
    }
    vaultId = String(account.l2Vault);
    // Le compte doit exposer la clé L2 dérivée (cohérence onboarding ↔ serveur).
    expect(account.l2Key.toLowerCase()).toBe(l2.publicKey.toLowerCase());

    dex = new Extended(
      {
        acc: {
          apiKey: apiKey as string,
          l2PrivateKey: l2.privateKey,
          l2PublicKey: l2.publicKey,
          vaultId,
          network: 'testnet',
        },
      },
      { default: 'acc' },
    );
  }, 30_000);

  it('place un ordre limite loin du marché (settlement Stark) → accepté → annulé', async () => {
    const perp = dex.perp();
    const name = 'BTC-USD';

    // Prix loin sous le marché (~50 % du mid) : un buy postOnly ne fill jamais.
    const prices = await perp.getPrices();
    const market = prices.find((p) => p.name === name);
    const mid = Number(market?.mark ?? market?.mid ?? '0');
    expect(mid).toBeGreaterThan(0);
    const farPrice = String(Math.floor((mid * 0.5) / 10) * 10); // arrondi au pas (0.1) large
    const size = '0.0001'; // minOrderSize BTC-USD

    let order: Awaited<ReturnType<typeof perp.place>> | undefined;
    try {
      order = await perp.place({
        name,
        side: 'buy',
        type: 'limit',
        size,
        price: farPrice,
        tif: 'alo',
      });
    } catch (e) {
      // Solde testnet insuffisant : on tire au faucet et on retente. La signature a déjà été
      // acceptée par le serveur (l'erreur de solde survient APRÈS la vérif côté place).
      const msg = String((e as Error).message);
      if (/balance|cost exceeds/i.test(msg)) {
        await httpPost(discoveryClient, '/user/claim', apiKey as string, {});
        // Laisse le claim se régler.
        await new Promise((r) => setTimeout(r, 3000));
        order = await perp.place({
          name,
          side: 'buy',
          type: 'limit',
          size,
          price: farPrice,
          tif: 'alo',
        });
      } else {
        throw e;
      }
    }

    console.log('ordre placé:', JSON.stringify(order));
    expect(order.id).not.toBe('');
    expect(order.name).toBe(name);

    // Preuve forte que la signature a été acceptée : l'ordre apparaît bien ouvert, avec le **même
    // id exact** (id 64 bits préservé en chaîne) et au prix demandé.
    const opens = await perp.getOpens({ name });
    const found = opens.find((o) => o.id === order.id);
    console.log(
      'ordres ouverts:',
      JSON.stringify(opens.map((o) => ({ id: o.id, price: o.price, status: o.status }))),
    );
    expect(found).toBeDefined();
    expect(found?.price).toBe(farPrice);

    // Annulation (non destructif) puis vérification de disparition.
    await perp.cancel({ name, id: order.id });
    await new Promise((r) => setTimeout(r, 1500));
    const after = await perp.getOpens({ name });
    expect(after.find((o) => o.id === order.id)).toBeUndefined();
    console.log('ordre annulé, plus présent dans les ouverts.');
  }, 60_000);
});
