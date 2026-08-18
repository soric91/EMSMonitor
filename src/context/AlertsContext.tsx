import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useDevice } from '../hooks/useDevice';
import { getAlerts } from '../api/alerts';
import type { Alert } from '../api/types';
import { RealtimeContext } from './RealtimeContext';

// Mismo tope que la lista en memoria del backend.
const MAX_ALERTS = 200;

/** Identidad estable: se devuelve en cada render mientras no haya alertas propias. */
const SIN_ALERTAS: Alert[] = [];

interface AlertsContextValue {
  alerts: Alert[];
  dailyTotal: Alert | null;
  unreadCount: number;
  /** Última alerta llegada en vivo por WS (para toasts); null hasta que llegue una. */
  liveAlert: Alert | null;
  markAllSeen: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AlertsContext = createContext<AlertsContextValue | null>(null);

function alertKey(alert: Alert): string {
  return `${alert.kind}|${alert.timestamp}|${alert.variable}|${alert.device_id ?? ''}`;
}

function dedupe(alerts: Alert[]): Alert[] {
  const seen = new Set<string>();
  const result: Alert[] = [];
  for (const alert of alerts) {
    const key = alertKey(alert);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(alert);
  }
  return result.slice(0, MAX_ALERTS);
}

export function AlertsProvider({ children }: { children: ReactNode }) {
  const { selectedDeviceId, cargando: cargandoInventario } = useDevice();
  const realtime = useContext(RealtimeContext);
  if (!realtime) {
    throw new Error('AlertsProvider must be used within RealtimeProvider');
  }
  const { onAlertEvent } = realtime;

  // Las alertas viajan junto al medidor al que pertenecen: al cambiar de
  // equipo, las del anterior se reconocen como ajenas al leerlas en vez de
  // borrarse desde el efecto. Antes se acumulaban unas sobre otras —el fetch
  // nuevo hacía `dedupe([...prev, ...])`— y el panel terminaba mostrando juntas
  // las de dos acometidas distintas.
  const [estado, setEstado] = useState<{
    device: string | null;
    alerts: Alert[];
    dailyTotal: Alert | null;
  }>({ device: null, alerts: [], dailyTotal: null });
  const [unreadCount, setUnreadCount] = useState(0);
  const [liveAlert, setLiveAlert] = useState<Alert | null>(null);

  const esDelMedidor = estado.device === selectedDeviceId;
  const alerts = esDelMedidor ? estado.alerts : SIN_ALERTAS;
  const dailyTotal = esDelMedidor ? estado.dailyTotal : null;

  // Fetch inicial: lo acumulado en el backend antes de abrir esta pestaña.
  useEffect(() => {
    // Se espera al inventario: pedirlo antes traía las alertas de TODOS los
    // medidores del cliente, y esa primera lista se quedaba mezclada con la del
    // medidor elegido (el fetch siguiente acumulaba sobre ella en vez de
    // reemplazarla).
    if (cargandoInventario) return;
    let cancelled = false;

    async function run() {
      try {
        const data = await getAlerts({ device_id: selectedDeviceId ?? undefined });
        if (cancelled) return;
        // Las que ya llegaron en vivo van primero; dedupe cubre el solape.
        setEstado((prev) => ({
          device: selectedDeviceId,
          alerts: dedupe([
            ...(prev.device === selectedDeviceId ? prev.alerts : SIN_ALERTAS),
            ...data.recent,
          ]),
          dailyTotal: data.daily_total,
        }));
      } catch {
        // sin histórico inicial; el estado sigue llenándose con las alertas en vivo
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // Cambiar de medidor vuelve a pedir: los datos son de ese medidor, no de
    // la empresa entera.
  }, [selectedDeviceId, cargandoInventario]);

  // Alertas en vivo por la conexión WS compartida.
  useEffect(() => {
    return onAlertEvent((event) => {
      // WsAlertEvent extiende Alert; el campo extra `type` es inofensivo en el estado.
      const alert: Alert = event;
      setEstado((prev) => ({
        ...prev,
        device: selectedDeviceId,
        alerts: dedupe([
          alert,
          ...(prev.device === selectedDeviceId ? prev.alerts : SIN_ALERTAS),
        ]),
      }));
      setUnreadCount((n) => n + 1);
      setLiveAlert(alert);
    });
  }, [onAlertEvent, selectedDeviceId]);

  const markAllSeen = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return (
    <AlertsContext.Provider value={{ alerts, dailyTotal, unreadCount, liveAlert, markAllSeen }}>
      {children}
    </AlertsContext.Provider>
  );
}
