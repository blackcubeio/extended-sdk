import { type ExtendedClient, type InitOptions, init } from '../common/config';
import type { NativeMarket } from '../common/native';
import type {
  Ack,
  Balance,
  Candle,
  FundingRate,
  JsonValue,
  Network,
  Order,
  OrderBook,
  Pair,
  Position,
  Price,
  Signer,
  Trade,
  UserTrade,
} from '../common/types';
import { dateToMs } from '../common/utils';
import { toResolution } from '../common/utils';
import type { Unsubscribe } from '../common/ws';
import {
  getAccountInfo,
  getBalances,
  getOpenOrders,
  getOrderHistory,
  getPositions,
  getUserTrades,
} from '../rest/account';
import { httpGet } from '../rest/client';
import { getCandles } from '../rest/get-candles';
import { getFundingHistory } from '../rest/get-funding-history';
import { getOrderBook } from '../rest/get-order-book';
import { getTrades } from '../rest/get-trades';
import { fetchMarkets, getPairs, getPrices } from '../rest/markets';
import { l2KeyFromEthSignature } from '../rest/signing';
import {
  type ResolvedMarket,
  type SigningCtx,
  autoCancel,
  cancelOrder,
  massCancel,
  placeOrder,
  updateLeverage,
} from '../rest/trading';
import { transfer as restTransfer, withdraw as restWithdraw } from '../rest/transfers';
import { UnifiedWsClient } from '../ws/unified-client';
import type {
  Ack as AckType,
  CancelAllParams,
  CancelOrderParams,
  CandlesParams,
  EditOrderParams,
  FundingParams,
  IAccount,
  IDeadManSwitch,
  IMarketData,
  IMarketMeta,
  IOrderHistory,
  IProductAccount,
  IPublicTrades,
  IRealtime,
  IRealtimePositions,
  ITrading,
  ITransfers,
  LeverageParams,
  OrderBookParams,
  PlaceOrderParams,
  SymbolParams,
  TradesParams,
  TransferParams,
  WithdrawParams,
} from './contract';
import type {
  BuilderInfo,
  CreateSubAccountInput,
  IBuilder,
  ISigning,
  ISubAccountsAdmin,
  IVault,
  OnboardingInput,
} from './native-contract';

/** Marché résolu (l2Config + nom) pour scaling/signature, mis en cache par réseau. */
class MarketsResolver {
  private readonly cache = new Map<Network, Promise<ResolvedMarket[]>>();

  constructor(private readonly client: ExtendedClient) {}

  private networkOf(label?: string): Network {
    return label !== undefined ? (this.client.signers[label]?.network ?? 'mainnet') : 'mainnet';
  }

  all(label?: string): Promise<ResolvedMarket[]> {
    const network = this.networkOf(label);
    let promise = this.cache.get(network);
    if (promise === undefined) {
      promise = fetchMarkets(this.client, label).then((markets) =>
        markets.map((m: NativeMarket) => ({
          name: m.name,
          syntheticId: m.l2Config?.syntheticId ?? '0x0',
          syntheticResolution: m.l2Config?.syntheticResolution ?? 1,
          collateralId: m.l2Config?.collateralId ?? '0x1',
          collateralResolution: m.l2Config?.collateralResolution ?? 1_000_000,
        })),
      );
      this.cache.set(network, promise);
    }
    return promise;
  }

  async meta(name: string, label?: string): Promise<ResolvedMarket> {
    const all = await this.all(label);
    const meta = all.find((m) => m.name === name);
    if (meta === undefined) {
      throw new Error(`Marché Extended inconnu : "${name}"`);
    }
    return meta;
  }
}

