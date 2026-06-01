import { describe, expect, it } from 'vitest';
import {
  hashOrder,
  hashTransfer,
  hashWithdrawal,
  signMsgHash,
  starkPublicKey,
} from '../src/rest/signing';

// Vecteurs de référence **bit-pour-bit** issus de `fast_stark_crypto` 0.5.0
// (`rust-crypto-lib-base/src/starknet_messages.rs`, fonctions de test + oracle live). Domaine
// `SN_SEPOLIA`. Ces tests verrouillent l'encodage SNIP-12 rev-1 (sélecteurs, ordre des champs, types
// `i64`/`u64`, enveloppe avec clé publique) contre la lib Rust officielle. Aucun réseau requis.

describe('signing StarkEx — hash SNIP-12 rev-1 (référence fast_stark_crypto)', () => {
  it('hashOrder reproduit get_order_msg_hash (montants positifs)', () => {
    // Rust test_message_hash_order : pos=1, base_id=2, base_amt=3, quote_id=4, quote_amt=5,
    // fee_id=6, fee_amt=7, exp=8, salt=9, user_key=1528491859474308181214583355362479091084733880193869257167008343298409336538.
    const hash = hashOrder(
      {
        positionId: 1n,
        baseAssetId: 2n,
        baseAmount: 3n,
        quoteAssetId: 4n,
        quoteAmount: 5n,
        feeAssetId: 6n,
        feeAmount: 7n,
        expiration: 8n,
        salt: 9n,
        userPublicKey:
          1528491859474308181214583355362479091084733880193869257167008343298409336538n,
      },
      'testnet',
    );
    expect(hash.toString()).toBe(
      '2788960362996410178586013462192086205585543858281504820767681025777602529597',
    );
  });

  it('hashOrder gère les montants négatifs (BUY : quote < 0) au bit près', () => {
    // Oracle fast_stark_crypto : quote_amount négatif, base/expiration/salt réalistes, clé publique 251 bits.
    const hash = hashOrder(
      {
        positionId: 10001n,
        baseAssetId: 0xabcn,
        baseAmount: 1000000n,
        quoteAssetId: 0x1n,
        quoteAmount: -50000000000n,
        feeAssetId: 0x1n,
        feeAmount: 25000000n,
        expiration: 1800000000n,
        salt: 987654321n,
        userPublicKey:
          26845792554019930167761581969635808012473610759772140177330459226260076230665n,
      },
      'testnet',
    );
    expect(hash.toString()).toBe(
      '123590830700626767652752663601510340181530438898088146497797536423041573072',
    );
  });

  it('hashOrder gère les montants négatifs (SELL : base < 0)', () => {
    const hash = hashOrder(
      {
        positionId: 10001n,
        baseAssetId: 0xabcn,
        baseAmount: -1000000n,
        quoteAssetId: 0x1n,
        quoteAmount: 50000000000n,
        feeAssetId: 0x1n,
        feeAmount: 25000000n,
        expiration: 1800000000n,
        salt: 111n,
        userPublicKey: 12345n,
      },
      'testnet',
    );
    expect(hash.toString()).toBe(
      '2835246151367647347185102978493571168108483590793709098239418841996278956863',
    );
  });

  it('hashTransfer reproduit le message_hash TransferArgs', () => {
    // Rust test_message_hash_transfer : recipient=1, sender(position)=2, collateral=3, amount=4,
    // exp=5, salt=6, user_key=2629686405885377265612250192330550814166101744721025672593857097107510831364.
    const hash = hashTransfer(
      {
        recipientPositionId: 1n,
        senderPositionId: 2n,
        collateralId: 3n,
        amount: 4n,
        expiration: 5n,
        salt: 6n,
        userPublicKey:
          2629686405885377265612250192330550814166101744721025672593857097107510831364n,
      },
      'testnet',
    );
    // 0x56c7b21d13b79a33d7700dda20e22246c25e89818249504148174f527fc3f8f
    expect(`0x${hash.toString(16)}`).toBe(
      '0x56c7b21d13b79a33d7700dda20e22246c25e89818249504148174f527fc3f8f',
    );
  });

  it('hashWithdrawal utilise la struct WithdrawArgs (sélecteur distinct)', () => {
    // Le hash de struct WithdrawArgs (sans enveloppe) doit différer de TransferArgs : on vérifie au
    // moins qu'un sélecteur distinct est employé (l'enveloppe ajoute la clé publique).
    const args = {
      recipient: 0x019ec96d4aea6fdc6f0b5f393fec3f186aefa8f0b8356f43d07b921ff48aa5dan,
      positionId: 1n,
      collateralId: 4n,
      amount: 1000n,
      expiration: 5n,
      salt: 123n,
      userPublicKey: 42n,
    };
    const wHash = hashWithdrawal(args, 'testnet');
    const tHash = hashTransfer(
      {
        recipientPositionId: args.recipient,
        senderPositionId: args.positionId,
        collateralId: args.collateralId,
        amount: args.amount,
        expiration: args.expiration,
        salt: args.salt,
        userPublicKey: args.userPublicKey,
      },
      'testnet',
    );
    expect(wHash).not.toBe(tHash);
  });

  it('signMsgHash reproduit la signature ECDSA (r,s) de fast_stark_crypto', () => {
    const priv = '0x13ee6aa9b55c794a79e0bb4ef8e74e4e08b5637e873ef118cf5c01d83b701f6' as const;
    const msg = 2788960362996410178586013462192086205585543858281504820767681025777602529597n;
    const sig = signMsgHash(msg, priv);
    expect(sig.r).toBe('0x5309abab59280c0413b2e54ca1c4345421263cdd91683139a70daee837bf747');
    expect(sig.s).toBe('0x708de3f8bc4853ca15460700e333b02647e3d2eb30245fa42cf594443a52395');
  });

  it('starkPublicKey dérive la clé publique attendue', () => {
    const pub = starkPublicKey('0x13ee6aa9b55c794a79e0bb4ef8e74e4e08b5637e873ef118cf5c01d83b701f6');
    const norm = pub.startsWith('0x') ? pub : `0x${pub}`;
    expect(norm).toBe('0x5db6654e268c7335c6d73665d7ce3b146c6b14e700fd3b6114c688ad21c0e6f');
  });
});
