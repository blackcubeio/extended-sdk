// Types **natifs** Extended (shapes brutes renvoyées par l'API REST `/api/v1`). Internes : seuls les
// converters les lisent ; la façade n'expose que les types unifiés Blackcube (`./types`). Tout champ
// non modélisé reste accessible via index signature et atterrit dans `xtras`.

/**
 * Enveloppe standard Extended : `status` `"OK"`/`"ERROR"`, `data` la charge utile, `error` détaillant
 * une erreur applicative, `pagination` pour les listes paginées.
 */
export interface ExtendedEnvelope<T = unknown> {
  status?: string;
  data?: T;
  error?: { code?: number | string; message?: string } | null;
  pagination?: { cursor?: string | null; count?: number } | null;
  [extra: string]: unknown;
}

/** Config L2 d'un marché (`l2Config`) : ids/résolutions StarkEx pour le scaling et la signature. */
export interface NativeL2Config {
  type?: string;
  collateralId: string;
  collateralResolution: number;
  syntheticId: string;
  syntheticResolution: number;
  [extra: string]: unknown;
}

/** Stats d'un marché (`marketStats`). Tous décimaux en **chaînes**. */
export interface NativeMarketStats {
  dailyVolume?: string;
  dailyVolumeBase?: string;
  dailyPriceChange?: string;
  dailyLow?: string;
  dailyHigh?: string;
  lastPrice?: string;
  askPrice?: string;
  bidPrice?: string;
  markPrice?: string;
  indexPrice?: string;
  fundingRate?: string;
  nextFundingRate?: number | string;
  openInterest?: string;
  openInterestBase?: string;
  [extra: string]: unknown;
}

/** Config de trading d'un marché (`tradingConfig`). */
export interface NativeTradingConfig {
  minOrderSize?: string;
  minOrderSizeChange?: string;
  minPriceChange?: string;
  maxMarketOrderValue?: string;
  maxLimitOrderValue?: string;
  maxPositionValue?: string;
  maxLeverage?: string;
  maxNumOrders?: number;
  [extra: string]: unknown;
}

/** Marché perp (`/info/markets`). `name` hyphené (`BTC-USD`). */
export interface NativeMarket {
  name: string;
  assetName?: string;
  collateralAssetName?: string;
  assetPrecision?: number;
  collateralAssetPrecision?: number;
  active?: boolean;
  status?: string;
  marketStats?: NativeMarketStats;
  tradingConfig?: NativeTradingConfig;
  l2Config?: NativeL2Config;
  [extra: string]: unknown;
}

/** Bougie native (`/info/candles/{m}/{type}`). `T` = open time ms ; `o/h/l/c/v`. */
export interface NativeCandle {
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  T: number;
  [extra: string]: unknown;
}

/** Niveau de carnet natif (`/info/markets/{m}/orderbook`). */
export interface NativeBookLevel {
  qty: string;
  price: string;
  [extra: string]: unknown;
}

/** Carnet natif (`data.bid[]` / `data.ask[]`). */
export interface NativeOrderBook {
  market?: string;
  bid?: NativeBookLevel[];
  ask?: NativeBookLevel[];
  [extra: string]: unknown;
}

/** Trade public natif (`/info/markets/{m}/trades`) — clés courtes. */
export interface NativeTrade {
  i?: number;
  m?: string;
  S?: string; // side BUY/SELL
  tT?: string; // trade type
  T: number; // timestamp ms
  p: string; // price
  q: string; // qty
  [extra: string]: unknown;
}

/** Point de funding natif (`/info/{m}/funding`). */
export interface NativeFunding {
  m?: string;
  T: number; // timestamp ms
  f: string; // funding rate
  [extra: string]: unknown;
}

/** Solde de compte natif (`/user/balance`). */
export interface NativeBalance {
  collateralName?: string;
  balance?: string;
  equity?: string;
  availableForTrade?: string;
  availableForWithdrawal?: string;
  unrealisedPnl?: string;
  [extra: string]: unknown;
}

/** Position native (`/user/positions`). */
export interface NativePosition {
  market: string;
  side?: string; // LONG/SHORT
  size?: string;
  value?: string;
  openPrice?: string;
  markPrice?: string;
  liquidationPrice?: string;
  unrealisedPnl?: string;
  realisedPnl?: string;
  leverage?: string;
  margin?: string;
  [extra: string]: unknown;
}

/** Ordre de compte natif (`/user/orders`, `/user/orders/history`). */
export interface NativeOrder {
  id?: number | string;
  externalId?: string;
  market: string;
  type?: string; // LIMIT/MARKET/CONDITIONAL/TPSL/TWAP
  side?: string; // BUY/SELL
  status?: string;
  price?: string;
  qty?: string;
  filledQty?: string;
  reduceOnly?: boolean;
  postOnly?: boolean;
  timeInForce?: string;
  createdTime?: number;
  updatedTime?: number;
  [extra: string]: unknown;
}

/** Fill (user trade) natif (`/user/trades`). */
export interface NativeUserTrade {
  id?: number | string;
  orderId?: number | string;
  market: string;
  side?: string;
  price?: string;
  qty?: string;
  fee?: string;
  feeAsset?: string;
  isTaker?: boolean;
  realisedPnl?: string;
  createdTime?: number;
  [extra: string]: unknown;
}
