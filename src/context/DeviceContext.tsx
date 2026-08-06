import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import { getRealtimeLatest } from '../api/realtime';
import type { DeviceSnapshot } from '../api/types';

// Selector de medidor global (Fase 3, prompt_arquitectura_v2.md): la mayoría de
// endpoints (analytics/history/reports/costos) ya aceptan `device_id`, lo que
// faltaba era una única fuente de "qué dispositivos existen" para toda la app
// en vez de que cada página asuma un solo medidor implícito.
//
// Fuente: GET /realtime/latest (ya devuelve un DeviceSnapshot por dispositivo
// activo) — no un endpoint nuevo. El árbol jerárquico de CRMBackend
// (GET /api/v1/fleet) sería la fuente "correcta" a futuro, pero requiere que
// ApiEMS tenga credenciales propias contra CRMBackend, algo que el propio
// documento deja para la Fase 5 (auth) — no inventar ese acople acá.
const POLL_INTERVAL_MS = 30_000;

interface DeviceContextValue {
  devices: DeviceSnapshot[];
  /** null = comportamiento de siempre: el backend elige el primer dispositivo activo. */
  selectedDeviceId: string | null;
  setSelectedDeviceId: (deviceId: string | null) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<DeviceSnapshot[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const latest = await getRealtimeLatest();
        if (cancelled) return;
        setDevices(latest);
        // Si el medidor seleccionado dejó de reportar, no insistir en un
        // device_id fantasma — volver al default (backend elige el primero).
        setSelectedDeviceIdState((current) =>
          current !== null && !latest.some((d) => d.device_id === current) ? null : current,
        );
      } catch {
        // Sin red o sesión vencida: la próxima corrida del intervalo reintenta.
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const setSelectedDeviceId = useCallback((deviceId: string | null) => {
    setSelectedDeviceIdState(deviceId);
  }, []);

  return (
    <DeviceContext.Provider value={{ devices, selectedDeviceId, setSelectedDeviceId }}>
      {children}
    </DeviceContext.Provider>
  );
}
