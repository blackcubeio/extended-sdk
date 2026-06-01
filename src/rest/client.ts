import type { ExtendedClient } from '../common/config';
import { USER_AGENT } from '../common/constants';
import type { ExtendedEnvelope } from '../common/native';
import type { Network, QueryParams } from '../common/types';

/**
 * Réseau d'une **lecture**. Le label est optionnel : sans label on retombe sur le **mainnet** (les
 * lectures publiques ne touchent pas au compte) ; avec un label on tape sur le réseau de son signer.
 */
export function resolveReadNetwork(client: ExtendedClient, label?: string): Network {
  if (label === undefined) {
    return 'mainnet';
  }
  const signer = client.signers[label];
  if (signer === undefined) {
    throw new Error(`Aucun signer enregistré sous "${label}"; ajoute-le dans init({ signers }).`);
  }
  return signer.network;
}

export class ExtendedApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: number | string | null,
    message: string,
  ) {
    super(message);
    this.name = 'ExtendedApiError';
  }
}

export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const url = new URL(baseUrl + path);
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/** En-têtes communs : `User-Agent` **obligatoire** ; `X-Api-Key` si une clé est fournie. */
function headers(apiKey?: string, body = false): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json', 'User-Agent': USER_AGENT };
  if (body) {
    h['Content-Type'] = 'application/json';
  }
  if (apiKey !== undefined) {
    h['X-Api-Key'] = apiKey;
  }
  return h;
}

/**
 * Clés d'identifiants 64 bits que l'API renvoie en **entiers JSON** : au-delà de 2^53, `JSON.parse`
 * les corromprait (ex. `id` d'ordre `2061434534138703872` → `…704000`, donc cancel sur un mauvais id).
 * On **re-cite** leurs littéraux entiers (≥ 16 chiffres) avant le parse pour les conserver en chaînes.
 */
const BIG_INT_ID_KEYS = ['id', 'orderId', 'externalId', 'accountId'];

/** Re-cite les littéraux entiers longs des clés id pour préserver la précision 64 bits. */
function quoteBigIntIds(json: string): string {
  const keys = BIG_INT_ID_KEYS.join('|');
  // `"id":1234567890123456789` (≥ 16 chiffres, non déjà entre guillemets) → `"id":"1234…"`.
  const re = new RegExp(`("(?:${keys})"\\s*:\\s*)(\\d{16,})`, 'g');
  return json.replace(re, '$1"$2"');
}

/** Parse l'enveloppe `{status,data,error}` Extended (parsing défensif, erreurs typées). */
function parseEnvelope<T>(response: Response): Promise<ExtendedEnvelope<T>> {
  return response.text().then((body) => {
    let parsed: ExtendedEnvelope<T> | null = null;
    if (body !== '') {
      try {
        parsed = JSON.parse(quoteBigIntIds(body)) as ExtendedEnvelope<T>;
      } catch {
        parsed = null;
      }
    }
    if (response.ok === false) {
      const message = parsed?.error?.message ?? (body === '' ? `HTTP ${response.status}` : body);
      throw new ExtendedApiError(response.status, parsed?.error?.code ?? null, message);
    }
    if (parsed === null) {
      throw new ExtendedApiError(response.status, null, body === '' ? 'Réponse vide' : body);
    }
    if (parsed.status !== undefined && parsed.status !== 'OK' && parsed.error != null) {
      throw new ExtendedApiError(
        response.status,
        parsed.error.code ?? null,
        parsed.error.message ?? 'Requête échouée',
      );
    }
    return parsed;
  });
}

/**
 * Détecte le **404 « nu »** que renvoie par intermittence le pool d'origine testnet Extended sur les
 * écritures `/user/order*` : statut 404, **corps vide** (ni enveloppe JSON ni en-têtes CloudFront). Ce
 * n'est pas un « resource not found » applicatif — seule une fraction des instances d'origine porte la
 * route, donc la même requête signée réussit (200) après quelques essais. On le distingue d'un vrai 404
 * applicatif (qui, lui, porte une enveloppe `{error}`) par l'absence de `code` et un message vide/HTTP brut.
 */
function isFlakyEdge404(error: unknown): boolean {
  return (
    error instanceof ExtendedApiError &&
    error.status === 404 &&
    error.code === null &&
    /^(HTTP 404)?$/.test(error.message.trim())
  );
}

/** Rejoue `attempt()` tant que l'origine renvoie le 404 nu intermittent (cf. {@link isFlakyEdge404}). */
async function retryFlakyEdge<T>(attempt: () => Promise<T>, max = 40, delayMs = 200): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < max; i++) {
    try {
      return await attempt();
    } catch (error) {
      if (isFlakyEdge404(error) === false) {
        throw error;
      }
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

/** Lecture (publique ou authentifiée). `apiKey` ajoute `X-Api-Key` ; `label` choisit le réseau. */
export function httpGet<T>(
  client: ExtendedClient,
  path: string,
  query?: QueryParams,
  label?: string,
  apiKey?: string,
): Promise<ExtendedEnvelope<T>> {
  const url = buildUrl(client.restUrls[resolveReadNetwork(client, label)], path, query);
  return client
    .fetch(url, { method: 'GET', headers: headers(apiKey) })
    .then((r) => parseEnvelope<T>(r));
}

/** Écriture signée (`X-Api-Key` + corps JSON déjà signé Stark). */
export function httpPost<T>(
  client: ExtendedClient,
  path: string,
  apiKey: string,
  body: unknown,
  label?: string,
): Promise<ExtendedEnvelope<T>> {
  const url = buildUrl(client.restUrls[resolveReadNetwork(client, label)], path);
  const serialized = JSON.stringify(body);
  return retryFlakyEdge(() =>
    client
      .fetch(url, { method: 'POST', headers: headers(apiKey, true), body: serialized })
      .then((r) => parseEnvelope<T>(r)),
  );
}

/** Variante PATCH (ex. levier). */
export function httpPatch<T>(
  client: ExtendedClient,
  path: string,
  apiKey: string,
  body: unknown,
  label?: string,
): Promise<ExtendedEnvelope<T>> {
  const url = buildUrl(client.restUrls[resolveReadNetwork(client, label)], path);
  const serialized = JSON.stringify(body);
  return retryFlakyEdge(() =>
    client
      .fetch(url, { method: 'PATCH', headers: headers(apiKey, true), body: serialized })
      .then((r) => parseEnvelope<T>(r)),
  );
}

/** Suppression signée (ex. cancel order ; corps optionnel). */
export function httpDelete<T>(
  client: ExtendedClient,
  path: string,
  apiKey: string,
  query?: QueryParams,
  body?: unknown,
  label?: string,
): Promise<ExtendedEnvelope<T>> {
  const url = buildUrl(client.restUrls[resolveReadNetwork(client, label)], path, query);
  const init: RequestInit = { method: 'DELETE', headers: headers(apiKey, body !== undefined) };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return retryFlakyEdge(() => client.fetch(url, init).then((r) => parseEnvelope<T>(r)));
}
