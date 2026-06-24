// Types unifiés Extended — **identiques** aux autres SDK DEX Blackcube (cf. doc/common.md). Le cœur
// (Order/Trade/Candle/Price/Pair/OrderBook/Position/Balance/UserTrade/FundingRate/Side/MarketKind/Ack)
// est partagé bit pour bit avec Paradex/Hyperliquid/Lighter/Aster/Pacifica. Les shapes natives
// Extended (REST brut) vivent dans `common/native.ts` ; seuls les converters les lisent.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Network = 'mainnet' | 'testnet';
export type Side = 'buy' | 'sell';
export type MarketKind = 'perp' | 'spot';

/**
 * Signer **Extended** (ex-X10) : compte StarkEx perpetual sur Starknet/StarkEx.
 *
 * - `apiKey` : clé d'API Extended, envoyée dans le header `X-Api-Key` (lectures privées + écritures).
 * - `l2PrivateKey` / `l2PublicKey` : keypair **Stark L2** (clé privée signe les ordres/transferts/
 *   retraits en SNIP-12 ; clé publique = `starkKey` du settlement). Obtenues par onboarding EIP-712
 *   (`AccountRegistration` → `ethSigToPrivate` → grind sur l'ordre Stark).
 * - `vaultId` : **position id** entier StarkEx (`collateralPosition` / `source_position_id`),
 *   fourni par l'API de management du compte.
 * - `network` : porté par le signer (mainnet `SN_MAIN` / testnet `SN_SEPOLIA` coexistent par label).
 */
export interface Signer {
  /** Clé d'API Extended (header `X-Api-Key`). */
  apiKey: string;
  /** Clé privée Stark L2 (`0x` + hex) — signe ordres/transferts/retraits. */
  l2PrivateKey: `0x${string}`;
  /** Clé publique Stark L2 (`0x` + hex) — `starkKey` du settlement. */
  l2PublicKey: `0x${string}`;
  /** Position id StarkEx (collatéral) — entier ou chaîne décimale. */
  vaultId: number | string;
  network: Network;
}

// ── Entrées (Params) — `kind` porté par le scope, pas dans les params ──
export interface CandlesParams {
  name: string;
  interval: string;
  startTime?: string; // datetime UTC "YYYY-MM-DD HH:MM:SS" (C7)
  endTime?: string; // datetime UTC "YYYY-MM-DD HH:MM:SS" (C7)
  limit?: number;
}
export interface OrderBookParams {
  name: string;
  limit?: number;
}
export interface TradesParams {
  name: string;
  limit?: number;
}
export interface FundingParams {
  name: string;
  startTime?: string; // datetime UTC "YYYY-MM-DD HH:MM:SS" (C7)
  endTime?: string; // datetime UTC "YYYY-MM-DD HH:MM:SS" (C7)
  limit?: number;
}
export interface SymbolParams {
  name: string;
}
/** Un take-profit partiel d'une protection (déclenchement + taille ; `price` = borne d'exécution). */
export interface ProtectionTp {
  triggerPrice: string;
  size: string;
  /** Prix limite/borne de l'ordre déclenché (HL l'exige ; Aster l'ignore — conditionnel market). */
  price?: string;
}

/**
 * Entrée `placeProtection` : SL plein + N TPs partiels (reduce-only) sur une position EXISTANTE.
 * `side` = sens de la POSITION (les ordres sont posés au sens OPPOSÉ). Tailles + `price` (borne)
 * fournis par l'appelant — pas de recalcul interne (anti-résidu garanti côté appelant).
 */
export interface PlaceProtectionParams {
  name: string;
  side: Side;
  sl: { triggerPrice: string; size: string; price?: string };
  tps: ProtectionTp[];
  clientId?: string;
}

