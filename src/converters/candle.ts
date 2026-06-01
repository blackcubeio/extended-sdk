import type { NativeCandle } from '../common/native';
import type { Candle, MarketKind } from '../common/types';
import { intervalToMs } from '../common/utils';
import { xtrasOf } from './xtras';

const KNOWN = ['o', 'h', 'l', 'c', 'v', 'T'] as const;

/**
 * Convertisseur bougie Extended (`/info/candles/{m}/{type}`) ↔ {@link Candle} unifiée. Le wire porte
 * `T` (open time **ms**) et `o/h/l/c/v` ; le nom et l'intervalle sont passés au constructeur. Le
 * `close time` est calculé via l'intervalle.
 */
export class CandleConverter {
  private readonly span: number;

  constructor(
    private readonly name: string,
    private readonly interval: string,
    private readonly kind: MarketKind = 'perp',
  ) {
    this.span = intervalToMs(interval);
  }

  toCommon(wire: NativeCandle): Candle {
    const t = wire.T;
    return {
      t,
      T: this.span > 0 ? t + this.span : t,
      s: this.name,
      i: this.interval,
      o: String(wire.o),
      c: String(wire.c),
      h: String(wire.h),
      l: String(wire.l),
      v: String(wire.v),
      n: 0,
      kind: this.kind,
      qv: null,
      tbbv: null,
      tbqv: null,
      xtras: xtrasOf(wire, KNOWN),
    };
  }

  toNative(candle: Candle): NativeCandle {
    return {
      T: candle.t,
      o: candle.o,
      h: candle.h,
      l: candle.l,
      c: candle.c,
      v: candle.v,
      ...(candle.xtras as Record<string, unknown> | undefined),
    };
  }
}
