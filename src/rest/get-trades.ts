import type { ExtendedClient } from '../common/config';
import type { NativeTrade } from '../common/native';
import type { Trade } from '../common/types';
import { TradeConverter } from '../converters/trade';
import { httpGet } from './client';

export interface GetTradesParams {
  name: string;
  limit?: number;
}

/** Trades publics unifiés (`/info/markets/{m}/trades`). */
export function getTrades(
  client: ExtendedClient,
  query: GetTradesParams,
  label?: string,
): Promise<Trade[]> {
  const converter = new TradeConverter();
  return httpGet<NativeTrade[]>(
    client,
    `/info/markets/${query.name}/trades`,
    { limit: query.limit },
    label,
  ).then((env) => (env.data ?? []).map((t) => converter.toCommon(t)));
}