/** Démarre un abonnement WS dont la cible dépend d'une résolution asynchrone (name → résolution). */
function deferredSubscribe(start: () => Promise<Unsubscribe>): Unsubscribe {
  let cancelled = false;
  let real: Unsubscribe | null = null;
  start()
    .then((unsub) => {
      if (cancelled) {
        unsub();
      } else {
        real = unsub;
      }
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    if (real !== null) {
      real();
    }
  };
}

/** Options de construction d'un {@link Extended}. */
export interface ExtendedDexOptions extends Omit<InitOptions, 'signers'> {
  /** Label du signer par défaut (sinon le 1er du registre). */
  default?: string;
}

/** Base des scopes signés : résolution du signer et du contexte de signature. */
class Scope {
  constructor(
    protected readonly client: ExtendedClient,
    protected readonly label: string | undefined,
  ) {}

  protected signer(): Signer {
    if (this.label === undefined) {
      throw new Error('Action signée : aucun signer (ajoute des signers ou un défaut).');
    }
    const signer = this.client.signers[this.label];
    if (signer === undefined) {
      throw new Error(`Aucun signer enregistré sous "${this.label}".`);
    }
    return signer;
  }

  protected apiKey(): string {
    return this.signer().apiKey;
  }

  protected signingCtx(): SigningCtx {
    const s = this.signer();
    return {
      apiKey: s.apiKey,
      l2PrivateKey: s.l2PrivateKey,
      l2PublicKey: s.l2PublicKey,
      vaultId: s.vaultId,
      network: s.network,
    };
  }
}

/** Scope **marché perp** + compte par produit + trading (Extended est perp-only). */
class ExtendedMarket
  extends Scope
  implements IMarketData, IMarketMeta, IPublicTrades, IProductAccount, IOrderHistory, ITrading
{
  constructor(
    client: ExtendedClient,
    label: string | undefined,
    private readonly markets: MarketsResolver,
  ) {
    super(client, label);
  }

  // ── IMarketData ──
  public getPairs(): Promise<Pair[]> {
    return getPairs(this.client, this.label);
  }
  public getCandles(query: CandlesParams): Promise<Candle[]> {
    return getCandles(
      this.client,
      {
        name: query.name,
        interval: query.interval,
        endTime: query.endTime === undefined ? undefined : dateToMs(query.endTime),
        limit: query.limit,
      },
      this.label,
    );
  }
  public getOrderBook(query: OrderBookParams): Promise<OrderBook> {
    return getOrderBook(this.client, { name: query.name, depth: query.limit }, this.label);
  }
  public getPrices(): Promise<Price[]> {
    return getPrices(this.client, this.label);
  }
  public getFundingHistory(query: FundingParams): Promise<FundingRate[]> {
    return getFundingHistory(
      this.client,
      {
        name: query.name,
        startTime: query.startTime === undefined ? undefined : dateToMs(query.startTime),
        endTime: query.endTime === undefined ? undefined : dateToMs(query.endTime),
        limit: query.limit,
      },
      this.label,
    );
  }

  // ── IMarketMeta ──
  public getExchangeInfo(): Promise<unknown> {
    return fetchMarkets(this.client, this.label);
  }

  // ── IPublicTrades ──
  public getTrades(query: TradesParams): Promise<Trade[]> {
    return getTrades(this.client, { name: query.name, limit: query.limit }, this.label);
  }

  // ── IProductAccount ──
  public getPositions(query?: SymbolParams): Promise<Position[]> {
    return getPositions(this.client, this.apiKey(), query?.name, this.label);
  }
  public getOpens(query?: SymbolParams): Promise<Order[]> {
    return getOpenOrders(this.client, this.apiKey(), query?.name, this.label);
  }
  public getUserTrades(query?: SymbolParams): Promise<UserTrade[]> {
    return getUserTrades(this.client, this.apiKey(), query?.name, this.label);
  }
  public getAccountInfo(): Promise<unknown> {
    return getAccountInfo(this.client, this.apiKey(), this.label);
  }

  // ── IOrderHistory ──
  public getHistory(query?: SymbolParams): Promise<Order[]> {
    return getOrderHistory(this.client, this.apiKey(), query?.name, this.label);
  }

  // ── ITrading ──
  public async place(input: PlaceOrderParams): Promise<Order> {
    const market = await this.markets.meta(input.name, this.label);
    return placeOrder(this.client, this.signingCtx(), market, input, this.label);
  }
  public async cancel(input: CancelOrderParams): Promise<void> {
    await cancelOrder(
      this.client,
      this.apiKey(),
      { id: input.id, clientId: input.clientId },
      this.label,
    );
  }
  public async cancelAll(input: CancelAllParams): Promise<{ cancelled: number | null }> {
    await massCancel(
      this.client,
      this.apiKey(),
      input.name !== undefined ? { markets: [input.name] } : { cancelAll: true },
      this.label,
    );
    return { cancelled: null };
  }
  public async edit(input: EditOrderParams): Promise<{ name: string; id: string }> {
    // Extended : édition = nouveau place avec `cancelId` (remplacement). On relit l'état ensuite.
    const market = await this.markets.meta(input.name, this.label);
    const order = await placeOrder(
      this.client,
      this.signingCtx(),
      market,
      { name: input.name, side: input.side, type: 'limit', size: input.size, price: input.price },
      this.label,
      input.id ?? input.clientId,
    );
    return { name: input.name, id: order.id };
  }
  public updateLeverage(input: LeverageParams): Promise<unknown> {
    return updateLeverage(
      this.client,
      this.apiKey(),
      { market: input.name, leverage: input.leverage },
      this.label,
    );
  }
}

/** Scope **compte transverse** : soldes, retrait, kill-switch (auto-cancel). */
class ExtendedAccount extends Scope implements IAccount, IDeadManSwitch {
  public getBalances(): Promise<Balance[]> {
    return getBalances(this.client, this.apiKey(), this.label);
  }
  public withdraw(input: WithdrawParams): Promise<Ack> {
    return restWithdraw(
      this.client,
      this.signingCtx(),
      { amount: input.amount, recipient: input.address },
      this.label,
    ).then((env) => ({ ok: env.status !== 'ERROR', xtras: env as Record<string, unknown> }));
  }

  // ── IDeadManSwitch (Extended : /user/orders/auto-cancel, délai en ms) ──
  public armCancelAll(afterMs: number): Promise<unknown> {
    return autoCancel(this.client, this.apiKey(), afterMs, this.label);
  }
  public disarm(): Promise<unknown> {
    return autoCancel(this.client, this.apiKey(), 0, this.label);
  }
}

/**
 * Transferts de fonds (`transfers()` commun). `TransferParams` est **narrowé** à
 * `to: { vault, publicKey }` (collatéral USD vers un autre compte/sous-compte par vault id) → aucune
 * route invalide ne compile, donc **aucun throw** « non supporté ».
 */
class ExtendedTransfers extends Scope implements ITransfers {
  public transfer(params: TransferParams): Promise<unknown> {
    return restTransfer(
      this.client,
      this.signingCtx(),
      { toVault: params.to.vault, toPublicKey: params.to.publicKey, amount: params.amount },
      this.label,
    );
  }
}

/** Scope **temps réel** : Extended a un flux `/account` → implémente `IRealtimePositions`. */
class ExtendedRealtime implements IRealtime, IRealtimePositions {
  constructor(
    private readonly ws: UnifiedWsClient,
    private readonly label: string | undefined,
    private readonly client: ExtendedClient,
  ) {}

  // Bougies 1m de tout le marché en UNE méthode. Extended n'a pas de flux prix agrégé exploitable (mark-price
  // muet en lecture publique) → on fan-out en INTERNE sur subscribeCandles@1m de chaque marché perp (chemin éprouvé).
  // API uniforme sur les DEX ; l'appelant filtre côté collecteur sur ses paires suivies.
  public subscribeAllCandles(cb: (c: Candle) => void) {
    return deferredSubscribe(async () => {
      const pairs = await getPairs(this.client, this.label);
      const unsubs = pairs
        .filter((p) => p.kind === 'perp')
        .map((p) => this.subscribeCandles({ name: p.name, interval: '1m' }, cb));
      return () => {
        for (const u of unsubs) {
          u();
        }
      };
    });
  }

  private apiKey(): string {
    const signer = this.label !== undefined ? this.client.signers[this.label] : undefined;
    if (signer === undefined) {
      throw new Error('Flux privé : aucun signer (apiKey) pour le label fourni.');
    }
    return signer.apiKey;
  }

  public subscribeCandles(query: { name: string; interval: string }, cb: (c: Candle) => void) {
    const resolution = toResolution(query.interval);
    if (resolution === undefined) {
      return () => {};
    }
    return this.ws.subscribeCandles(query.name, query.interval, resolution, 'perp', cb);
  }
  public subscribeOrderBook(query: { name: string }, cb: (b: OrderBook) => void) {
    return this.ws.subscribeOrderBook(query.name, 'perp', cb);
  }
  public subscribeTrades(query: { name: string }, cb: (t: Trade) => void) {
    return this.ws.subscribeTrades(query.name, cb);
  }
  public subscribeBbo(query: { name: string }, cb: (b: OrderBook) => void) {
    return this.ws.subscribeBbo(query.name, 'perp', cb);
  }
  public subscribePrices(cb: (p: Price[]) => void) {
    // Extended n'a pas de flux « tous les prix » : fan-out sur les mark-prices de chaque marché.
    return deferredSubscribe(async () => {
      const markets = await getPairs(this.client, this.label);
      const byName = new Map<string, Price>();
      const unsubs = markets.map((m) =>
        this.ws.subscribeMarketStats(m.name, 'perp', (price) => {
          byName.set(m.name, price);
          cb([...byName.values()]);
        }),
      );
      return () => {
        for (const u of unsubs) {
          u();
        }
      };
    });
  }
  public subscribeOrders(cb: (o: Order) => void) {
    return this.ws.subscribeAccount(this.apiKey(), (msg) => {
      for (const raw of accountArray(msg, 'orders')) {
        const o = raw as Record<string, unknown>;
        cb({
          name: String(o.market ?? ''),
          kind: 'perp',
          id: String(o.id ?? ''),
          clientId: o.externalId != null ? String(o.externalId) : null,
          side: o.side === 'SELL' ? 'sell' : 'buy',
          type: 'other',
          price: o.price != null ? String(o.price) : null,
          size: String(o.qty ?? '0'),
          filled: String(o.filledQty ?? '0'),
          status: 'open',
          tif: null,
          reduceOnly: typeof o.reduceOnly === 'boolean' ? o.reduceOnly : null,
          time: Number(o.createdTime ?? 0),
          xtras: o,
        });
      }
    });
  }
  public subscribeUserTrades(cb: (t: UserTrade) => void) {
    return this.ws.subscribeAccount(this.apiKey(), (msg) => {
      for (const raw of accountArray(msg, 'trades')) {
        const t = raw as Record<string, unknown>;
        cb({
          name: String(t.market ?? ''),
          kind: 'perp',
          id: String(t.id ?? ''),
          orderId: String(t.orderId ?? ''),
          side: t.side === 'SELL' ? 'sell' : 'buy',
          price: String(t.price ?? '0'),
          size: String(t.qty ?? '0'),
          fee: String(t.fee ?? '0'),
          feeAsset: t.feeAsset != null ? String(t.feeAsset) : null,
          pnl: t.realisedPnl != null ? String(t.realisedPnl) : null,
          maker: typeof t.isTaker === 'boolean' ? !t.isTaker : null,
          time: Number(t.createdTime ?? 0),
          xtras: t,
        });
      }
    });
  }
  public subscribePositions(cb: (p: Position) => void) {
    return this.ws.subscribeAccount(this.apiKey(), (msg) => {
      for (const raw of accountArray(msg, 'positions')) {
        const p = raw as Record<string, unknown>;
        const size = String(p.size ?? '0');
        cb({
          name: String(p.market ?? ''),
          side: Number(size) === 0 ? null : p.side === 'SHORT' ? 'short' : 'long',
          size,
          entryPrice: p.openPrice != null ? String(p.openPrice) : null,
          markPrice: p.markPrice != null ? String(p.markPrice) : null,
          unrealizedPnl: p.unrealisedPnl != null ? String(p.unrealisedPnl) : null,
          leverage: p.leverage != null ? Number(p.leverage) : null,
          liquidationPrice: p.liquidationPrice != null ? String(p.liquidationPrice) : null,
          margin: p.margin != null ? String(p.margin) : null,
          xtras: p,
        });
      }
    });
  }
}

/** Extrait un tableau (`orders`/`trades`/`positions`) d'un message brut `/account`. */
function accountArray(msg: JsonValue, key: string): unknown[] {
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) {
    return [];
  }
  const data = (msg as Record<string, JsonValue>).data ?? msg;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return [];
  }
  const value = (data as Record<string, JsonValue>)[key];
  return Array.isArray(value) ? value : [];
}

