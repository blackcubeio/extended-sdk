import type { WebSocketFactory } from './config';
import type { JsonValue } from './types';

export type StreamHandler = (data: JsonValue) => void;

export type Unsubscribe = () => void;

export interface WsClientOptions {
  /** Label du signer (cf. init) : choisit le réseau du socket et l'auth des channels privés. */
  label?: string;
  /** Clé d'API pour les channels privés (`/account`), envoyée à la connexion. */
  apiKey?: string;
  webSocket?: WebSocketFactory;
  /** Intervalle du ping (ms). Extended ping serveur ~15 s, pong attendu < 10 s. Défaut 15 s. */
  heartbeatIntervalMs?: number;
}
