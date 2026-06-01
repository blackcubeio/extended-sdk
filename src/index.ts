// ── Surface publique du SDK Extended (ex-X10) ─────────────────────────────────────────────────
// Point d'entrée unique : la classe `Extended`. Tout le reste (fonctions REST, clients WS bruts,
// signing StarkEx, types natifs) est interne.

/**
 * Façade : `new Extended(signers, { default })` puis scopes communs `.perp()` / `.account()` /
 * `.transfers()` / `.ws()`, et surplus spécifique via le namespace `.native.<cap>()`
 * (`signing` / `subAccounts` / `vault` / `builder`). Extended est **perp-only**.
 */
export { Extended, type ExtendedDexOptions } from './dex/extended';

/** Constructeur de contexte isolé (lectures publiques sans signer : `init({})`). */
export { init, type InitOptions, type ExtendedClient } from './common/config';

/** Constantes documentées (valeurs runtime, pas que des types). */
export {
  REST_URLS,
  WS_URLS,
  ONBOARDING_URLS,
  STARKNET_DOMAIN,
  SIGNING_DOMAIN,
  COLLATERAL_DECIMALS,
  DEFAULT_TAKER_FEE,
  USER_AGENT,
} from './common/constants';

/** Helpers de signature StarkEx (dérivation keypair L2, hash onboarding) — valeurs runtime. */
export { l2KeyFromEthSignature, onboardingL2MessageHash, starkPublicKey } from './rest/signing';

/** Contrat commun aux DEX : interfaces de capacités + types d'entrée (`…Params`). */
export type * from './dex/contract';

/** Interfaces **complémentaires** Extended (signing / subAccounts / vault / builder). */
export type * from './dex/native-contract';

/** Configuration d'un signer (passé au constructeur) et réseau. */
export type { Signer, Network } from './common/types';

/** Types **de sortie** unifiés renvoyés par les méthodes de la façade. */
export type {
  Ack,
  Balance,
  Candle,
  FundingRate,
  MarketKind,
  Order,
  OrderBook,
  OrderBookLevel,
  Pair,
  Position,
  Price,
  Side,
  SubAccount,
  Trade,
  UserTrade,
} from './common/types';

/** Unsubscribe : valeur de retour des souscriptions WS. */
export type { Unsubscribe } from './common/ws';
