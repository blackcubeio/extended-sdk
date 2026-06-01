import type { NativeMarket, NativeMarketStats } from '../common/native';
import type { MarketKind, Price } from '../common/types';

const str = (v: unknown): string | null => (v != null ? String(v) : null);

/**
 * Convertisseur prix : `marketStats` natif d'un marché Extended (`/info/markets` ou
 * `/info/markets/{m}/stats`) ↔ {@link Price} unifié.
 */
export class PriceConverter {
  constructor(private readonly kind: MarketKind = 'perp') {}

  toCommon(market: NativeMarket, stats?: NativeMarketStats): Price {
    const s = stats ?? market.marketStats ?? {};
    return {
      name: market.name,
      kind: this.kind,
      mark: str(s.markPrice),
      oracle: str(s.indexPrice),
      mid: null,
      bid: str(s.bidPrice),
      ask: str(s.askPrice),
      last: str(s.lastPrice),
      funding: str(s.fundingRate),
      openInterest: str(s.openInterest),
      volume24h: str(s.dailyVolume),
      prevDayPrice: null,
      time: null,
    };
  }
}
