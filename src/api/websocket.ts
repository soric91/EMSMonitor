import { getAccessToken } from './tokenStore';

// Con el que se anuncia que la conexión trae credencial. ApiEMS lo devuelve
// en la respuesta del handshake; si no lo devolviera, el navegador cerraría
// la conexión por su cuenta.
const BEARER = 'bearer';
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
  // Qué hay que volver a pedir al reconectar. Guarda también el equipo: sin
  // él, una reconexión restauraba la variable pero perdía el medidor elegido y
  // el panel volvía a recibir los de toda la flota, en silencio.
  private pendingVariable: Variable | null = null;
  private pendingDeviceId: string | null = null;
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

    // El token viaja como subprotocolo, no en la URL.
    //
    // El navegador no deja poner cabeceras propias en el handshake de un
    // WebSocket, pero sí ofrecer subprotocolos, y esos van en
    // `Sec-WebSocket-Protocol` — que es una cabecera. Con el token en la URL
    // quedaba escrito en los logs de acceso del servidor, en los del proxy y
    // en el historial, y el navegador imprimía la URL entera —token incluido—
    // cada vez que una conexión fallaba.
    //
    // Se lee en cada reconexión y no una sola vez al construir: un socket que
    // se recupera media hora después tiene que usar el token vigente, no el
    // que había cuando se abrió la pantalla.
    const token = getAccessToken();
    const socket = token ? new WebSocket(this.url, [BEARER, token]) : new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.options.onStatusChange?.('connected');
      if (this.pendingVariable) {
        this.send({
          action: 'subscribe',
          variable: this.pendingVariable,
          device_id: this.pendingDeviceId,
        });
      }
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      // Un socket que ya se descartó pero todavía no terminó de cerrarse
      // puede entregar un mensaje. Sin esto, esa lectura tardía entra al
      // buffer de una pestaña que el usuario ya abandonó.
      if (this.closedByClient) return;
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

  /**
   * Pide una variable, opcionalmente de un solo equipo.
   *
   * Sin `deviceId` llegan las lecturas de todos los medidores del cliente, que
   * es lo correcto mientras no se eligió uno. Con él, el filtro lo hace el
   * servidor: descartar en el navegador significaría recibir diecinueve
   * mensajes por segundo para tirarlos.
   */
  subscribe(variable: Variable, deviceId: string | null = null): void {
    this.pendingVariable = variable;
    this.pendingDeviceId = deviceId;
    this.send({ action: 'subscribe', variable, device_id: deviceId });
  }

  unsubscribe(): void {
    this.pendingVariable = null;
    this.pendingDeviceId = null;
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

    const socket = this.socket;
    this.socket = null;
    if (!socket) return;

    if (socket.readyState === WebSocket.CONNECTING) {
      // Cerrar durante el handshake lo aborta, y el navegador lo reporta como
      // un error en rojo: "WebSocket is closed before the connection is
      // established". No rompe nada —la conexión igual se descarta— pero es
      // ruido indistinguible de una falla real, y en la consola se ve peor
      // porque el mensaje incluye la URL entera.
      //
      // Pasa todo el tiempo: React en desarrollo monta y desmonta cada efecto
      // dos veces, y cambiar de pestaña en la gráfica abre y cierra las
      // conexiones de las fases en cuestión de milisegundos.
      socket.addEventListener('open', () => socket.close(), { once: true });
      return;
    }

    socket.close();
  }
}

export function createEmsWebSocket(options?: EmsWebSocketOptions): EmsWebSocketClient {
  const url = import.meta.env.PUBLIC_WS_URL;
  return new EmsWebSocketClient(url, options);
}
