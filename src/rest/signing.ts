import {
  ethSigToPrivate,
  getStarkKey,
  pedersen,
  poseidonHashMany,
  keccak as snKeccak,
  sign as starkSign,
} from '@scure/starknet';
import {
  COLLATERAL_ASSET_ON_CHAIN_ID,
  SETTLEMENT_EXPIRATION_BUFFER_DAYS,
  STARKNET_DOMAIN,
} from '../common/constants';
import type { Network } from '../common/types';

/**
 * Signature **StarkEx perpetual** Extended (ex-X10), reproduite **fidèlement** depuis la lib Rust
 * officielle `fast_stark_crypto` (`rust-crypto-lib-base/src/starknet_messages.rs`, utilisée par le SDK
 * Python `x10xchange/python_sdk` via `get_order_msg_hash` &al.). Les structs `Order`/`LimitOrder`/
 * `TransferArgs`/`WithdrawArgs` sont hachées en **SNIP-12 révision 1** (Poseidon) puis enveloppées
 * `poseidon(['StarkNet Message', domain_hash, public_key, struct_hash])`.
 *
 * ✅ **VALIDÉ AU BIT PRÈS** contre `fast_stark_crypto` 0.5.0 : les 4 sélecteurs SNIP-12, le hash de
 * domaine `SN_SEPOLIA`, le hash d'ordre (montants positifs et négatifs, clé publique 251 bits) et la
 * signature ECDSA `(r,s)` reproduisent exactement la référence Rust/Python (vecteurs de test de
 * `starknet_messages.rs` + oracle live). Signer retenu : **JS pur** (`@scure/starknet`), pas de WASM.
 */

// ── Encodage SNIP-12 révision 1 (Poseidon) ───────────────────────────────────────────────────
// Référence : SNIP-12 (https://github.com/starknet-io/SNIPs/blob/main/SNIPS/snip-12.md) +
// `fast_stark_crypto/rust-crypto-lib-base/src/starknet_messages.rs`.
// rev. 1 : `poseidon('StarkNet Message', domain_hash, public_key, struct_hash)`.

/**
 * Type-hash SNIP-12 : `sn_keccak(typeString)`. Le `typeString` encode la struct, ses champs **et** les
 * définitions des types imbriqués référencés (`PositionId`/`AssetId`/`Timestamp`), concaténées dans
 * l'ordre du contrat StarkWare Perpetuals. Sélecteurs confirmés bit-pour-bit contre les vecteurs de
 * test Rust (`test_*_selector`).
 */
function selector(typeName: string): bigint {
  const typeString = TYPE_STRINGS[typeName];
  if (typeString === undefined) {
    throw new Error(`Type SNIP-12 inconnu : ${typeName}`);
  }
  return snKeccak(new TextEncoder().encode(typeString));
}

// Définitions des types imbriqués, appendues à chaque type-string (cf. `starknet_messages.rs`).
const NESTED_TYPES =
  '"PositionId"("value":"u32")"AssetId"("value":"felt")"Timestamp"("seconds":"u64")';

/**
 * Chaînes de type SNIP-12 rev-1 **canoniques** (reproduites depuis les `selector!(…)` Rust de
 * `starknet_messages.rs`). Format rev-1 : `"Struct"("f1":"t1",…)` suivi des types imbriqués.
 */
const TYPE_STRINGS: Record<string, string> = {
  StarknetDomain:
    '"StarknetDomain"("name":"shortstring","version":"shortstring","chainId":"shortstring","revision":"shortstring")',
  Order: `"Order"("position_id":"felt","base_asset_id":"AssetId","base_amount":"i64","quote_asset_id":"AssetId","quote_amount":"i64","fee_asset_id":"AssetId","fee_amount":"u64","expiration":"Timestamp","salt":"felt")${NESTED_TYPES}`,
  TransferArgs: `"TransferArgs"("recipient":"PositionId","position_id":"PositionId","collateral_id":"AssetId","amount":"u64","expiration":"Timestamp","salt":"felt")${NESTED_TYPES}`,
  WithdrawArgs: `"WithdrawArgs"("recipient":"ContractAddress","position_id":"PositionId","collateral_id":"AssetId","amount":"u64","expiration":"Timestamp","salt":"felt")${NESTED_TYPES}`,
};

