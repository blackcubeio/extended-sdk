# @blackcube/extended-sdk

SDK TypeScript pour **Extended** (ex-X10) — DEX de perpétuels sur **Starknet / StarkEx**.

> 🚧 **En construction** sur le moule des SDK DEX Blackcube (Hyperliquid / Aster / Pacifica / Lighter).
> Voir [`docs/blackcube/PLAYBOOK-SDK.md`](../docs/blackcube/PLAYBOOK-SDK.md) (racine Web3) pour le modèle,
> et [`doc/API-RESEARCH.md`](doc/API-RESEARCH.md) pour la cartographie de l'API Extended.

## Tout passe par la classe `Extended`

```ts
import { Extended } from '@blackcube/extended-sdk';

// Lectures publiques (X-Api-Key + User-Agent requis)
const dex = new Extended({ desk: { apiKey: '…', network: 'mainnet' } }, { default: 'desk' });
await dex.perp().getPairs();
await dex.perp().getCandles({ name: 'BTC-USD', interval: '1h', limit: 100 });

// Trading (signature Stark sur le settlement de l'ordre)
await dex.perp().place({ name: 'BTC-USD', side: 'buy', type: 'limit', size: '0.001', price: '30000', tif: 'gtc' });
await dex.account().getPositions();
```

## Surface

- **Commun** (portable, identique aux autres SDK) : `perp()` / `account()` / `transfers()` / `ws()`. Extended est **perp-only** (*absent : `spot()`*).
- **Natif** (spécifique Extended) : `native.<capacité>()` (sous-comptes, vault de rendement, builder codes, …).

## Spécificités Extended

- **Auth** : `X-Api-Key` (lecture) + **signature Stark SNIP-12** sur le settlement des écritures
  (ordres/transferts/retraits). `User-Agent` **obligatoire** (REST et WS). Onboarding EIP-712 → keypair L2 Stark.
- **Signature** : hash StarkEx perpetual (`get_order_msg_hash`) ; scaling entier via `l2Config` de `/info/markets`.
  Signer JS pur (`@scure/starknet`) **validé sur testnet réel (2026-06-01)** : reproduit `fast_stark_crypto`
  au bit près et accepté par le serveur (ordre placé/accepté/annulé). Signer WASM officiel disponible en secours.
- **WebSocket** : souscription **par path** (1 channel = 1 connexion, SNAPSHOT/DELTA). Kill-switch via `auto-cancel`.
- Marchés : symbole hyphené `BTC-USD`.

## Licence
BSD-3-Clause — Blackcube.
