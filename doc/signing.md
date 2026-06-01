# Signature StarkEx — Extended SDK

> ✅ **Validé sur testnet réel le 2026-06-01.** La reproduction JS pure du hash StarkEx perpetual
> (`@scure/starknet`) reproduit `fast_stark_crypto` **au bit près** (vérifié contre les vecteurs Rust) **et**
> est **acceptée par le serveur testnet** : après corrections (avant : `1101 Invalid StarkEx signature`), un
> ordre est placé/accepté/annulé (cycle réel). Le signer WASM reste une bascule de secours, mais n'est plus
> nécessaire pour le trading. Voir « Statut » en bas pour les limites résiduelles.

Extended (ex-X10) est un perp DEX sur **Starknet/StarkEx**. Les écritures (ordres, transferts, retraits)
sont signées avec une **clé Stark L2** ; l'authentification REST passe par le header `X-Api-Key`
(+ `User-Agent` obligatoire sur REST **et** WS).

## Chaîne de signature (cf. SDK Python `x10xchange/python_sdk`)

1. **Onboarding** (`signing/onboarding.py`) : le wallet L1 signe un message **EIP-712**
   `AccountCreation{accountIndex,wallet,tosAccepted}` (domaine `EIP712Domain{name = signing_domain}`).
   `generate_keypair_from_eth_signature` (grind sur l'ordre de la courbe Stark) en dérive la **keypair
   L2**. Côté SDK : `native.signing().deriveL2Key({ ethSignature })` (via `ethSigToPrivate`).
   Le message L2 d'onboarding signé est `pedersen(l1Address, l2PublicKey)`.

2. **Hash d'ordre** (`signing/order_object_settlement.py` → `get_order_msg_hash` de la lib Rust
   `fast_stark_crypto`). Champs **ordonnés** :
   `position_id`, `base_asset_id` (= `l2Config.syntheticId`), `base_amount` (entier scalé par
   `syntheticResolution`, **< 0 si SELL**), `quote_asset_id` (= `l2Config.collateralId`), `quote_amount`
   (= `size*price` scalé par `collateralResolution`, **< 0 si BUY**), `fee_amount` (= `taker_fee*quote`,
   scalé, ROUND_UP), `fee_asset_id` (collatéral), `expiration` (= `ceil((expireTimeMs + 14 j)/1000)`),
   `salt` (= nonce), `user_public_key`, **+ domaine SNIP-12** (`Perpetuals`/`v0`/`SN_MAIN|SN_SEPOLIA`/
   rév. `1`). Arrondis : BUY → ROUND_UP, SELL → ROUND_DOWN, fee → ROUND_UP.

3. **Settlement** envoyé : `{ signature:{r,s}, starkKey: l2PublicKey, collateralPosition: vaultId }`.

4. **Retrait** (`signing/withdrawal_object.py`, buffer **15 j**) et **transfert**
   (`signing/transfer_object.py`, buffer **21 j**) suivent le même schéma avec `get_withdrawal_msg_hash`
   / `get_transfer_msg_hash` (champs `recipient`/`position_id`/`collateral_id`/`amount`/`expiration`/
   `salt`/`user_public_key`).

## Implémentation JS (ce SDK)

`src/rest/signing.ts` reproduit l'encodage **SNIP-12 révision 1** (Poseidon) via `@scure/starknet`
(`poseidonHashMany` + `sn_keccak` pour les type-hashes + `sign`/`getStarkKey`/`pedersen`/`ethSigToPrivate`) :

- `hashOrder` / `hashWithdrawal` / `hashTransfer` : struct-hash `poseidon([typeHash, …champs])` puis
  enveloppe `poseidon(['StarkNet Message', domainHash, account, structHash])`.
- `signMsgHash(hash, l2PrivateKey)` → `(r,s)`.
- Scaling entier : `scaleToStark(value, resolution, rounding)` en **BigInt** (pas de flottant), `resolution`
  venant de `l2Config` (`/info/markets`, mis en cache par réseau dans la façade).

### Ce qui est validé (les inconnues du hash levées le 2026-06-01)

1. **Type-strings SNIP-12** (`TYPE_STRINGS` dans `signing.ts`) : les chaînes de type des structs
   `Order` / `TransferArgs` / `StarknetDomain` du **contrat StarkWare Perpetuals** sont désormais les
   **vrais sélecteurs canoniques validés** — **plus des placeholders** : confirmés à la fois contre les
   vecteurs Rust `fast_stark_crypto` (au bit près) et par l'acceptation serveur d'un ordre testnet.
2. **Encodage des montants signés** (felt négatif = `p - x`) et de l'expiration (felt brut) : validés.
3. **Dérivation onboarding** : équivalence `ethSigToPrivate` ↔ `generate_keypair_from_eth_signature`
   reproduite, mais voir limite résiduelle ci-dessous (flux onboarding/retrait/transfert non exercé réseau).

## Bascule signer WASM (secours, non requise)

Le code reste structuré pour brancher le **signer WASM officiel** `stark-crypto-wrapper-js` (modèle
Lighter : une instance WASM lazy par réseau, capture des fonctions `Sign*`) **sans changer la surface**
des fonctions REST (`placeOrder`/`withdraw`/`transfer` prennent un `SigningCtx` ; seul le calcul du hash
+ `(r,s)` changerait). Le hash JS pur étant validé, cette bascule n'est **plus nécessaire** pour le
trading ; elle reste disponible (`wasm/` + `setWasmDir`) en cas de besoin futur.

## Statut

- **Validé sur testnet réel le 2026-06-01** — signature **ordre** : reproduit `fast_stark_crypto` au bit
  près (vecteurs Rust) **et** acceptée par le serveur (ordre placé/accepté/annulé, cycle réel).
- **Scaling, ordre des champs, buffers d'expiration, signes BUY/SELL, domaine SNIP-12, type-hashes
  SNIP-12 + enveloppe finale** : implémentés en JS pur et validés (vecteurs + serveur).

### Limites résiduelles honnêtes

- **Retrait** (`get_withdrawal_msg_hash`) et **transfert** (`get_transfer_msg_hash`) : validés **contre les
  vecteurs** `fast_stark_crypto`, mais **non exercés sur le réseau** (pas de retrait/transfert effectué
  testnet dans ce cycle).
- **Onboarding** (`deriveL2Key` / `ethSigToPrivate`) : équivalence reproduite, **non exercée réseau**
  (dérivation testée localement, pas de création de compte sur le serveur).
