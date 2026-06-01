import type { ExtendedClient } from '../common/config';
import type { NativeOrderBook } from '../common/native';
import type { OrderBook } from '../common/types';
import { OrderBookConverter } from '../converters/order-book';
import { httpGet } from './client';

export interface GetOrderBookParams {
  name: string;
  depth?: number;
}

/** Carnet d'ordres unifié (`/info/markets/{m}/orderbook`). */
export function getOrderBook(
  client: ExtendedClient,
  query: GetOrderBookParams,
  label?: string,
): Promise<OrderBook> {
  return httpGet<NativeOrderBook>(
    client,
    `/info/markets/${query.name}/orderbook`,
    { depth: query.depth },
    label,
  ).then((env) => new OrderBookConverter(query.name, 'perp').toCommon(env.data ?? {}, null));
}