export interface PlaceOrderParams {
  name: string;
  side: Side;
  type: 'limit' | 'market' | 'stop' | 'stopMarket' | 'takeProfit' | 'takeProfitMarket';
  size: string;
  price?: string;
  triggerPrice?: string;
  tif?: 'gtc' | 'ioc' | 'fok' | 'alo';
  reduceOnly?: boolean;
  clientId?: string;
}
export interface CancelOrderParams {
  name: string;
  id?: string;
  clientId?: string;
}
export interface CancelAllParams {
  name?: string;
}
export interface EditOrderParams {
  name: string;
  id?: string;
  clientId?: string;
  side: Side;
  size: string;
  price?: string;
}
export interface LeverageParams {
  name: string;
  leverage: number;
}
export interface WithdrawParams {
  amount: string;
  address?: string;
  asset?: string;
  [extra: string]: unknown;
}

// ── Sorties (Output) unifiées ──
export interface Pair {
  name: string;
  base: string;
  quote: string;
  kind: MarketKind;
  szDecimals: number;
  maxLeverage?: number;
  tickSize?: string;
  stepSize?: string;
  minNotional?: string;
  status?: string;
  xtras?: Record<string, unknown>;
}
export interface Candle {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
  kind: MarketKind;
  qv: string | null;
  tbbv: string | null;
  tbqv: string | null;
  xtras?: Record<string, unknown>;
}
export interface OrderBookLevel {
  price: string;
  size: string;
  n: number | null;
}
export interface OrderBook {
  name: string;
  kind: MarketKind;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  time: number | null;
  xtras?: Record<string, unknown>;
}
export interface Price {
  name: string;
  kind: MarketKind;
  mark: string | null;
  oracle: string | null;
  mid: string | null;
  bid: string | null;
  ask: string | null;
  last: string | null;
  funding: string | null;
  openInterest: string | null;
  volume24h: string | null;
  prevDayPrice: string | null;
  time: number | null;
  xtras?: Record<string, unknown>;
}
export interface FundingRate {
  name: string;
  fundingRate: string;
  time: number;
  xtras?: Record<string, unknown>;
}
export interface Trade {
  price: string;
  size: string;
  side: Side | null;
  maker: boolean | null;
  time: number;
  id: number | null;
  xtras?: Record<string, unknown>;
}
export interface Order {
  name: string;
  kind: MarketKind;
  id: string;
  clientId: string | null;
  side: Side;
  type:
    | 'limit'
    | 'market'
    | 'stop'
    | 'stopMarket'
    | 'takeProfit'
    | 'takeProfitMarket'
    | 'trailingStop'
    | 'other';
  price: string | null;
  size: string;
  filled: string;
  status: 'open' | 'partiallyFilled' | 'filled' | 'canceled' | 'rejected' | 'expired' | 'other';
  tif: 'gtc' | 'ioc' | 'fok' | 'alo' | null;
  reduceOnly: boolean | null;
  time: number;
  xtras?: Record<string, unknown>;
}
export interface Position {
  name: string;
  side: 'long' | 'short' | null;
  size: string;
  entryPrice: string | null;
  markPrice: string | null;
  unrealizedPnl: string | null;
  leverage: number | null;
  liquidationPrice: string | null;
  margin: string | null;
  xtras?: Record<string, unknown>;
}
export interface UserTrade {
  name: string;
  kind: MarketKind;
  id: string;
  orderId: string;
  side: Side;
  price: string;
  size: string;
  fee: string;
  feeAsset: string | null;
  pnl: string | null;
  maker: boolean | null;
  time: number;
  xtras?: Record<string, unknown>;
}
export interface Balance {
  asset: string;
  total: string;
  available: string | null;
  usdValue: string | null;
  xtras?: Record<string, unknown>;
}
export interface SubAccount {
  address: string;
  xtras?: Record<string, unknown>;
}
/** Accusé d'une écriture signée sans retour plus riche ; `xtras` = réponse native complète. */
export interface Ack {
  ok: boolean;
  xtras: Record<string, unknown>;
}

export type QueryValue = string | number | boolean;
export type QueryParams = Record<string, QueryValue | undefined>;
