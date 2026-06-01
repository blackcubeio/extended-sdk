import type { ExtendedClient } from '../common/config';
import type { NativeMarket } from '../common/native';
import type { Pair, Price } from '../common/types';
import { PairConverter } from '../converters/pair';
import { PriceConverter } from '../converters/price';
import { httpGet } from './client';

/** Liste brute des marchés (`/info/markets`) — sert au cache de résolution (l2Config, scaling). */
export function fetchMarkets(client: ExtendedClient, label?: string): Promise<NativeMarket[]> {
  return httpGet<NativeMarket[]>(client, '/info/markets', undefined, label).then(
    (env) => env.data ?? [],
  );
}

/** Marchés au format unifié {@link Pair}. */
export function getPairs(client: ExtendedClient, label?: string): Promise<Pair[]> {
  const converter = new PairConverter();
  return fetchMarkets(client, label).then((markets) => markets.map((m) => converter.toCommon(m)));
}

/** Prix unifiés de tous les marchés (depuis `marketStats` de `/info/markets`). */
export function getPrices(client: ExtendedClient, label?: string): Promise<Price[]> {
  const converter = new PriceConverter('perp');
  return fetchMarkets(client, label).then((markets) => markets.map((m) => converter.toCommon(m)));
}
