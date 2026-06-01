import type { ExtendedClient } from '../common/config';
import type { NativeBalance, NativeOrder, NativePosition, NativeUserTrade } from '../common/native';
import type { Balance, Order, Position, QueryParams, UserTrade } from '../common/types';
import { BalanceConverter } from '../converters/balance';
import { OrderConverter } from '../converters/order';
import { PositionConverter } from '../converters/position';
import { UserTradeConverter } from '../converters/user-trade';
import { httpGet } from './client';

/** Solde de compte unifié (`/user/balance`). Le compte Extended a un collatéral USD unique. */
export function getBalances(
  client: ExtendedClient,
  apiKey: string,
  label?: string,
): Promise<Balance[]> {
  const converter = new BalanceConverter();
  return httpGet<NativeBalance | NativeBalance[]>(
    client,
    '/user/balance',
    undefined,
    label,
    apiKey,
  ).then((env) => {
    const data = env.data;
    const list = Array.isArray(data) ? data : data != null ? [data] : [];
    return list.map((b) => converter.toCommon(b));
  });
}

/** Positions ouvertes unifiées (`/user/positions`, filtre `market` optionnel). */
export function getPositions(
  client: ExtendedClient,
  apiKey: string,
  market?: string,
  label?: string,
): Promise<Position[]> {
  const converter = new PositionConverter();
  const query: QueryParams = market !== undefined ? { market } : {};
  return httpGet<NativePosition[]>(client, '/user/positions', query, label, apiKey).then((env) =>
    (env.data ?? []).map((p) => converter.toCommon(p)),
  );
}

/** Ordres ouverts unifiés (`/user/orders`, filtre `market` optionnel). */
export function getOpenOrders(
  client: ExtendedClient,
  apiKey: string,
  market?: string,
  label?: string,
): Promise<Order[]> {
  const converter = new OrderConverter('perp');
  const query: QueryParams = market !== undefined ? { market } : {};
  return httpGet<NativeOrder[]>(client, '/user/orders', query, label, apiKey).then((env) =>
    (env.data ?? []).map((o) => converter.toCommon(o)),
  );
}

/** Historique d'ordres unifié (`/user/orders/history`). */
export function getOrderHistory(
  client: ExtendedClient,
  apiKey: string,
  market?: string,
  label?: string,
): Promise<Order[]> {
  const converter = new OrderConverter('perp');
  const query: QueryParams = market !== undefined ? { market } : {};
  return httpGet<NativeOrder[]>(client, '/user/orders/history', query, label, apiKey).then((env) =>
    (env.data ?? []).map((o) => converter.toCommon(o)),
  );
}

/** Fills (user trades) unifiés (`/user/trades`, filtre `market` optionnel). */
export function getUserTrades(
  client: ExtendedClient,
  apiKey: string,
  market?: string,
  label?: string,
): Promise<UserTrade[]> {
  const converter = new UserTradeConverter('perp');
  const query: QueryParams = market !== undefined ? { market } : {};
  return httpGet<NativeUserTrade[]>(client, '/user/trades', query, label, apiKey).then((env) =>
    (env.data ?? []).map((t) => converter.toCommon(t)),
  );
}

/** État de compte brut (`/user/account/info`). Passe-plat non normalisé (pas de forme commune). */
export function getAccountInfo(
  client: ExtendedClient,
  apiKey: string,
  label?: string,
): Promise<unknown> {
  return httpGet<unknown>(client, '/user/account/info', undefined, label, apiKey).then(
    (env) => env.data ?? env,
  );
}
