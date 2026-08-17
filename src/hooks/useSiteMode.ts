import { useEffect, useState } from 'react';
import { getSiteMode } from '../api/analytics';
import type { SiteModeResult } from '../api/types';
import { useDevice } from './useDevice';

/**
 * Si la sede del medidor elegido tiene generación propia, y con cuánta
 * capacidad instalada.
 *
 * El panel lo necesita para no ofrecer exportación, saldo a favor ni balance
 * neto en una instalación de consumo puro: mostrarlos en cero no es "sin
 * datos todavía", es un widget que nunca va a tener nada.
 *
 * Mientras se resuelve devuelve `null` — no un modo por defecto: adivinar el
 * caso mayoritario haría parpadear la interfaz en las sedes que sí tienen
 * solar.
 *
 * Devuelve la respuesta completa y no solo el modo: la capacidad instalada se
 * muestra al lado, y pedirla por separado sería una segunda consulta para un
 * dato que ya venía en la misma respuesta.
 */

/**
 * La respuesta se comparte entre todos los que preguntan por el mismo medidor.
 *
 * Sin esto, cada componente que use el hook dispara su propia consulta: con el
 * mapa de calor y la insignia de sede en la misma página ya eran dos idénticas.
 * El modo no cambia durante una visita, pero igual se le pone vencimiento para
 * que una edición en el CRM se refleje sin recargar del todo.
 */
const CACHE_MS = 5 * 60 * 1000;
const enVuelo = new Map<string, { pedido: number; promesa: Promise<SiteModeResult> }>();

function resolverModo(deviceId: string): Promise<SiteModeResult> {
  const guardado = enVuelo.get(deviceId);
  if (guardado && Date.now() - guardado.pedido < CACHE_MS) return guardado.promesa;

  const promesa = getSiteMode({ device_id: deviceId }).catch((error: unknown) => {
    // Un fallo no se cachea: la próxima pantalla vuelve a intentarlo.
    enVuelo.delete(deviceId);
    throw error;
  });
  enVuelo.set(deviceId, { pedido: Date.now(), promesa });
  return promesa;
}

/**
 * Olvida lo cacheado. Para los tests —que si no se pisarían entre sí— y para
 * el día que el panel quiera releer el modo tras un cambio en el CRM.
 */
export function clearSiteModeCache(): void {
  enVuelo.clear();
}

export function useSiteMode(): SiteModeResult | null {
  const { selectedDeviceId } = useDevice();
  const [site, setSite] = useState<SiteModeResult | null>(null);

  useEffect(() => {
    // Sin medidor elegido no hay sede de la cual preguntar: al montar, el
    // inventario todavía no llegó.
    const deviceId = selectedDeviceId;
    if (!deviceId) return;
    let cancelled = false;

    async function run(id: string) {
      try {
        const data = await resolverModo(id);
        if (!cancelled) setSite(data);
      } catch {
        // Sin respuesta no se esconde nada: el panel queda como estaba.
        if (!cancelled) setSite(null);
      }
    }

    void run(deviceId);
    return () => {
      cancelled = true;
    };
  }, [selectedDeviceId]);

  return site;
}
