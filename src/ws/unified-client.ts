import type { ExtendedClient } from '../common/config';
import type {
  Candle,
  JsonValue,
  MarketKind,
  OrderBook,
  OrderBookLevel,
  Price,
  Trade,
} from '../common/types';
import type { Unsubscribe, WsClientOptions } from '../common/ws';
import { CandleConverter } from '../converters/candle';
import { TradeConverter } from '../converters/trade';
import { ExtendedWsClient } from './client';

type Obj = Record<string, JsonValue>;

const asObj = (v: JsonValue | undefined): Obj | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined;
const asArr = (v: JsonValue | undefined): JsonValue[] => (Array.isArray(v) ? v : []);
const str = (v: JsonValue | undefined): string | null => (v != null ? String(v) : null);

/** Maintient un carnet local à partir du SNAPSHOT puis des DELTA Extended (qty `0` = suppression). */
class BookState {
  private readonly bids = new Map<string, string>();
  private readonly asks = new Map<string, string>();

  reset(): void {
    this.bids.clear();
    this.asks.clear();
  }

  apply(side: 'bids' | 'asks', levels: JsonValue[]): void {
    const book = side === 'bids' ? this.bids : this.asks;
    for (const level of levels) {
      const obj = asObj(level);
      if (obj === undefined) {
        continue;
      }
      const price = String(obj.price);
      const qty = String(obj.qty);
      if (Number(qty) === 0) {
        book.delete(price);
      } else {
        book.set(price, qty);
      }
    }
  }

  levels(side: 'bids' | 'asks'): OrderBookLevel[] {
    const book = side === 'bids' ? this.bids : this.asks;
    const out = [...book.entries()].map(([price, size]) => ({ price, size, n: null }));
    out.sort((a, b) =>
      side === 'bids' ? Number(b.price) - Number(a.price) : Number(a.price) - Number(b.price),
    );
    return out;
  }
}

/**
 * Client WebSocket **unifié** Extended : un {@link ExtendedWsClient} par path (souscription par PATH,
 * 1 channel = 1 connexion). Convertit les payloads natifs vers les types Blackcube. Lazy-connect/close
 * hérité du client de path. La résolution `name → marché` est faite par la façade ; ici on prend le
 * `name` directement (les paths Extended sont indexés par symbole hyphené).
 */
export class UnifiedWsClient {
  private readonly clients = new Map<string, ExtendedWsClient>();
  private onErrorCb: ((error: unknown) => void) | null = null;
  private onCloseCb: (() => void) | null = null;
  private onReconnectCb: (() => void) | null = null;

  constructor(
    private readonly client: ExtendedClient,
    private readonly options: WsClientOptions = {},
  ) {}

  public set onError(cb: ((error: unknown) => void) | null) {
    this.onErrorCb = cb;
  }
  public set onClose(cb: (() => void) | null) {
    this.onCloseCb = cb;
  }
  public set onReconnect(cb: (() => void) | null) {
    this.onReconnectCb = cb;
  }

  /** Client de path (créé à la demande, recyclé). */
  private channel(path: string, apiKey?: string): ExtendedWsClient {
    let c = this.clients.get(path);
    if (c === undefined) {
      c = new ExtendedWsClient(this.client, path, { ...this.options, apiKey });
      c.onError = this.onErrorCb;
      c.onClose = this.onCloseCb;
      c.onReconnect = this.onReconnectCb;
      this.clients.set(path, c);
    }
    return c;
  }

  /** Souscription brute à un path (le handler reçoit chaque message JSON). */
  private sub(path: string, handler: (msg: JsonValue) => void, apiKey?: string): Unsubscribe {
    const c = this.channel(path, apiKey);
    const unsub = c.subscribe(handler);
    return () => {
      unsub();
      // Note : on garde l'entrée du registre ; le client se ferme seul au dernier handler.
    };
  }

