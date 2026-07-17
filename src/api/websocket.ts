import type { Variable, WsClientMessage, WsServerEvent } from './types';

export type WsConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface EmsWebSocketOptions {
  onData?: (event: Extract<WsServerEvent, { type: 'data' }>) => void;
  onSubscribed?: (event: Extract<WsServerEvent, { type: 'subscribed' }>) => void;
  onUnsubscribed?: () => void;
  onError?: (event: Extract<WsServerEvent, { type: 'error' }>) => void;
  /** Las alertas llegan a todos los clientes conectados, independiente de la variable suscrita. */
  onAlert?: (event: Extract<WsServerEvent, { type: 'alert' }>) => void;
  onStatusChange?: (status: WsConnectionStatus) => void;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

export class EmsWebSocketClient {
  private socket: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingVariable: Variable | null = null;
  private closedByClient = false;

  constructor(
    private readonly url: string,
    private readonly options: EmsWebSocketOptions = {},
  ) {}

  connect(): void {
    this.closedByClient = false;
    this.openSocket();
  }

  private openSocket(): void {
    this.options.onStatusChange?.(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.options.onStatusChange?.('connected');
      if (this.pendingVariable) {
        this.send({ action: 'subscribe', variable: this.pendingVariable });
      }
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      let parsed: WsServerEvent;
      try {
        parsed = JSON.parse(event.data) as WsServerEvent;
      } catch {
        return;
      }
      this.handleEvent(parsed);
    };

    socket.onerror = () => {
      socket.close();
    };

    socket.onclose = () => {
      this.options.onStatusChange?.('disconnected');
      if (!this.closedByClient) {
        this.scheduleReconnect();
      }
    };
  }

  private handleEvent(event: WsServerEvent): void {
    switch (event.type) {
      case 'data':
        this.options.onData?.(event);
        break;
      case 'subscribed':
        this.options.onSubscribed?.(event);
        break;
      case 'unsubscribed':
        this.options.onUnsubscribed?.();
        break;
      case 'error':
        this.options.onError?.(event);
        break;
      case 'alert':
        this.options.onAlert?.(event);
        break;
      case 'pong':
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(BASE_BACKOFF_MS * 2 ** this.reconnectAttempt, MAX_BACKOFF_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private send(message: WsClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  subscribe(variable: Variable): void {
    this.pendingVariable = variable;
    this.send({ action: 'subscribe', variable });
  }

  unsubscribe(): void {
    this.pendingVariable = null;
    this.send({ action: 'unsubscribe' });
  }

  ping(): void {
    this.send({ action: 'ping' });
  }

  close(): void {
    this.closedByClient = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }
}

export function createEmsWebSocket(options?: EmsWebSocketOptions): EmsWebSocketClient {
  const url = import.meta.env.PUBLIC_WS_URL;
  return new EmsWebSocketClient(url, options);
}
