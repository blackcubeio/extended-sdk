import { describe, expect, it } from 'vitest';
import { Extended } from '../src/dex/extended';
import { deriveL2Signer, readEnv } from './_env';

// Lectures **privées signées** sur le **testnet réel** (Sepolia). On dérive la clé Stark L2 depuis la
// clé EVM via l'onboarding EIP-712 du SDK (sans dépendance externe), puis on prouve que le header
// `X-Api-Key` + `User-Agent` donne accès aux endpoints `/user/*` (200, pas d'erreur d'auth). Aucune
// écriture. Skip propre si `.env` absent.

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
        // vaultId non encore connu : renseigné dynamiquement depuis l'API dans les tests.
        vaultId: 0,
        network: 'testnet',
      },
    },
    { default: 'acc' },
  );

  it("dérive la clé L2 attendue depuis l'EVM (onboarding EIP-712)", () => {
    // La clé publique dérivée doit correspondre au `l2Key` du compte Extended (preuve de cohérence
    // onboarding ↔ compte serveur).
    expect(l2.publicKey).toMatch(/^0x[0-9a-f]+$/);
  });

  it('account().getBalances ou perp().getAccountInfo répond 200 (auth acceptée)', async () => {
    // `/user/account/info` est une lecture signée par `X-Api-Key` : un 200 prouve l'auth.
    const info = (await dex.perp().getAccountInfo()) as Record<string, unknown>;
    console.log('account info:', JSON.stringify(info));
    expect(info).toBeTruthy();
    // Le compte expose son vault L2 et sa clé L2 ; la clé L2 dérivée doit matcher.
    const l2Key = String(info.l2Key ?? '').toLowerCase();
    expect(l2Key).toBe(l2.publicKey.toLowerCase());
    expect(String(info.l2Vault ?? '')).not.toBe('');
  }, 30_000);

  it('perp().getPositions répond 200 (liste, éventuellement vide)', async () => {
    const positions = await dex.perp().getPositions();
    console.log('positions count:', positions.length);
    expect(Array.isArray(positions)).toBe(true);
  }, 30_000);

  it('perp().getOpens répond 200 (ordres ouverts)', async () => {
    const opens = await dex.perp().getOpens();
    console.log('open orders count:', opens.length);
    expect(Array.isArray(opens)).toBe(true);
  }, 30_000);
});
