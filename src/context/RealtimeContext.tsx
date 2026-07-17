import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createEmsWebSocket, type EmsWebSocketClient, type WsConnectionStatus } from '../api/websocket';
import type { Variable, WsAlertEvent, WsDataEvent } from '../api/types';

type DataListener = (event: WsDataEvent) => void;
type AlertListener = (event: WsAlertEvent) => void;

interface RealtimeContextValue {
  status: WsConnectionStatus;
  subscribedVariable: Variable | null;
  latestData: WsDataEvent | null;
  subscribe: (variable: Variable) => void;
  onDataEvent: (listener: DataListener) => () => void;
  /** Alertas del backend: llegan por la misma conexión, independiente de la variable suscrita. */
  onAlertEvent: (listener: AlertListener) => () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WsConnectionStatus>('connecting');
  const [subscribedVariable, setSubscribedVariable] = useState<Variable | null>(null);
  const [latestData, setLatestData] = useState<WsDataEvent | null>(null);
  const clientRef = useRef<EmsWebSocketClient | null>(null);
  const listenersRef = useRef(new Set<DataListener>());
  const alertListenersRef = useRef(new Set<AlertListener>());

  useEffect(() => {
    const client = createEmsWebSocket({
      onStatusChange: setStatus,
      onData: (event) => {
        setLatestData(event);
        listenersRef.current.forEach((listener) => listener(event));
      },
      onAlert: (event) => {
        alertListenersRef.current.forEach((listener) => listener(event));
      },
      onSubscribed: (event) => setSubscribedVariable(event.variable),
      onUnsubscribed: () => setSubscribedVariable(null),
    });
    clientRef.current = client;
    client.connect();

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, []);

  const subscribe = useCallback((variable: Variable) => {
    setLatestData(null);
    clientRef.current?.subscribe(variable);
  }, []);

  const onDataEvent = useCallback((listener: DataListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const onAlertEvent = useCallback((listener: AlertListener) => {
    alertListenersRef.current.add(listener);
    return () => {
      alertListenersRef.current.delete(listener);
    };
  }, []);

  return (
    <RealtimeContext.Provider
      value={{ status, subscribedVariable, latestData, subscribe, onDataEvent, onAlertEvent }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}
