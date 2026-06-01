import type { ExtendedClient } from '../common/config';
import type { NativeCandle } from '../common/native';
import type { Candle } from '../common/types';
import { toResolution } from '../common/utils';
import { CandleConverter } from '../converters/candle';
import { httpGet } from './client';

export interface GetCandlesParams {
  name: string;
  interval: string;
  /** Type de bougie Extended : `trades` (défaut), `mark-prices`, `index-prices`. */
  candleType?: 'trades' | 'mark-prices' | 'index-prices';
  /** Fin (ms). */
  endTime?: number;
  limit?: number;
}

/**
 * Bougies unifiées (`/info/candles/{m}/{candleType}`). `interval` unifié (`1m`,`1h`…) → résolution
 * Extended (`PT1M`,`PT1H`…) ; intervalle non supporté = liste vide (no-throw). `limit` requis par
 * l'API → défaut 100.
 */
export function getCandles(
  client: ExtendedClient,
  query: GetCandlesParams,
  label?: string,
): Promise<Candle[]> {
  const resolution = toResolution(query.interval);
  if (resolution === undefined) {
    return Promise.resolve([]);
  }
  const candleType = query.candleType ?? 'trades';
  return httpGet<NativeCandle[]>(
    client,
    `/info/candles/${query.name}/${candleType}`,
    {
      interval: resolution,
      limit: query.limit ?? 100,
      endTime: query.endTime,
    },
    label,
  ).then((env) => {
    const converter = new CandleConverter(query.name, query.interval, 'perp');
    return (env.data ?? []).map((c) => converter.toCommon(c));
  });
}
