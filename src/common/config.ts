import { ONBOARDING_URLS, REST_URLS, WS_URLS } from './constants';
import type { Network, Signer } from './types';

export type { Network };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface InitOptions {
  fetch?: FetchLike;
  webSocket?: WebSocketFactory;
  /** Registre de signers indexés par label. Chaque signer porte son propre réseau. */
  signers?: Record<string, Signer>;
  /** Override de l'URL REST de base par réseau. */
  restUrls?: Partial<Record<Network, string>>;
  /** Override de l'URL WebSocket de base par réseau. */
  wsUrls?: Partial<Record<Network, string>>;
  /** Override de l'URL d'onboarding par réseau. */
  onboardingUrls?: Partial<Record<Network, string>>;
}

/**
 * Contexte d'exécution **isolé** d'un SDK Extended : fetch, urls, signers. Créé par {@link init} et
 * **passé explicitement** à chaque fonction REST/WS (`getCandles(client, …)`) — pas de singleton, donc
 * plusieurs clients (comptes/réseaux différents) coexistent sans se piétiner. La signature StarkEx
 * (SNIP-12) est dérivée de la clé Stark L2 du signer choisi par label ; le header `X-Api-Key` porte
 * son `apiKey`.
 */
export interface ExtendedClient {
  fetch: FetchLike;
  webSocket: WebSocketFactory;
  signers: Record<string, Signer>;
  restUrls: Record<Network, string>;
  wsUrls: Record<Network, string>;
  onboardingUrls: Record<Network, string>;
}

function defaultFetch(): FetchLike {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Aucun `fetch` global ; passez options.fetch à init().');
  }
  return globalThis.fetch.bind(globalThis) as FetchLike;
}

function defaultWebSocketFactory(): WebSocketFactory {
  const Ctor = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket;
  if (typeof Ctor !== 'function') {
    throw new Error('Aucune implémentation WebSocket ; passez options.webSocket à init().');
  }
  return (url: string) => new Ctor(url);
}

/** Construit le contexte isolé. Lectures publiques : `init({})` suffit (sans signer). */
export function init(options: InitOptions = {}): ExtendedClient {
  return {
    fetch: options.fetch ?? defaultFetch(),
    webSocket: options.webSocket ?? defaultWebSocketFactory(),
    signers: options.signers ?? {},
    restUrls: { ...REST_URLS, ...options.restUrls },
    wsUrls: { ...WS_URLS, ...options.wsUrls },
    onboardingUrls: { ...ONBOARDING_URLS, ...options.onboardingUrls },
  };
}