/** Hash du domaine SNIP-12 rev-1 (`StarknetDomain{name,version,chainId,revision}`). */
function domainHash(network: Network): bigint {
  const d = STARKNET_DOMAIN[network];
  // rev-1 : poseidon([ type_hash, name, version, chain_id, revision ]).
  return poseidonHashMany([
    selector('StarknetDomain'),
    shortString(d.name),
    shortString(d.version),
    shortString(d.chainId),
    BigInt(d.revision),
  ]);
}

/** Encode une chaîne courte Cairo (≤ 31 octets) en felt (big-endian ASCII). */
function shortString(s: string): bigint {
  let acc = 0n;
  for (const ch of s) {
    acc = (acc << 8n) + BigInt(ch.charCodeAt(0));
  }
  return acc;
}

/** Borne un felt dans le champ Stark (mod p). */
const P = 2n ** 251n + 17n * 2n ** 192n + 1n;
function felt(x: bigint): bigint {
  const m = x % P;
  return m < 0n ? m + P : m;
}

/** Convertit une valeur (hex `0x…` ou décimale) en BigInt. */
export function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  return value.startsWith('0x') || value.startsWith('0X') ? BigInt(value) : BigInt(value);
}

// ── Hashes d'objets signés (champs ordonnés, cf. SDK Python) ──────────────────────────────────

/** Champs ordonnés d'un ordre StarkEx perpetual (cf. `get_order_msg_hash`). */
export interface OrderHashInput {
  positionId: bigint;
  baseAssetId: bigint; // synthetic settlement_external_id
  baseAmount: bigint; // entier scalé, signé (< 0 si SELL)
  quoteAssetId: bigint; // collateral settlement_external_id
  quoteAmount: bigint; // entier scalé, signé (< 0 si BUY)
  feeAmount: bigint; // entier scalé (>= 0)
  feeAssetId: bigint; // collateral settlement_external_id
  expiration: bigint; // expireTime (s) + buffer 14 j
  salt: bigint; // nonce
  userPublicKey: bigint; // clé publique Stark
}

/**
 * Hash d'ordre StarkEx perpetual. **Validé bit-pour-bit** contre `get_order_msg_hash`
 * (`fast_stark_crypto`). Ordre des champs de la struct `Order` (cf. `starknet_messages.rs`) :
 * `position_id, base_asset_id, base_amount, quote_asset_id, quote_amount, fee_asset_id, fee_amount,
 * expiration, salt`. La clé publique n'est **pas** dans la struct : elle entre uniquement dans
 * l'enveloppe SNIP-12. Les montants `i64`/`u64` négatifs (`base_amount`/`quote_amount` selon le sens)
 * sont réduits mod p par {@link felt} (équivalent `Felt::from(i64)` côté Rust).
 */
export function hashOrder(input: OrderHashInput, network: Network): bigint {
  const structHash = poseidonHashMany([
    selector('Order'),
    felt(input.positionId),
    felt(input.baseAssetId),
    felt(input.baseAmount),
    felt(input.quoteAssetId),
    felt(input.quoteAmount),
    felt(input.feeAssetId),
    felt(input.feeAmount),
    felt(input.expiration),
    felt(input.salt),
  ]);
  return snip12Envelope(structHash, input.userPublicKey, network);
}

/** Champs ordonnés d'un retrait (cf. `get_withdrawal_msg_hash`). */
export interface WithdrawalHashInput {
  recipient: bigint;
  positionId: bigint;
  amount: bigint;
  expiration: bigint;
  salt: bigint;
  userPublicKey: bigint;
  collateralId: bigint;
}

/**
 * Hash de retrait StarkEx perpetual (struct `WithdrawArgs`). Validé contre `get_withdrawal_msg_hash` :
 * `recipient(ContractAddress=felt), position_id, collateral_id, amount, expiration, salt`. La clé
 * publique n'entre que dans l'enveloppe.
 */
export function hashWithdrawal(input: WithdrawalHashInput, network: Network): bigint {
  const structHash = poseidonHashMany([
    selector('WithdrawArgs'),
    felt(input.recipient),
    felt(input.positionId),
    felt(input.collateralId),
    felt(input.amount),
    felt(input.expiration),
    felt(input.salt),
  ]);
  return snip12Envelope(structHash, input.userPublicKey, network);
}

