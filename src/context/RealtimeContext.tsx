import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useVariables } from '../hooks/useVariables';
import { useDevice } from '../hooks/useDevice';
import {
  createEmsWebSocket,
  type EmsWebSocketClient,
  type WsConnectionStatus,
} from '../api/websocket';
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
  const { declaradas, cargando } = useVariables();
  const { selectedDeviceId } = useDevice();
  const [estadoConexion, setStatus] = useState<WsConnectionStatus>('connecting');
  const [subscribedVariable, setSubscribedVariable] = useState<Variable | null>(null);
  const [ultimo, setUltimo] = useState<WsDataEvent | null>(null);
  // El evento ya dice de qué medidor viene, así que no hace falta guardarlo ni
  // vaciarlo al cambiar de sede: el último dato del medidor anterior deja de
  // darse por bueno solo. Vaciarlo desde el efecto que resuscribe —como se
  // hacía— disparaba un render en cascada por cada cambio de selección.
  const latestData = ultimo?.device_id === selectedDeviceId ? ultimo : null;
  const clientRef = useRef<EmsWebSocketClient | null>(null);
  const listenersRef = useRef(new Set<DataListener>());
  const alertListenersRef = useRef(new Set<AlertListener>());

  // Un proyecto sin variables cargadas no tiene nada que suscribir ni de qué
  // alertar: las alertas salen de las lecturas, y sin variables no llega
  // ninguna. Abrir el socket igual dejaba un ciclo de reconexión con backoff
  // corriendo para siempre contra algo que nunca iba a tener datos.
  //
  // Se espera a saber: mientras `cargando` es true todavía no se sabe si hay
  // variables, y conectar ahí sería adivinar.
  //
  // Cuenta las **declaradas**, no las que ya tienen datos. Una variable sin
  // histórico puede estar llegando en vivo justo ahora —es literalmente el
  // caso de un medidor recién instalado, y el de un almacenamiento caído con
  // el gateway publicando bien— y mirar solo las que tienen datos cerraría el
  // socket precisamente cuando el tiempo real es lo único que hay.
  const hayQueSuscribir = !cargando && declaradas > 0;

  // Sin socket que abrir, el estado se deriva: guardarlo obligaba a
  // corregirlo desde el efecto, y quedaba en "conectando" para siempre
  // mientras nadie intentaba conectar nada.
  const status: WsConnectionStatus = hayQueSuscribir ? estadoConexion : 'disconnected';

  useEffect(() => {
    if (!hayQueSuscribir) return;

    const client = createEmsWebSocket({
      onStatusChange: setStatus,
      onData: (event) => {
        setUltimo(event);
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
  }, [hayQueSuscribir]);

  // El equipo elegido viaja con la suscripción. Sin él, un cliente con varios
  // medidores recibía los de todos para la misma variable y quien escuchaba se
  // quedaba con el último que llegara: la cifra saltaba entre medidores.
  const subscribe = useCallback(
    (variable: Variable) => {
      clientRef.current?.subscribe(variable, selectedDeviceId);
    },
    [selectedDeviceId],
  );

  // Cambiar de medidor vuelve a pedir la misma variable, ahora acotada al
  // nuevo. Sin esto habría que acordarse de resuscribir en cada pantalla que
  // ofrezca el selector.
  useEffect(() => {
    if (subscribedVariable === null) return;
    clientRef.current?.subscribe(subscribedVariable, selectedDeviceId);
    // `subscribedVariable` queda fuera a propósito: reaccionar a él volvería a
    // suscribir en respuesta al ack de la suscripción anterior, en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId]);

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
