import { useEffect, useState } from 'react';
import { getSiteMode } from '../api/analytics';
import type { SiteMode } from '../api/types';
import { useDevice } from './useDevice';

/**
 * Si la sede del medidor elegido tiene generación propia.
 *
 * El panel lo necesita para no ofrecer exportación, saldo a favor ni balance
 * neto en una instalación de consumo puro: mostrarlos en cero no es "sin
 * datos todavía", es un widget que nunca va a tener nada.
 *
 * Mientras se resuelve devuelve `null` — no `'consumo'`: adivinar el caso
 * mayoritario haría parpadear la interfaz en las sedes que sí tienen solar.
 */
export function useSiteMode(): SiteMode | null {
  const { selectedDeviceId } = useDevice();
  const [mode, setMode] = useState<SiteMode | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const data = await getSiteMode({ device_id: selectedDeviceId ?? undefined });
        if (!cancelled) setMode(data.mode);
      } catch {
        // Sin respuesta no se esconde nada: se deja el panel como estaba.
        if (!cancelled) setMode(null);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedDeviceId]);

  return mode;
}
