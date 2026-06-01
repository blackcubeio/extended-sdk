# Contrat commun — Extended SDK

L'invariant des SDK DEX Blackcube : **mêmes scopes, mêmes noms, même vocabulaire, mêmes formes** entre
Aster / Hyperliquid / Pacifica / Lighter / Paradex / Extended. Deux natures de divergence sont
assumées et annotées au cas par cas : **disponibilité par capacité** (un scope/une méthode n'existe que
si la venue l'offre) et **narrowing de type par DEX** (le type d'entrée est restreint à ce que la venue
accepte). Aucun `throw "non supporté"` : l'absence se traduit par une interface non implémentée.

## Construire la façade

```ts
import { Extended, type Signer } from '@blackcube/extended-sdk';

const signer: Signer = {
  apiKey: 'xk_…',                 // header X-Api-Key
  l2PrivateKey: '0x…',            // clé privée Stark L2 (signe les ordres)
  l2PublicKey: '0x…',             // clé publique Stark L2 (= starkKey du settlement)
  vaultId: 100123,                // position id StarkEx (collateralPosition)
  network: 'testnet',
};

const dex = new Extended({ deskA: signer }, { default: 'deskA' });
```

Lectures publiques sans signer : `new Extended()` suffit (les `get…` de marché tapent le mainnet par
défaut, ou le réseau du signer si un label est fourni).

## Scopes

Extended est **perp-only** : il n'y a **pas** de `spot()`. Il n'a **pas** de mode de marge cross/iso
explicite *(absent : Extended → `setMarginMode`/`addIsolatedMargin`)*.

| Scope | Capacités |
|---|---|
| `dex.perp(label?)` | marché public + compte par produit + trading |
| `dex.account(label?)` | compte transverse (soldes, retrait) + kill-switch |
| `dex.transfers(label?)` | transferts de collatéral |
| `dex.ws(label?)` | temps réel (souscription par path) |

### `dex.perp()`

- **Marché** (`IMarketData`/`IMarketMeta`/`IPublicTrades`) : `getPairs()`, `getCandles({name,interval,startTime?,endTime?,limit?})`,
  `getOrderBook({name,limit?})`, `getPrices()`, `getFundingHistory({name,startTime?,endTime?,limit?})`,
  `getTrades({name,limit?})`, `getExchangeInfo()` *(brut volontaire — `/info/markets`)*.
  Les `interval` unifiés supportés : `1m,5m,15m,30m,1h,2h,4h,1d` (mappés sur `PT1M…P1D`) ; un intervalle
  non supporté renvoie `[]` (no-throw).
- **Compte produit** (`IProductAccount`/`IOrderHistory`) : `getPositions({name?})`, `getOpens({name?})`,
  `getUserTrades({name?})`, `getHistory({name?})`, `getAccountInfo()` *(brut volontaire)*.
- **Trading** (`ITrading`) : `place(input)` → `Order` ; `cancel({name,id?,clientId?})` ;
  `cancelAll({name?})` → `{cancelled: number|null}` (Extended ne renvoie pas de compteur → `null`) ;
  `edit(input)` → `{name,id}` (Extended traite l'édition comme un place avec `cancelId` ; relire l'état
  via `getOpens`) ; `updateLeverage({name,leverage})`.

`place` accepte `type ∈ {limit,market,stop,stopMarket,takeProfit,takeProfitMarket}`, `side ∈ {buy,sell}`,
`size`/`price` chaînes décimales, `tif ∈ {gtc,ioc,fok,alo}`, `reduceOnly`, `clientId`. Un ordre `market`
force `tif = ioc`. **La signature StarkEx du settlement est À VALIDER au bit près sur testnet** (cf.
`signing.md`).

### `dex.account()`

- `getBalances()` → `Balance[]` (collatéral USD unique).
- `withdraw({amount, address?})` → `Ack` (`ok` + réponse native en `xtras`). Signé StarkEx (À VALIDER).
- **Kill-switch** (`IDeadManSwitch`) : `armCancelAll(afterMs)` (auto-cancel serveur, à rafraîchir),
  `disarm()`. S'appuie sur `POST /user/orders/auto-cancel`.

### `dex.transfers()`

`transfer({ to: { vault, publicKey }, amount })` — **narrowé** : collatéral USD vers un autre
compte/sous-compte par **vault id** (position id) + clé publique Stark du destinataire. Aucune autre
route ne compile (pas de throw runtime). Signé StarkEx (À VALIDER).

### `dex.ws()`

Souscription **par path** (1 channel = 1 connexion). Lazy-connect au 1er `subscribe`, auto-close au
dernier `unsubscribe`. Chaque `subscribe…` renvoie un `Unsubscribe`.

- `subscribeCandles({name,interval}, cb)`, `subscribeOrderBook({name}, cb)` (SNAPSHOT puis DELTA),
  `subscribeBbo({name}, cb)`, `subscribeTrades({name}, cb)`, `subscribePrices(cb)` (fan-out mark-prices).
- Privés (requièrent un signer/apiKey) : `subscribeOrders(cb)`, `subscribeUserTrades(cb)`,
  `subscribePositions(cb)` (flux `/account`).

Robustesse (spec commune) : reconnexion backoff+jitter+cap+reset après stabilité, re-câblage auto des
handlers, heartbeat 15 s + idle-timeout 45 s, parsing JSON défensif, `User-Agent` à la connexion.

## Types de sortie unifiés

`Order`, `Trade`, `UserTrade`, `Candle`, `Price`, `Pair`, `OrderBook`, `Position`, `Balance`,
`FundingRate`, `SubAccount`, `Ack`. Cœur **identique** aux autres SDK ; le hors-cœur natif est conservé
dans `xtras` (rien n'est jeté).
