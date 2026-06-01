import { describe, expect, it } from 'vitest';
import { Extended } from '../src/dex/extended';
import { deriveL2Signer, readEnv } from './_env';

// Lectures **privées signées** sur le **testnet réel** (Sepolia). On dérive la clé Stark L2 depuis la
// clé EVM via l'onboarding EIP-712 du SDK (sans dépendance externe), puis on prouve que le header
// `X-Api-Key` + `User-Agent` donne accès aux endpoints `/user/*` (200, pas d'erreur d'auth). Aucune
// écriture (pas d'ordre, retrait ni transfert). Skip propre si `.env` absent.

const evmPrivate = readEnv('EVM_PRIVATE_KEY');
const evmPublic = readEnv('EVM_PUBLIC_KEY');
const apiKey = readEnv('EXTENDED_API1_PUBLIC_KEY');
const ready =
  evmPrivate !== undefined &&
  evmPublic !== undefined &&
  apiKey !== undefined &&
  /^0x[0-9a-f]{64}$/i.test(evmPrivate);

describe.skipIf(!ready)('Extended — lectures privées signées (testnet réel)', () => {
  const l2 = deriveL2Signer(evmPrivate as string, evmPublic as string, 'testnet');
  const dex = new Extended(
    {
      acc: {
        apiKey: apiKey as string,
        l2PrivateKey: l2.privateKey,
        l2PublicKey: l2.publicKey,
        // vaultId non requis pour les lectures (renseigné dynamiquement ailleurs).
        vaultId: 0,
        network: 'testnet',
      },
    },
    { default: 'acc' },
  );

  it("dérive la clé L2 attendue depuis l'EVM (onboarding EIP-712)", () => {
    expect(l2.publicKey).toMatch(/^0x[0-9a-f]+$/);
  });

  it('account().getBalances répond 200 et renvoie un Balance[] unifié (collatéral USD)', async () => {
    // `/user/balance` (auth `X-Api-Key`) renvoie le collatéral USD unique du compte. On vérifie la
    // forme commune : asset/total/available/usdValue + xtras (equity, marge, pnl…).
    const balances = await dex.account().getBalances();
    console.log('balances:', JSON.stringify(balances));
    expect(Array.isArray(balances)).toBe(true);
    expect(balances.length).toBeGreaterThanOrEqual(1);
    const usd = balances[0];
    if (usd === undefined) {
      throw new Error('balances vide');
    }
    expect(usd.asset).toBe('USD');
    // `total` est numérique (string), `available` ≤ `total`, `usdValue` = equity.
    expect(Number.isNaN(Number(usd.total))).toBe(false);
    expect(usd.available).not.toBeNull();
    expect(Number.isNaN(Number(usd.available))).toBe(false);
    expect(usd.usdValue).not.toBeNull();
    // Les champs spécifiques Extended non promus survivent en xtras (bijection).
    expect(usd.xtras).toHaveProperty('availableForWithdrawal');
    expect(usd.xtras).toHaveProperty('marginRatio');
  }, 30_000);

  it('perp().getAccountInfo répond 200 et la clé L2 dérivée matche le compte', async () => {
    const info = (await dex.perp().getAccountInfo()) as Record<string, unknown>;
    console.log('account info:', JSON.stringify(info));
    expect(info).toBeTruthy();
    const l2Key = String(info.l2Key ?? '').toLowerCase();
    expect(l2Key).toBe(l2.publicKey.toLowerCase());
    expect(String(info.l2Vault ?? '')).not.toBe('');
  }, 30_000);

  it('perp().getPositions répond 200 (Position[], éventuellement vide)', async () => {
    const positions = await dex.perp().getPositions();
    console.log('positions count:', positions.length);
    expect(Array.isArray(positions)).toBe(true);
  }, 30_000);

  it('perp().getOpens répond 200 (Order[] ouverts)', async () => {
    const opens = await dex.perp().getOpens();
    console.log('open orders count:', opens.length);
    expect(Array.isArray(opens)).toBe(true);
  }, 30_000);

  it('perp().getUserTrades répond 200 (UserTrade[], fills)', async () => {
    const trades = await dex.perp().getUserTrades();
    console.log('user trades count:', trades.length);
    expect(Array.isArray(trades)).toBe(true);
  }, 30_000);

  it('perp().getHistory répond 200 (Order[] historique)', async () => {
    const history = await dex.perp().getHistory();
    console.log('order history count:', history.length);
    expect(Array.isArray(history)).toBe(true);
  }, 30_000);

  it('perp().getFundingHistory répond 200 (FundingRate[] du marché)', async () => {
    // Extended n'a pas de funding *par compte* : c'est la donnée marché (signée par `X-Api-Key`).
    const funding = await dex.perp().getFundingHistory({ name: 'BTC-USD', limit: 5 });
    console.log('funding rows:', funding.length);
    expect(Array.isArray(funding)).toBe(true);
  }, 30_000);
});