  /** Bougies temps réel (`/candles/{m}/{type}?interval=`). */
  subscribeCandles(
    name: string,
    interval: string,
    resolution: string,
    kind: MarketKind,
    cb: (candle: Candle) => void,
  ): Unsubscribe {
    const converter = new CandleConverter(name, interval, kind);
    return this.sub(`/candles/${name}/trades?interval=${resolution}`, (msg) => {
      const obj = asObj(msg);
      const data = obj?.data;
      for (const raw of Array.isArray(data) ? data : data !== undefined ? [data] : []) {
        const c = asObj(raw);
        if (c !== undefined) {
          cb(
            converter.toCommon({
              T: Number(c.T ?? 0),
              o: String(c.o),
              h: String(c.h),
              l: String(c.l),
              c: String(c.c),
              v: String(c.v),
              ...c,
            }),
          );
        }
      }
    });
  }

  /** Carnet temps réel (`/orderbooks/{m}?depth=`), SNAPSHOT puis DELTA fusionnés. */
  subscribeOrderBook(name: string, kind: MarketKind, cb: (book: OrderBook) => void): Unsubscribe {
    const state = new BookState();
    return this.sub(`/orderbooks/${name}`, (msg) => {
      const obj = asObj(msg);
      const data = asObj(obj?.data) ?? obj;
      if (data === undefined) {
        return;
      }
      const type = String(obj?.type ?? data.type ?? '').toUpperCase();
      if (type.includes('SNAPSHOT')) {
        state.reset();
      }
      state.apply('bids', asArr(data.bid));
      state.apply('asks', asArr(data.ask));
      cb({
        name,
        kind,
        bids: state.levels('bids'),
        asks: state.levels('asks'),
        time: obj?.ts !== undefined ? Number(obj.ts) : null,
      });
    });
  }

  /** Meilleure limite (BBO) dérivée du carnet temps réel. */
  subscribeBbo(name: string, kind: MarketKind, cb: (book: OrderBook) => void): Unsubscribe {
    return this.subscribeOrderBook(name, kind, (book) => {
      cb({
        name,
        kind,
        bids: book.bids.slice(0, 1),
        asks: book.asks.slice(0, 1),
        time: book.time,
      });
    });
  }

  /** Trades publics temps réel (`/publicTrades/{m}`). */
  subscribeTrades(name: string, cb: (trade: Trade) => void): Unsubscribe {
    const converter = new TradeConverter();
    return this.sub(`/publicTrades/${name}`, (msg) => {
      const obj = asObj(msg);
      const data = obj?.data;
      for (const raw of Array.isArray(data) ? data : data !== undefined ? [data] : []) {
        const t = asObj(raw);
        if (t !== undefined) {
          cb(
            converter.toCommon({
              p: String(t.p ?? t.price),
              q: String(t.q ?? t.qty),
              S: t.S !== undefined ? String(t.S) : undefined,
              T: Number(t.T ?? 0),
              ...t,
            }),
          );
        }
      }
    });
  }

  /** Stats de marché temps réel (`/mark-prices/{m}`) → {@link Price}. */
  subscribeMarketStats(name: string, kind: MarketKind, cb: (price: Price) => void): Unsubscribe {
    return this.sub(`/mark-prices/${name}`, (msg) => {
      const obj = asObj(msg);
      const s = asObj(obj?.data) ?? obj;
      if (s === undefined) {
        return;
      }
      cb({
        name,
        kind,
        mark: str(s.markPrice ?? s.p),
        oracle: str(s.indexPrice),
        mid: null,
        bid: str(s.bidPrice),
        ask: str(s.askPrice),
        last: str(s.lastPrice),
        funding: str(s.fundingRate),
        openInterest: str(s.openInterest),
        volume24h: str(s.dailyVolume),
        prevDayPrice: null,
        time: obj?.ts !== undefined ? Number(obj.ts) : null,
      });
    });
  }

  /** Flux **privé** de compte (`/account`, apiKey à la connexion). Message brut au callback. */
  subscribeAccount(apiKey: string, cb: (message: JsonValue) => void): Unsubscribe {
    return this.sub('/account', cb, apiKey);
  }

  /** Ferme toutes les sockets. */
  close(): void {
    for (const c of this.clients.values()) {
      c.close();
    }
    this.clients.clear();
  }
}
