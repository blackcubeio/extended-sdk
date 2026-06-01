import type { ExtendedClient } from '../common/config';
import type { NativeFunding } from '../common/native';
import type { FundingRate } from '../common/types';
import { FundingConverter } from '../converters/funding';
import { httpGet } from './client';

export interface GetFundingParams {
  name: string;
  /** Début (ms) — requis par l'API. */
  startTime?: number;
  /** Fin (ms) — requis par l'API. */
  endTime?: number;
  limit?: number;
}

/**
 * Historique de funding unifié (`/info/{m}/funding`). `startTime`/`endTime` requis par l'API → défaut
 * sur les 7 derniers jours si absents.
 */
export function getFundingHistory(
  client: ExtendedClient,
  query: GetFundingParams,
  label?: string,
): Promise<FundingRate[]> {
  const end = query.endTime ?? Date.now();
  const start = query.startTime ?? end - 7 * 86_400_000;
  const converter = new FundingConverter(query.name);
  return httpGet<NativeFunding[]>(
    client,
    `/info/${query.name}/funding`,
    { startTime: start, endTime: end, limit: query.limit },
    label,
  ).then((env) => (env.data ?? []).map((f) => converter.toCommon(f)));
}
