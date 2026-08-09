import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, WifiOff } from 'lucide-react';
import { getAccessToken } from '../../api/tokenStore';
import { listGatewaysCaidos } from '../../api/proyectos';
import type { GatewayCaido } from '../../api/types';
import { desdeUltimaConexion } from '../../domain/salud';

/**
 * Qué dejó de reportar, en toda la flota.
 *
 * La pregunta con la que se abre el panel un día malo. Navegando por padre
 * —proyecto, sede, gateway— cuesta una petición por nodo, así que en la
 * práctica nadie la contestaba.
 *
 * Si no hay ninguno caído no se dibuja nada. Un "0 gateways caídos" ocupa el
 * mismo lugar que el aviso real y entrena a no mirar ahí.
 */
export function GatewaysCaidos() {
  const [caidos, setCaidos] = useState<GatewayCaido[]>([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function cargar() {
      const token = getAccessToken();
      if (!token) return;
      try {
        const lista = await listGatewaysCaidos(token);
        if (!cancelled) setCaidos(lista);
      } catch {
        // Silencio a propósito: esto es un aviso extra sobre la pantalla de
        // proyectos, no su contenido. Si falla, la pantalla sirve igual y un
        // error acá solo taparía la lista que sí cargó.
      }
    }

    void cargar();
    return () => {
      cancelled = true;
    };
  }, []);

  if (caidos.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/5">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-amber-700 dark:text-amber-400"
      >
        <WifiOff className="h-4 w-4 shrink-0" />
        {caidos.length === 1 ? '1 gateway sin reportar' : `${caidos.length} gateways sin reportar`}
        <motion.span
          animate={{ rotate: abierto ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="ml-auto"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {abierto && (
          <motion.ul
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {caidos.map((gateway) => (
              <li
                key={gateway.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-amber-500/20 px-4 py-2 text-xs"
              >
                <span className="font-medium text-slate-900 dark:text-white">
                  {gateway.empresa}
                </span>
                <span className="text-slate-500 dark:text-slate-400">· {gateway.sitio}</span>
                <span className="font-mono text-[11px] text-slate-400">{gateway.numero_serie}</span>
                <span className="ml-auto text-amber-700 dark:text-amber-400">
                  {/* "Nunca" no es "hace mucho": puede ser una instalación
                      que todavía no arrancó, y eso se atiende distinto. */}
                  {desdeUltimaConexion(gateway.ultima_conexion) ?? 'nunca reportó'}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