// ── Scopes natifs (surplus spécifique Extended) ───────────────────────────────────────────────

/** Scope natif **signing** : dérivation de keypair L2. */
class ExtendedSigning extends Scope implements ISigning {
  public deriveL2Key(input: OnboardingInput): { privateKey: string; publicKey: string } {
    return l2KeyFromEthSignature(input.ethSignature);
  }
}

/** Scope natif **subAccounts** : création (action SNIP CREATE_SUB_ACCOUNT). */
class ExtendedSubAccounts extends Scope implements ISubAccountsAdmin {
  public create(_input?: CreateSubAccountInput): Promise<Ack> {
    // L'onboarding sous-compte exige une signature L2 (pedersen) + payload management ; exposé en
    // passe-plat signé. Le payload natif complet revient dans `xtras`.
    return Promise.reject(
      new Error(
        'create sub-account (Extended) : nécessite la signature L2 d’onboarding (À VALIDER testnet).',
      ),
    );
  }
}

/** Scope natif **vault** de rendement (`/user/vault/*`). */
class ExtendedVault extends Scope implements IVault {
  public getPerformance(): Promise<unknown> {
    return httpGet<unknown>(
      this.client,
      '/user/vault/performance',
      undefined,
      this.label,
      this.apiKey(),
    ).then((env) => env.data ?? env);
  }
  public getSummary(): Promise<unknown> {
    return httpGet<unknown>(
      this.client,
      '/user/vault/summary',
      undefined,
      this.label,
      this.apiKey(),
    ).then((env) => env.data ?? env);
  }
}

