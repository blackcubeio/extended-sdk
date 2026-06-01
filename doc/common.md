# Surface commune (unifiée) — partagée par les 4 SDK Blackcube

Cette page décrit le **contrat unifié** partagé par `@blackcube/aster-sdk`, `@blackcube/hyperliquid-sdk`,
`@blackcube/pacifica-sdk` et `@blackcube/lighter-sdk`. L'**invariant** : mêmes **scopes**, mêmes **noms**,
même **vocabulaire** et mêmes **formes de types** (`…Params` en entrée, types de sortie communs) d'un SDK à
l'autre. Deux natures de **divergence assumée par conception**, toujours **annotées au cas par cas** dans les
tableaux/sections :

1. **Disponibilité par capacité** — un scope ou une méthode n'existe que si le DEX l'offre réellement
   (jamais de `throw « non supporté »` ; absences notées `*(absent : …)*`).
2. **Narrowing de type par DEX** — quand une venue n'accepte qu'une partie d'une entrée, le **type** est
   restreint à ce qu'elle supporte (le compilateur refuse le reste, aucun `throw` au runtime). Ex. : la/les
   route(s) de `transfer()`, ou le `type` d'ordre de `place()`. Cf. la section concernée.

> Les prix/quantités sont des **chaînes décimales** ; `xtras` porte le natif hors cœur (rien n'est jeté).

Le spécifique à chaque DEX est dans [`native.md`](native.md).

## Construction

```ts
import { Extended } from '@blackcube/extended-sdk';
const dex = new Extended({ desk: signer }, { default: 'desk' });
// label absent → signer par défaut. Lectures publiques : new Extended() suffit (sans signer).
```

`name` = identifiant de paire **du DEX** (ex. `BTC-USD`). `interval` = `1m/5m/1h/1d…`. Extended est
**perp-only** : seul `dex.perp()` existe (*absent : `spot()`*). Le détail du `signer` StarkEx (clés Stark
L2, `vaultId`) est dans [`signing.md`](signing.md).

---

## `perp(label?)` — marché + trading + compte du produit
*(le `kind` perp/spot est porté par le scope ; Extended n'a que `perp()`.)*

### Données de marché — `IMarketData`
| Méthode | Entrée | Sortie |
|---|---|---|
| `getPairs()` | — | `Promise<Pair[]>` |
| `getCandles(q)` | `CandlesParams` | `Promise<Candle[]>` |
| `getOrderBook(q)` | `OrderBookParams` | `Promise<OrderBook>` |
| `getPrices()` | — | `Promise<Price[]>` |
| `getFundingHistory(q)` | `FundingParams` | `Promise<FundingRate[]>` |

Les `interval` unifiés supportés : `1m,5m,15m,30m,1h,2h,4h,1d` (mappés sur `PT1M…P1D`) ; un intervalle
non supporté renvoie `[]` (no-throw).

```ts
await dex.perp().getPairs();
await dex.perp().getCandles({ name: 'BTC-USD', interval: '1h', limit: 100 });
await dex.perp().getOrderBook({ name: 'BTC-USD', limit: 20 });
await dex.perp().getPrices();
await dex.perp().getFundingHistory({ name: 'BTC-USD', limit: 50 });
```

### Métadonnées — `IMarketMeta`
| `getExchangeInfo()` | — | `Promise<unknown>` *(brut volontaire — pas de forme commune cross-DEX)* |

```ts
await dex.perp().getExchangeInfo();
```

### Trades publics — `IPublicTrades`
| `getTrades(q)` | `TradesParams` | `Promise<Trade[]>` |

```ts
await dex.perp().getTrades({ name: 'BTC-USD', limit: 50 });
```

### Compte du produit — `IProductAccount` / `IOrderHistory`
| Méthode | Entrée | Sortie |
|---|---|---|
| `getPositions(q?)` | `SymbolParams?` | `Promise<Position[]>` |
| `getOpens(q?)` | `SymbolParams?` | `Promise<Order[]>` |
| `getUserTrades(q?)` | `SymbolParams?` | `Promise<UserTrade[]>` |
| `getAccountInfo()` | — | `Promise<unknown>` *(brut volontaire — pas de forme commune cross-DEX)* |
| `getHistory(q?)` | `SymbolParams?` | `Promise<Order[]>` |

```ts
await dex.perp().getPositions();
await dex.perp().getOpens({ name: 'BTC-USD' });
await dex.perp().getUserTrades({ name: 'BTC-USD' });
await dex.perp().getAccountInfo();
await dex.perp().getHistory({ name: 'BTC-USD' });
```

### Trading — `ITrading`
| Méthode | Entrée | Sortie |
|---|---|---|
| `place(i)` | `PlaceOrderParams` | `Promise<Order>` |
| `cancel(i)` | `CancelOrderParams` | `Promise<void>` |
| `cancelAll(i)` | `CancelAllParams` | `Promise<{ cancelled: number \| null }>` *(Extended ne renvoie pas de compteur → `null`)* |
| `edit(i)` | `EditOrderParams` | `Promise<{ name: string; id: string }>` *(identité du nouvel ordre seulement — Extended traite l'édition comme un place avec `cancelId` ; relire l'état via `getOpens`)* |
| `updateLeverage(i)` | `LeverageParams` | `Promise<unknown>` |

Un ordre `market` force `tif = ioc`. **La signature StarkEx du settlement est validée sur testnet réel
(2026-06-01)** : reproduit `fast_stark_crypto` au bit près et acceptée par le serveur (ordre placé/accepté/
annulé) — cf. [`signing.md`](signing.md).

```ts
await dex.perp().place({ name: 'BTC-USD', side: 'buy', type: 'limit', size: '0.001', price: '50000' });
await dex.perp().cancel({ name: 'BTC-USD', id: '12345' });
await dex.perp().cancelAll({ name: 'BTC-USD' });
await dex.perp().edit({ name: 'BTC-USD', id: '12345', side: 'buy', size: '0.002', price: '49000' });
await dex.perp().updateLeverage({ name: 'BTC-USD', leverage: 10 });
```

### Marge — `IMarginMode` / `IIsolatedMargin` / `IRemovableMargin`
*(absent : Extended — pas de mode de marge cross/iso explicite ; ces capacités ne sont pas implémentées.)*

---

## `account(label?)` — transverse
### `IAccount` / `ISubAccounts` / `IDeadManSwitch`
| Méthode | Entrée | Sortie |
|---|---|---|
| `getBalances()` | — | `Promise<Balance[]>` |
| `withdraw(i)` | `WithdrawParams` | `Promise<Ack>` |
| `getSubAccounts()` | — | `Promise<SubAccount[]>` *(absent du scope commun Extended ; la liste se lit via `getAccountInfo()` / `/user/accounts`, la création via `dex.native.subAccounts().create()`)* |
| `armCancelAll(afterMs)` | `number` | `Promise<unknown>` |
| `disarm()` | — | `Promise<unknown>` |

```ts
await dex.account().getBalances();
await dex.account().withdraw({ amount: '100' });
await dex.account().armCancelAll(60_000); // dead-man-switch : annule tout dans 60 s sauf rafraîchi
await dex.account().disarm();
```

---

## `transfers(label?)` — transferts de fonds (commun)
`TransferParams` est **narrowé pour Extended** : la seule route est le collatéral USD vers un autre
compte/sous-compte par **vault id** (position id StarkEx) + clé publique Stark du destinataire. Le
**type** l'impose (`to: { vault: string; publicKey: string }`) → le compilateur refuse toute autre route,
**aucun throw** « non supporté » au runtime.

| Méthode | Entrée | Sortie |
|---|---|---|
| `transfer(p)` | `TransferParams` `{ to: { vault: string; publicKey: string }; amount: string }` | `Promise<unknown>` |

Signé StarkEx — même chaîne que l'ordre (validée testnet le 2026-06-01). **Limite résiduelle** : le hash
de transfert est validé **contre les vecteurs** `fast_stark_crypto` mais **non exercé sur le réseau** (cf.
[`signing.md`](signing.md)).

```ts
await dex.transfers().transfer({ to: { vault: '100456', publicKey: '0x…' }, amount: '10' });
```

---

## `ws(label?)` — temps réel
Lazy-connect au 1er abonnement, fermeture au dernier ; chaque méthode renvoie un `Unsubscribe`.
Souscription **par path** (1 channel = 1 connexion). *(absent : `wsSpot()` — Extended est perp-only.)*
### `IRealtime` / `IRealtimePositions`
| Méthode | Entrée | Callback |
|---|---|---|
| `subscribeCandles(q, cb)` | `{ name; interval }` | `(c: Candle) => void` |
| `subscribeOrderBook(q, cb)` | `{ name }` | `(b: OrderBook) => void` |
| `subscribeTrades(q, cb)` | `{ name }` | `(t: Trade) => void` |
| `subscribeBbo(q, cb)` | `{ name }` | `(b: OrderBook) => void` |
| `subscribePrices(cb)` | — | `(p: Price[]) => void` |
| `subscribeOrders(cb)` | — | `(o: Order) => void` |
| `subscribeUserTrades(cb)` | — | `(t: UserTrade) => void` |
| `subscribePositions(cb)` | — | `(p: Position) => void` |

`subscribeOrders`/`subscribeUserTrades`/`subscribePositions` sont **privés** (requièrent un signer/apiKey,
flux `/account`). `subscribePrices` est un fan-out des mark-prices de chaque marché.

```ts
const off = dex.ws().subscribeOrderBook({ name: 'BTC-USD' }, (b) => console.log(b.bids[0]));
dex.ws().subscribeCandles({ name: 'BTC-USD', interval: '1m' }, (c) => console.log(c.c));
dex.ws().subscribeTrades({ name: 'BTC-USD' }, (t) => console.log(t.price));
dex.ws().subscribeBbo({ name: 'BTC-USD' }, (b) => console.log(b.asks[0]));
dex.ws().subscribePrices((prices) => console.log(prices.length));
dex.ws().subscribeOrders((o) => console.log(o.status));
dex.ws().subscribeUserTrades((t) => console.log(t.id));
dex.ws().subscribePositions((p) => console.log(p.size));
off(); // se désabonne
```

Robustesse (spec commune) : reconnexion backoff+jitter+cap+reset après stabilité, re-câblage auto des
handlers, heartbeat 15 s + idle-timeout 45 s, parsing JSON défensif, `User-Agent` à la connexion.

---

## `system()` — connectivité *(absent : Extended)*

## `helpers()` — dérivation de clés *(absent : Extended ; la dérivation de la keypair Stark L2 est exposée via `dex.native.signing()` — cf. [`native.md`](native.md))*

---

## Types — entrées (Params)

Les `startTime`/`endTime` sont des **datetime UTC** `"YYYY-MM-DD HH:MM:SS"` (C7). Le `kind` perp/spot
**n'est pas** dans les params : il est porté par le scope (`dex.perp()`).

```ts
interface CandlesParams  { name: string; interval: string; startTime?: string; endTime?: string; limit?: number }
interface OrderBookParams{ name: string; limit?: number }
interface TradesParams   { name: string; limit?: number }
interface FundingParams  { name: string; startTime?: string; endTime?: string; limit?: number }
interface SymbolParams   { name: string }

interface PlaceOrderParams {
  name: string; side: 'buy' | 'sell';
  type: 'limit' | 'market' | 'stop' | 'stopMarket' | 'takeProfit' | 'takeProfitMarket';
  size: string; price?: string; triggerPrice?: string;
  tif?: 'gtc' | 'ioc' | 'fok' | 'alo'; reduceOnly?: boolean; clientId?: string;
}
interface CancelOrderParams   { name: string; id?: string; clientId?: string }
interface CancelAllParams     { name?: string } // Extended : sans `name` → annule tout
interface EditOrderParams     { name: string; id?: string; clientId?: string; side: 'buy' | 'sell'; size: string; price?: string }
interface LeverageParams      { name: string; leverage: number }
interface WithdrawParams      { amount: string; address?: string; asset?: string; [extra: string]: unknown }
```

## Types — sorties (Output)

```ts
type Side = 'buy' | 'sell';
type MarketKind = 'perp' | 'spot';

interface Pair { name: string; base: string; quote: string; kind: MarketKind; szDecimals: number;
  maxLeverage?: number; tickSize?: string; stepSize?: string; minNotional?: string; status?: string; xtras?: Record<string, unknown> }

interface Candle { t: number; T: number; s: string; i: string; o: string; c: string; h: string; l: string;
  v: string; n: number; kind: MarketKind; qv: string | null; tbbv: string | null; tbqv: string | null; xtras?: Record<string, unknown> }

interface OrderBookLevel { price: string; size: string; n: number | null }
interface OrderBook { name: string; kind: MarketKind; bids: OrderBookLevel[]; asks: OrderBookLevel[]; time: number | null; xtras?: Record<string, unknown> }

interface Price { name: string; kind: MarketKind; mark: string | null; oracle: string | null; mid: string | null;
  bid: string | null; ask: string | null; last: string | null; funding: string | null; openInterest: string | null;
  volume24h: string | null; prevDayPrice: string | null; time: number | null; xtras?: Record<string, unknown> }

interface FundingRate { name: string; fundingRate: string; time: number; xtras?: Record<string, unknown> }

interface Trade { price: string; size: string; side: Side | null; maker: boolean | null; time: number; id: number | null; xtras?: Record<string, unknown> }

interface Order { name: string; kind: MarketKind; id: string; clientId: string | null; side: Side;
  type: 'limit' | 'market' | 'stop' | 'stopMarket' | 'takeProfit' | 'takeProfitMarket' | 'trailingStop' | 'other';
  price: string | null; size: string; filled: string;
  status: 'open' | 'partiallyFilled' | 'filled' | 'canceled' | 'rejected' | 'expired' | 'other';
  tif: 'gtc' | 'ioc' | 'fok' | 'alo' | null; reduceOnly: boolean | null; time: number; xtras?: Record<string, unknown> }

interface Position { name: string; side: 'long' | 'short' | null; size: string; entryPrice: string | null;
  markPrice: string | null; unrealizedPnl: string | null; leverage: number | null; liquidationPrice: string | null;
  margin: string | null; xtras?: Record<string, unknown> }

interface UserTrade { name: string; kind: MarketKind; id: string; orderId: string; side: Side; price: string; size: string;
  fee: string; feeAsset: string | null; pnl: string | null; maker: boolean | null; time: number; xtras?: Record<string, unknown> }

interface Balance { asset: string; total: string; available: string | null; usdValue: string | null; xtras?: Record<string, unknown> }

interface SubAccount { address: string; xtras?: Record<string, unknown> }

// Accusé d'une écriture signée sans retour plus riche (ex. `account().withdraw`) :
// `ok` = action acceptée ; `xtras` = réponse native complète (rien jeté).
interface Ack { ok: boolean; xtras: Record<string, unknown> }

type Unsubscribe = () => void;
```
