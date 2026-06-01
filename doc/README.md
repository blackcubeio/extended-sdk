# @blackcube/extended-sdk — Documentation

SDK TypeScript pour l'exchange **Extended** (ex-X10) — DEX de perpétuels sur **Starknet / StarkEx**.
Tout passe par la classe **`Extended`** — voir le [README](../README.md) pour la surface complète
(scopes `perp`/`account`/`transfers`/`ws` + namespace `native`, REST vs WebSocket, exemples).
Extended est **perp-only** (*absent : `spot()`*).

## Sommaire

- [README](../README.md) — la classe `Extended`, les scopes, REST vs WebSocket, exemples.
- [Surface commune](./common.md) — le **contrat unifié** (identique sur les 4 SDK Blackcube).
- [Surface native](./native.md) — les capacités **spécifiques à Extended** (`dex.native.<cap>()` :
  `signing` / `subAccounts` / `vault` / `builder`).
- [Signing](./signing.md) — signature **StarkEx** (onboarding EIP-712 → keypair L2, hash d'ordre/
  retrait/transfert, SNIP-12), courbe Stark en JS pur, **validée sur testnet réel** (ordre placé/
  accepté/annulé ; reproduit `fast_stark_crypto` au bit près).
- [API-RESEARCH](./API-RESEARCH.md) — cartographie de l'API REST/WS Extended (référence interne).

## Rappel : REST vs WebSocket

- **REST** (`perp()`, `account()`, `transfers()`) — **requête → réponse** : tu `await`, tu reçois une
  valeur.
- **WebSocket** (`ws()`) — **abonnement → flux** : un handler rappelé à chaque mise à jour, jusqu'au
  désabonnement. Socket ouvert au 1er `subscribe`, fermé au dernier `unsubscribe`.

Tous les retours sont au **format unifié Blackcube**, identique entre les SDK Aster / Hyperliquid /
Pacifica / Lighter / Extended.
