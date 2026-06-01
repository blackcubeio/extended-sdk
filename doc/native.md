# Surplus natif — Extended SDK

Le surplus spécifique à Extended vit sous `dex.native.<capacité>(label?)`, qui **miroite** les scopes
communs. Vocabulaire et verbes alignés sur les autres SDK Blackcube quand le geste existe ailleurs.

## `dex.native.signing(label?)` — `ISigning`

Onboarding StarkEx (dérivation de la keypair Stark L2).

- `deriveL2Key({ ethSignature })` → `{ privateKey, publicKey }`. Dérive la clé Stark L2 depuis une
  **signature EIP-712** (`AccountCreation{accountIndex,wallet,tosAccepted}`, domaine
  `EIP712Domain{name = signing_domain}`) produite par le **wallet L1** (hors SDK). Repose sur
  `ethSigToPrivate` (`@scure/starknet`). Équivalence avec `generate_keypair_from_eth_signature` du SDK
  Python officiel **reproduite** (validée localement) ; **limite résiduelle** : flux onboarding **non
  exercé sur le réseau** (pas de création de compte serveur dans le cycle de validation du 2026-06-01).

Helpers libres exportés en complément : `l2KeyFromEthSignature`, `onboardingL2MessageHash`
(`pedersen(l1Address, l2PublicKey)`), `starkPublicKey`.

## `dex.native.subAccounts(label?)` — `ISubAccountsAdmin`

- `create({ description? })` → `Ack`. **Non finalisé** : la création de sous-compte exige la signature
  L2 d'onboarding (action SNIP `CREATE_SUB_ACCOUNT`) + payload de management ; la méthode **rejette**
  explicitement tant que ce flux n'est pas validé sur testnet (pas de réponse mensongère). La **liste**
  des sous-comptes se lit via le compte (`/user/accounts`).

## `dex.native.vault(label?)` — `IVault`

Vault de rendement Extended (`/user/vault/*`).

- `getPerformance()` / `getSummary()` → `unknown` (brut volontaire — pas de forme commune cross-DEX).

## `dex.native.builder()` — `IBuilder`

Builder codes (frais d'intégrateur).

- `setDefault({ builderId, builderFee })` : configure le builder code appliqué aux placements signés.
- `current()` → `BuilderInfo | null`.

> Note : `builder()` ne prend pas de `label` (configuration portée par l'instance de façade).
