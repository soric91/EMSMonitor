import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getAlerts } from '../api/alerts';
import type { Alert } from '../api/types';
import { RealtimeContext } from './RealtimeContext';

// Mismo tope que la lista en memoria del backend.
const MAX_ALERTS = 200;

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
  const realtime = useContext(RealtimeContext);
  if (!realtime) {
    throw new Error('AlertsProvider must be used within RealtimeProvider');
  }
  const { onAlertEvent } = realtime;

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dailyTotal, setDailyTotal] = useState<Alert | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [liveAlert, setLiveAlert] = useState<Alert | null>(null);

  // Fetch inicial: lo acumulado en el backend antes de abrir esta pestaña.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const data = await getAlerts();
        if (cancelled) return;
        // Las que ya llegaron en vivo van primero; dedupe cubre el solape.
        setAlerts((prev) => dedupe([...prev, ...data.recent]));
        setDailyTotal(data.daily_total);
      } catch {
        // sin histórico inicial; el estado sigue llenándose con las alertas en vivo
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Alertas en vivo por la conexión WS compartida.
  useEffect(() => {
    return onAlertEvent((event) => {
      // WsAlertEvent extiende Alert; el campo extra `type` es inofensivo en el estado.
      const alert: Alert = event;
      setAlerts((prev) => dedupe([alert, ...prev]));
      setUnreadCount((n) => n + 1);
      setLiveAlert(alert);
    });
  }, [onAlertEvent]);

  const markAllSeen = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return (
    <AlertsContext.Provider value={{ alerts, dailyTotal, unreadCount, liveAlert, markAllSeen }}>
      {children}
    </AlertsContext.Provider>
  );
}
