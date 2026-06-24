import type {
  Ack,
  Balance,
  Candle,
  FundingRate,
  Order,
  OrderBook,
  Pair,
  Position,
  Price,
  Side,
  Trade,
  UserTrade,
} from '../common/types';
import type { Unsubscribe } from '../common/ws';

/**
 * Contrat **commun aux DEX Blackcube** (Aster / Hyperliquid / Pacifica / Lighter / Paradex / Extended).
 * Décomposé en interfaces par **capacité** : chaque DEX implémente celles qu'il possède. Ces interfaces
 * sont **identiques** entre dépôts (copiées) ; on ne les étend que par ajout (jamais de signature
 * divergente).
 *
 * Les types métier (`Candle`, `Order`…) sont les types **unifiés Blackcube**. Le `kind` (perp/spot)
 * n'est PAS dans les params : il est porté par le **scope** (`dex.perp()` / `dex.spot()`). Extended est
 * **perp-only** : seul `dex.perp()` existe.
 */

// ── Paramètres (sans `kind` : le scope le porte) ──────────────────────────────

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

// ── Capacités MARCHÉ (retournées par perp()) ──────────────────────────────────

/** Données de marché publiques. */
export interface IMarketData {
  getPairs(): Promise<Pair[]>;
  getCandles(query: CandlesParams): Promise<Candle[]>;
  getOrderBook(query: OrderBookParams): Promise<OrderBook>;
  getPrices(): Promise<Price[]>;
  getFundingHistory(query: FundingParams): Promise<FundingRate[]>;
}

/** Métadonnées de marché du produit (infos d'échange brutes). */
export interface IMarketMeta {
  /** Brut volontaire — passe-plat de `/info/markets` ; pas de forme commune cross-DEX. */
  getExchangeInfo(): Promise<unknown>;
}

/** Historique de trades publics en REST. */
export interface IPublicTrades {
  getTrades(query: TradesParams): Promise<Trade[]>;
}

/** Un take-profit partiel d'une protection (déclenchement + taille ; `price` = borne d'exécution). */
export interface ProtectionTp {
  triggerPrice: string;
  size: string;
  price?: string;
}

/**
 * Entrée `placeProtection` : pose, sur une position EXISTANTE, un stop-loss plein + N take-profits
 * partiels (reduce-only). `side` = sens de la POSITION ; les ordres sont posés au sens OPPOSÉ. Les
 * tailles sont fournies par l'appelant (somme des TPs = couvert ; le SL couvre le restant) — pas de
 * recalcul interne → c'est l'appelant qui garantit l'absence de résidu.
 */
export interface PlaceProtectionParams {
  name: string;
  side: 'buy' | 'sell';
  sl: { triggerPrice: string; size: string; price?: string };
  tps: ProtectionTp[];
  clientId?: string;
}

/** Placement/annulation/édition d'ordres + levier. */
export interface ITrading {
  place(input: PlaceOrderParams): Promise<Order>;
  cancel(input: CancelOrderParams): Promise<void>;
  cancelAll(input: CancelAllParams): Promise<{ cancelled: number | null }>;
  /**
   * Pose SL + N TPs (reduce-only) sur une position EXISTANTE, en un lot. Mécanisme natif par DEX.
   */
  placeProtection(input: PlaceProtectionParams): Promise<Order[]>;
  /** Annule la protection (SL/TPs reduce-only) de la paire — à appeler avant de la re-poser. */
  cancelProtection(input: { name: string }): Promise<void>;
  /**
   * Modifie un ordre et renvoie `{ name, id }`. Extended traite l'édition comme un place avec
   * `cancelId` (remplacement) ; l'état complet doit être relu (`getOpens`).
   */
  edit(input: EditOrderParams): Promise<{ name: string; id: string }>;
  updateLeverage(input: LeverageParams): Promise<unknown>;
}

// ── Compte PAR PRODUIT (retourné par perp()) ──────────────────────────────────

/** Lectures de compte liées au produit, portées par le scope marché. */
export interface IProductAccount {
  getPositions(query?: SymbolParams): Promise<Position[]>;
  getOpens(query?: SymbolParams): Promise<Order[]>;
  getUserTrades(query?: SymbolParams): Promise<UserTrade[]>;
  /** Brut volontaire — passe-plat de la réponse native ; pas de forme commune cross-DEX. */
  getAccountInfo(): Promise<unknown>;
}

/** Historique des ordres du produit. */
export interface IOrderHistory {
  getHistory(query?: SymbolParams): Promise<Order[]>;
}

// ── Capacités COMPTE TRANSVERSE (retournées par account()) ────────────────────

/** Compte transverse (sans notion de produit) : soldes + retrait. */
export interface IAccount {
  getBalances(): Promise<Balance[]>;
  /** Retrait. Renvoie un {@link Ack} commun (`ok` + `xtras` = réponse native complète, rien jeté). */
  withdraw(input: WithdrawParams): Promise<Ack>;
}

/**
 * Endpoint d'un transfert Extended — **narrowé** : collatéral USD vers un autre compte/sous-compte par
 * **vault id** (position id). Le compilateur refuse les routes inexistantes → pas de throw runtime.
 */
export interface TransferParams {
  to: { vault: string; publicKey: string };
  amount: string;
}

/** **LE** domaine pour bouger des fonds. */
export interface ITransfers {
  transfer(params: TransferParams): Promise<unknown>;
}

/**
 * **Kill-switch / dead-man's switch serveur** : annule TOUS les ordres après `afterMs` ms de silence,
 * à rafraîchir périodiquement. Extended l'offre via `/user/orders/auto-cancel`. Jamais simulé côté
 * client (mourrait avec le process).
 */
export interface IDeadManSwitch {
  /** Arme/rafraîchit l'annulation auto de tous les ordres après `afterMs` ms sans nouvel appel. */
  armCancelAll(afterMs: number): Promise<unknown>;
  /** Désarme le kill-switch. */
  disarm(): Promise<unknown>;
}

// ── Capacités TEMPS RÉEL (retournées par ws()) ────────────────────────────────
// Pas de connect/disconnect : lazy-connect au 1er subscribe, auto-close au dernier unsubscribe.

/** Souscriptions temps réel communes. */
export interface IRealtime {
  subscribeCandles(query: { name: string; interval: string }, cb: (c: Candle) => void): Unsubscribe;
  subscribeOrderBook(query: { name: string }, cb: (b: OrderBook) => void): Unsubscribe;
  subscribeTrades(query: { name: string }, cb: (t: Trade) => void): Unsubscribe;
  subscribeBbo(query: { name: string }, cb: (b: OrderBook) => void): Unsubscribe;
  subscribePrices(cb: (p: Price[]) => void): Unsubscribe;
  subscribeOrders(cb: (o: Order) => void): Unsubscribe;
  subscribeUserTrades(cb: (t: UserTrade) => void): Unsubscribe;
  /**
   * Bougies 1m de TOUT le marché en UNE souscription (flux de prix agrégé reconstruit par symbole) : close exact,
   * OHLC échantillonné, volume non porté par le flux agrégé → `0`. Évite N souscriptions `@candle` (cap/throttle
   * par connexion + crawl de re-souscription au reconnect). Commune aux DEX (chaque venue son adaptateur).
   */
  subscribeAllCandles(cb: (c: Candle) => void): Unsubscribe;
}

/** Souscription aux positions (Extended a un flux `/account`). */
export interface IRealtimePositions {
  subscribePositions(cb: (p: Position) => void): Unsubscribe;
}

export type { Ack };
