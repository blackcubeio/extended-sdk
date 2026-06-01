import { describe, expect, it } from 'vitest';
import { DEFAULT_TAKER_FEE } from '../src/common/constants';
import { scaleProductToStark, scaleToStark } from '../src/common/utils';
import { hashOrder, settlementExpiration, signMsgHash, starkPublicKey } from '../src/rest/signing';

// Vecteur croisé déterministe : MÊMES inputs que /tmp/ref_vector.py (SDK Python `starknet`
// via fast_stark_crypto==0.5.0). On compare hash + (r,s) + montants scalés + expiration AU BIT PRÈS.
describe('cross-vector vs SDK Python starknet (fast_stark_crypto 0.5.0)', () => {
  const PRIV = '0x13ee6aa9b55c794a79e0bb4ef8e74e4e08b5637e873ef118cf5c01d83b701f6' as const;
  const SYNTHETIC_ID = 0x4254432d5553442d38000000000000n;
  const COLLATERAL_ID = 0x1n;
  const SYN_RES = 10 ** 10;
  const COL_RES = 10 ** 6;
  const VAULT = 10001n;
  const NONCE = 1473459052n;
  const SIZE = '0.001';
  const PRICE = '95000.5';
  // expire 2026-06-01 12:00:00 UTC = 1780315200000 ms
  const EXPIRE_MS = 1780315200000;

  it('public key dérivée == ref', () => {
    const pub = starkPublicKey(PRIV);
    expect(pub.startsWith('0x') ? pub : `0x${pub}`).toBe(
      '0x5db6654e268c7335c6d73665d7ce3b146c6b14e700fd3b6114c688ad21c0e6f',
    );
  });

  it('montants scalés == ref (BUY: rounding up, quote<0)', () => {
    const baseAmount = scaleToStark(SIZE, SYN_RES, 'up');
    const quoteAmount = scaleProductToStark([SIZE, PRICE], COL_RES, 'up');
    const feeAmount = scaleProductToStark([DEFAULT_TAKER_FEE, SIZE, PRICE], COL_RES, 'up');
    expect(baseAmount.toString()).toBe('10000000');
    expect((-quoteAmount).toString()).toBe('-95000500');
    expect(feeAmount.toString()).toBe('47501');
  });

  it('expiration == ref (+14j, ceil s)', () => {
    expect(settlementExpiration(EXPIRE_MS, 'order').toString()).toBe('1781524800');
  });

  it('order hash + signature (r,s) == ref AU BIT PRÈS', () => {
    const baseAmount = scaleToStark(SIZE, SYN_RES, 'up');
    const quoteAmount = -scaleProductToStark([SIZE, PRICE], COL_RES, 'up');
    const feeAmount = scaleProductToStark([DEFAULT_TAKER_FEE, SIZE, PRICE], COL_RES, 'up');
    const msgHash = hashOrder(
      {
        positionId: VAULT,
        baseAssetId: SYNTHETIC_ID,
        baseAmount,
        quoteAssetId: COLLATERAL_ID,
        quoteAmount,
        feeAmount,
        feeAssetId: COLLATERAL_ID,
        expiration: settlementExpiration(EXPIRE_MS, 'order'),
        salt: NONCE,
        userPublicKey: BigInt('0x5db6654e268c7335c6d73665d7ce3b146c6b14e700fd3b6114c688ad21c0e6f'),
      },
      'testnet',
    );
    expect(msgHash.toString()).toBe(
      '202604897863102248957652445778169685717304307044993653180881986394935062100',
    );
    const sig = signMsgHash(msgHash, PRIV);
    expect(sig.r).toBe('0x6fb953589d299ad767ed549ddf90dd5cabf648661b333a14130fc502c14db70');
    expect(sig.s).toBe('0x77696e2b51dca4e0a4be26fe423c608d4e46894f23c13a407ab8ec67c75a07');
  });
});
