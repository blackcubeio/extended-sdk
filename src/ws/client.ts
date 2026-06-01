import type { ExtendedClient, WebSocketFactory, WebSocketLike } from '../common/config';
import { USER_AGENT } from '../common/constants';
import type { JsonValue, Network } from '../common/types';
import type { StreamHandler, Unsubscribe, WsClientOptions } from '../common/ws';

// ── Robustesse WS : constantes communes aux SDK Blackcube ─────────────────────────────────────
const RECONNECT_BASE_MS = 500;
const RECONNECT_FACTOR = 2;
const RECONNECT_CAP_MS = 30_000;
const RECONNECT_JITTER = 0.2;
const RECONNECT_STABLE_MS = 10_000;
// Extended : ping serveur 15 s, pong attendu < 10 s. On ping côté client à 15 s ; idle = 3× ~.
const HEARTBEAT_INTERVAL_MS = 15_000;
const IDLE_TIMEOUT_MS = 45_000;

/** `WebSocket.OPEN` (readyState). */
const OPEN = 1;

/**
 * Client WebSocket Extended **pour un path** (souscription par PATH : 1 channel = 1 connexion). La
 * socket s'ouvre au 1er handler et se ferme au dernier (ref-counting). `User-Agent` envoyé via le
 * 2e argument du constructeur WebSocket si l'implémentation le supporte (Node `ws`).
 *
 * Robustesse (spec commune) : reconnexion backoff+jitter+cap, reset du compteur après stabilité,
 * re-câblage automatique des handlers après reconnexion (la connexion EST l'abonnement → rien à
 * rejouer côté frame, les handlers restent attachés), heartbeat (`{ type:'PING' }`) + idle-timeout
 * (détection de socket zombie), parsing JSON défensif. Extended étant **pub/sub par path** (pas de
 * frame requête/réponse), il n'y a pas de promesse en vol à rejeter au close.
 */
export class ExtendedWsClient {
  private readonly url: string;
  private readonly factory: WebSocketFactory;
  private socket: WebSocketLike | null = null;
  private open = false;
  private pending: string[] = [];
  private readonly handlers = new Set<StreamHandler>();
  private readonly heartbeatIntervalMs: number;

  private shouldReconnect = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMessageAt = 0;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;

  public onError: ((error: unknown) => void) | null = null;
  public onClose: (() => void) | null = null;
  public onReconnect: (() => void) | null = null;
  public onMessage: ((message: JsonValue) => void) | null = null;

  constructor(client: ExtendedClient, path: string, options: WsClientOptions = {}) {
    const network: Network =
      options.label !== undefined
        ? (client.signers[options.label]?.network ?? 'mainnet')
        : 'mainnet';
    const base = client.wsUrls[network];
    // Channel privé `/account` : la clé d'API est passée en query (auth à la connexion).
    const sep = path.includes('?') ? '&' : '?';
    this.url =
      options.apiKey !== undefined
        ? `${base}${path}${sep}apiKey=${options.apiKey}`
        : `${base}${path}`;
    this.factory = options.webSocket ?? client.webSocket;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  }

  /** Abonne `handler` à ce path. Ouvre la socket si nécessaire ; ferme au dernier unsub. */
  subscribe(handler: StreamHandler): Unsubscribe {
    this.handlers.add(handler);
    this.ensureOpen();
    return () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0) {
        this.close();
      }
    };
  }

  private ensureOpen(): void {
    if (this.socket === null) {
      this.connect();
    }
  }

  private connect(): void {
    if (this.socket !== null) {
      return;
    }
    this.shouldReconnect = true;
    // Le 2e argument (protocols) sert de canal pour le User-Agent côté Node `ws` ; ignoré en navigateur.
    const socket = this.makeSocket();
    this.socket = socket;
    socket.onopen = () => {
      this.open = true;
      const buffered = this.pending;
      this.pending = [];
      for (const message of buffered) {
        socket.send(message);
      }
      this.startHeartbeat();
      this.bumpIdle();
      this.stableTimer = setTimeout(() => {
        this.reconnectAttempts = 0;
        this.stableTimer = null;
      }, RECONNECT_STABLE_MS);
    };
    socket.onmessage = (event) => {
      this.dispatch(event.data);
    };
    socket.onclose = () => {
      this.handleClose();
    };
    socket.onerror = (error) => {
      if (this.onError !== null) {
        this.onError(error);
      }
    };
  }

  /** Construit la socket en tentant d'injecter le `User-Agent` (Node `ws` : 3e arg `headers`). */
  private makeSocket(): WebSocketLike {
    try {
      const withHeaders = this.factory as unknown as (
        url: string,
        protocols?: unknown,
        opts?: unknown,
      ) => WebSocketLike;
      if (withHeaders.length >= 3) {
        return withHeaders(this.url, undefined, { headers: { 'User-Agent': USER_AGENT } });
      }
    } catch {
      // ignore : repli sur la factory standard
    }
    return this.factory(this.url);
  }

  private handleClose(): void {
    this.stopHeartbeat();
    this.stopIdleTimer();
    if (this.stableTimer !== null) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    this.open = false;
    this.socket = null;
    if (this.onClose !== null) {
      this.onClose();
    }
    if (this.shouldReconnect === true) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.shouldReconnect === false || this.reconnectTimer !== null) {
      return;
    }
    const capped = Math.min(
      RECONNECT_BASE_MS * RECONNECT_FACTOR ** this.reconnectAttempts,
      RECONNECT_CAP_MS,
    );
    const jitter = capped * RECONNECT_JITTER * (2 * Math.random() - 1);
    const delay = Math.max(0, Math.round(capped + jitter));
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      try {
        this.connect();
        if (this.onReconnect !== null) {
          this.onReconnect();
        }
      } catch (error) {
        if (this.onError !== null) {
          this.onError(error);
        }
        this.scheduleReconnect();
      }
    }, delay);
  }

  // ── Heartbeat + idle-timeout ──

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.rawSend(JSON.stringify({ type: 'PING' }));
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private bumpIdle(): void {
    this.lastMessageAt = Date.now();
    this.stopIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (Date.now() - this.lastMessageAt >= IDLE_TIMEOUT_MS) {
        this.forceReconnect();
      }
    }, IDLE_TIMEOUT_MS);
  }

  private stopIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private forceReconnect(): void {
    if (this.socket !== null) {
      this.socket.close();
    }
  }

  private rawSend(message: string): void {
    if (this.open && this.socket !== null && this.socket.readyState === OPEN) {
      this.socket.send(message);
    } else {
      this.pending.push(message);
    }
  }

  private dispatch(raw: unknown): void {
    this.bumpIdle();
    let message: JsonValue;
    try {
      message = JSON.parse(String(raw)) as JsonValue;
    } catch {
      if (this.onError !== null) {
        this.onError(new Error('WebSocket : message JSON illisible ignoré'));
      }
      return;
    }
    if (this.onMessage !== null) {
      this.onMessage(message);
    }
    for (const handler of this.handlers) {
      handler(message);
    }
  }

  /** Ferme la socket et purge l'état (appelé au dernier unsubscribe). Désactive la reconnexion. */
  close(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    this.stopIdleTimer();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stableTimer !== null) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    this.reconnectAttempts = 0;
    if (this.socket !== null) {
      this.socket.close();
      this.socket = null;
    }
    this.open = false;
    this.pending = [];
    this.handlers.clear();
  }
}