/** Champs ordonnés d'un transfert (cf. `get_transfer_msg_hash`). */
export interface TransferHashInput {
  recipientPositionId: bigint;
  senderPositionId: bigint;
  amount: bigint;
  expiration: bigint;
  salt: bigint;
  userPublicKey: bigint;
  collateralId: bigint;
}

/**
 * Hash de transfert StarkEx perpetual (struct `TransferArgs`). Validé contre `get_transfer_msg_hash` :
 * `recipient(PositionId), position_id(PositionId), collateral_id, amount, expiration, salt`. La clé
 * publique n'entre que dans l'enveloppe.
 */
export function hashTransfer(input: TransferHashInput, network: Network): bigint {
  const structHash = poseidonHashMany([
    selector('TransferArgs'),
    felt(input.recipientPositionId),
    felt(input.senderPositionId),
    felt(input.collateralId),
    felt(input.amount),
    felt(input.expiration),
    felt(input.salt),
  ]);
  return snip12Envelope(structHash, input.userPublicKey, network);
}

/** Enveloppe SNIP-12 rev-1 : `poseidon(['StarkNet Message', domain_hash, account, struct_hash])`. */
function snip12Envelope(structHash: bigint, account: bigint, network: Network): bigint {
  return poseidonHashMany([
    shortString('StarkNet Message'),
    domainHash(network),
    felt(account),
    felt(structHash),
  ]);
}

// ── Signature ─────────────────────────────────────────────────────────────────────────────────

export interface StarkSignature {
  r: string;
  s: string;
}

/**
 * Signe un hash de message avec la clé privée Stark (`@scure/starknet` `sign`, ECDSA sur la courbe
 * Stark). Retourne `(r, s)` en hex `0x…`.
 */
export function signMsgHash(msgHash: bigint, privateKey: `0x${string}`): StarkSignature {
  const sig = starkSign(msgHash.toString(16), privateKey.slice(2));
  return { r: `0x${sig.r.toString(16)}`, s: `0x${sig.s.toString(16)}` };
}

/** Clé publique Stark dérivée de la clé privée (pour vérifier/compléter `l2PublicKey`). */
export function starkPublicKey(privateKey: `0x${string}`): string {
  const pk = privateKey.slice(2);
  return getStarkKey(pk);
}

// ── Onboarding EIP-712 → keypair L2 ─────────────────────────────────────────────────────────────

/**
 * Dérive la clé privée Stark L2 depuis une **signature EIP-712** (modèle `ethSigToPrivate` /
 * `generate_keypair_from_eth_signature` : grind sur l'ordre de la courbe Stark). La signature EIP-712
 * `AccountCreation{accountIndex,wallet,tosAccepted}` (domaine `EIP712Domain{name=signing_domain}`)
 * doit être produite par le wallet L1 (hors SDK, côté appelant), puis passée ici.
 *
 * **À VALIDER** : `ethSigToPrivate` de `@scure/starknet` applique le grind standard ; confirmer qu'il
 * correspond à `generate_keypair_from_eth_signature` du SDK Python (même algorithme de dérivation).
 */
export function l2KeyFromEthSignature(ethSignature: string): {
  privateKey: string;
  publicKey: string;
} {
  const privateKey = ethSigToPrivate(ethSignature);
  const publicKey = getStarkKey(privateKey);
  return { privateKey, publicKey };
}

/** Hash Pedersen `pedersen(l1Address, l2PublicKey)` signé en L2 lors de l'onboarding (cf. onboarding.py). */
export function onboardingL2MessageHash(l1Address: string, l2PublicKey: string): bigint {
  return BigInt(pedersen(toBigInt(l1Address), toBigInt(l2PublicKey)));
}

// ── Helpers d'expiration (cf. utils/date.py) ──────────────────────────────────────────────────

/** Expiration de settlement (secondes) = `ceil((expireTimeMs + bufferDays*86400_000)/1000)`. */
export function settlementExpiration(
  expireTimeMs: number,
  kind: keyof typeof SETTLEMENT_EXPIRATION_BUFFER_DAYS,
): bigint {
  const bufferMs = SETTLEMENT_EXPIRATION_BUFFER_DAYS[kind] * 86_400_000;
  return BigInt(Math.ceil((expireTimeMs + bufferMs) / 1000));
}

/** Id collatéral StarkEx par défaut (`0x1`). */
export const collateralId = (): bigint => toBigInt(COLLATERAL_ASSET_ON_CHAIN_ID);