/** Scope natif **builder** codes : config d'un builder par défaut (porté par instance). */
class ExtendedBuilder implements IBuilder {
  private builder: BuilderInfo | null = null;
  public setDefault(info: BuilderInfo): void {
    this.builder = info;
  }
  public current(): BuilderInfo | null {
    return this.builder;
  }
}

/**
 * Façade **Extended** (ex-X10) : `const dex = new Extended({ deskA: signer }, { default: 'deskA' })`,
 * puis `dex.perp(label?)` (marché perp + compte produit + trading), `dex.account(label?)` (compte
 * transverse + kill-switch), `dex.transfers(label?)`, `dex.ws(label?)` (temps réel). Extended est
 * **perp-only** (pas de `spot()`) et n'a **pas** de mode de marge cross/iso explicite.
 *
 * Surplus spécifique via `dex.native.<cap>()` : `signing` (dérivation keypair L2), `subAccounts`,
 * `vault` (rendement), `builder` (builder codes).
 *
 * Chaque instance détient son propre {@link ExtendedClient} (config isolée) ; mainnet/testnet
 * coexistent par label. La signature **StarkEx** (`rest/signing.ts`) est **À VALIDER au bit près
 * sur testnet** (le hash JS pur doit reproduire `fast_stark_crypto`, sinon brancher le signer WASM).
 */
