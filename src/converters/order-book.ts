import type { NativeBookLevel, NativeOrderBook } from '../common/native';
import type { MarketKind, OrderBook, OrderBookLevel } from '../common/types';

/**
 * Convertisseur carnet Extended (`/info/markets/{m}/orderbook`, `data.bid[]`/`data.ask[]` avec
 * `{qty,price}`) ↔ {@link OrderBook} unifié. Bids triés décroissants, asks croissants.
 */
export class OrderBookConverter {
  constructor(
    private readonly name: string,
    private readonly kind: MarketKind = 'perp',
  ) {}

  private level(l: NativeBookLevel): OrderBookLevel {
    return { price: String(l.price), size: String(l.qty), n: null };
  }

  toCommon(wire: NativeOrderBook, time: number | null = null): OrderBook {
    const bids = (wire.bid ?? []).map((l) => this.level(l));
    const asks = (wire.ask ?? []).map((l) => this.level(l));
    bids.sort((a, b) => Number(b.price) - Number(a.price));
    asks.sort((a, b) => Number(a.price) - Number(b.price));
    return { name: this.name, kind: this.kind, bids, asks, time };
  }
}