export class Extended {
  private readonly client: ExtendedClient;
  private readonly defaultLabel: string | undefined;
  private readonly markets: MarketsResolver;
  private readonly wsClients = new Map<string, UnifiedWsClient>();
  private readonly builderScope = new ExtendedBuilder();

  constructor(signers: Record<string, Signer> = {}, options: ExtendedDexOptions = {}) {
    const { default: defaultLabel, ...init0 } = options;
    this.client = init({ ...init0, signers });
    this.defaultLabel = defaultLabel ?? Object.keys(signers)[0];
    this.markets = new MarketsResolver(this.client);
  }

  private resolve(label?: string): string | undefined {
    return label ?? this.defaultLabel;
  }

  /** Scope marché **perp** (Extended est perp-only). */
  public perp(label?: string): ExtendedMarket {
    return new ExtendedMarket(this.client, this.resolve(label), this.markets);
  }

  /** Scope **compte** transverse (soldes, retrait, kill-switch). */
  public account(label?: string): ExtendedAccount {
    return new ExtendedAccount(this.client, this.resolve(label));
  }

  /** Scope **transferts** unifié (Extended : vers un autre compte/sous-compte par vault id). */
  public transfers(label?: string): ExtendedTransfers {
    return new ExtendedTransfers(this.client, this.resolve(label));
  }

  /** Scope **temps réel** (souscription par path). */
  public ws(label?: string): ExtendedRealtime {
    const resolved = this.resolve(label);
    return new ExtendedRealtime(this.unifiedWs(resolved), resolved, this.client);
  }

  /** Capacités **spécifiques à Extended** (namespace `native`, convention partagée). */
  public get native() {
    const c = this.client;
    const r = (label?: string) => this.resolve(label);
    return {
      /** Dérivation de la keypair Stark L2 (onboarding) — `ISigning`. */
      signing: (label?: string) => new ExtendedSigning(c, r(label)),
      /** Création de sous-comptes — `ISubAccountsAdmin`. */
      subAccounts: (label?: string) => new ExtendedSubAccounts(c, r(label)),
      /** Vault de rendement (`/user/vault/*`) — `IVault`. */
      vault: (label?: string) => new ExtendedVault(c, r(label)),
      /** Builder codes (config par défaut) — `IBuilder`. */
      builder: (): IBuilder => this.builderScope,
    };
  }

  private unifiedWs(label: string | undefined): UnifiedWsClient {
    const key = label ?? '';
    let ws = this.wsClients.get(key);
    if (ws === undefined) {
      ws = new UnifiedWsClient(this.client, { label });
      this.wsClients.set(key, ws);
    }
    return ws;
  }
}

export type { AckType };
