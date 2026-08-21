import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Home, Minus, Zap } from 'lucide-react';
import { createEmsWebSocket, type WsConnectionStatus } from '../../api/websocket';
import { useDevice } from '../../hooks/useDevice';
import { useVariablesDelMedidor } from '../../hooks/useVariablesDelMedidor';
import { Card } from '../ui/Card';
import { enWatts, formatWatts } from '../../utils/format';
import type { WsDataEvent } from '../../api/types';

const IMPORT_COLOR = '#f59e0b';
const EXPORT_COLOR = '#10b981';
const NEUTRAL_COLOR = '#64748b';
const IDLE_BORDER = 'rgba(148,163,184,0.2)';
// La potencia activa total de la acometida: con signo, positiva importando y
// negativa exportando, que es justo lo que este hero dibuja. Es la única
// variable fija que queda en el panel, y lo es porque el componente entero
// existe para mostrar ese flujo — no es una lista que pueda quedar corta.
const VARIABLE = 'TotW';

function FlowDots({
  direction,
  color,
  axis,
}: {
  direction: 'import' | 'export';
  color: string;
  axis: 'x' | 'y';
}) {
  const from = direction === 'import' ? '0%' : '100%';
  const to = direction === 'import' ? '100%' : '0%';
  const styleKey = axis === 'x' ? 'left' : 'top';
  const crossKey = axis === 'x' ? 'top' : 'left';

  return (
    <>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ backgroundColor: color, [crossKey]: '50%' }}
          animate={{ [styleKey]: [from, to] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.5, ease: 'linear' }}
        />
      ))}
    </>
  );
}

function FlowArrowhead({
  direction,
  axis,
  color,
}: {
  direction: 'import' | 'export';
  axis: 'x' | 'y';
  color: string;
}) {
  const Icon =
    axis === 'x'
      ? direction === 'import'
        ? ArrowRight
        : ArrowLeft
      : direction === 'import'
        ? ArrowDown
        : ArrowUp;
  return (
    <motion.span
      className={axis === 'x' ? 'hidden shrink-0 sm:flex' : 'flex shrink-0 sm:hidden'}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <Icon className="h-5 w-5" strokeWidth={2.5} style={{ color }} />
    </motion.span>
  );
}

interface EnergyFlowHeroProps {
  /**
   * La potencia activa total que el panel ya trajo en `/dashboard/summary`
   * (en vatios). Cubre la transición mientras la conexión propia del hero
   * abre: hasta que llega el primer tick en vivo, se muestra la instantánea
   * que el tablero ya tenía, no un cero.
   */
  seedWatts?: number | null;
}

export function EnergyFlowHero({ seedWatts = null }: EnergyFlowHeroProps) {
  const { porNombre } = useVariablesDelMedidor();
  const { selectedDeviceId } = useDevice();
  const [estadoConexion, setEstadoConexion] = useState<WsConnectionStatus>('connecting');
  // La lectura viaja junto al medidor del que salió. Guardar solo el valor
  // obligaba a borrarlo desde el efecto al cambiar de equipo, y mientras no se
  // borrara el recuadro mostraba los vatios de otra acometida — un medidor
  // recién instalado puede tardar en publicar el primero propio.
  const [lastKnown, setLastKnown] = useState<{
    device: string | null;
    event: WsDataEvent;
  } | null>(null);

  // El backend sostiene una variable suscrita por conexión y la compartida del
  // dashboard la ocupa la gráfica de abajo con lo que esté mirando. Si este
  // recuadro esperara a que quedara libre, el valor se congelaría en la última
  // instantánea del resumen —exactamente el bug que esto reemplaza—. Por eso
  // abre su propia conexión para `TotW`: un socket más, a cambio de que el
  // flujo de la frontera siempre llegue en vivo, sin depender de a qué
  // variable haya movido el usuario la conexión compartida.
  useEffect(() => {
    const client = createEmsWebSocket({
      onStatusChange: setEstadoConexion,
      onData: (event) => setLastKnown({ device: selectedDeviceId, event }),
    });
    client.connect();
    client.subscribe(VARIABLE, selectedDeviceId);

    return () => {
      client.close();
    };
  }, [selectedDeviceId]);

  // El medidor reporta `TotW` en kW, así que el valor se convierte a vatios una
  // sola vez. En vivo gana el último tick del socket; sin él, la instantánea
  // fresca del `/dashboard/summary`, y como último recurso la última lectura
  // que sí llegó por esta conexión.
  const unidad = porNombre.get(VARIABLE)?.unidad ?? '';
  const isLive = estadoConexion === 'connected';
  const lectura = lastKnown?.device === selectedDeviceId ? lastKnown.event : null;
  const ultimoWs = lectura ? enWatts(lectura.value, unidad) : null;
  const value = isLive && ultimoWs !== null ? ultimoWs : (seedWatts ?? ultimoWs ?? null);
  const isImporting = value !== null && value > 1;
  const isExporting = value !== null && value < -1;
  const direction: 'import' | 'export' | 'neutral' = isImporting
    ? 'import'
    : isExporting
      ? 'export'
      : 'neutral';
  const color = isImporting ? IMPORT_COLOR : isExporting ? EXPORT_COLOR : NEUTRAL_COLOR;

  return (
    <Card elevacion="instrumento">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="stencil text-slate-500 dark:text-slate-400">Balance energético</p>
          {isLive ? (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <motion.span
                  className="absolute inline-flex h-full w-full rounded-full bg-emerald-500"
                  animate={{ scale: [1, 2.5], opacity: [0.7, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                Online
              </span>
            </span>
          ) : (
            value !== null && (
              <span className="text-[10px] text-slate-400">
                {estadoConexion === 'reconnecting'
                  ? 'reconectando'
                  : estadoConexion === 'disconnected'
                    ? 'desconectado'
                    : 'conectando'}
              </span>
            )
          )}
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
          style={{ borderColor: `${color}55`, color, backgroundColor: `${color}14` }}
        >
          {direction === 'import' && <ArrowLeft className="h-3.5 w-3.5" />}
          {direction === 'export' && <ArrowRight className="h-3.5 w-3.5" />}
          {direction === 'neutral' && <Minus className="h-3.5 w-3.5" />}
          {direction === 'import'
            ? 'Importando de la red'
            : direction === 'export'
              ? 'Exportando excedente'
              : 'Sin flujo neto'}
        </span>
      </div>

      <div
        className={[
          'flex flex-col items-center gap-6 sm:flex-row sm:justify-between',
          !isLive && 'opacity-70',
        ].join(' ')}
      >
        <div
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 transition-colors"
          style={{
            borderColor: direction === 'import' ? color : IDLE_BORDER,
            boxShadow: direction === 'import' ? `0 0 24px ${color}33` : undefined,
          }}
        >
          <Zap className="h-5 w-5 text-slate-500 dark:text-slate-300" />
          <span className="text-[10px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
            RED
          </span>
        </div>

        <div className="relative hidden h-1 flex-1 overflow-hidden rounded-full bg-slate-900/10 sm:block dark:bg-white/10">
          {direction !== 'neutral' && <FlowDots direction={direction} color={color} axis="x" />}
        </div>
        <div className="relative block h-10 w-1 overflow-hidden rounded-full bg-slate-900/10 sm:hidden dark:bg-white/10">
          {direction !== 'neutral' && <FlowDots direction={direction} color={color} axis="y" />}
        </div>
        {direction !== 'neutral' && (
          <>
            <FlowArrowhead direction={direction} axis="x" color={color} />
            <FlowArrowhead direction={direction} axis="y" color={color} />
          </>
        )}

        <div className="text-center">
          <p className="readout text-4xl text-slate-900 sm:text-5xl dark:text-white dark:[text-shadow:0_0_28px_rgba(76,141,255,0.22)]">
            {value !== null ? formatWatts(Math.abs(value)) : '—'}
          </p>
          <p className="mt-1.5 text-xs text-slate-400">Potencia activa en la frontera</p>
        </div>

        <div className="relative hidden h-1 flex-1 overflow-hidden rounded-full bg-slate-900/10 sm:block dark:bg-white/10">
          {direction !== 'neutral' && <FlowDots direction={direction} color={color} axis="x" />}
        </div>
        <div className="relative block h-10 w-1 overflow-hidden rounded-full bg-slate-900/10 sm:hidden dark:bg-white/10">
          {direction !== 'neutral' && <FlowDots direction={direction} color={color} axis="y" />}
        </div>
        {direction !== 'neutral' && (
          <>
            <FlowArrowhead direction={direction} axis="x" color={color} />
            <FlowArrowhead direction={direction} axis="y" color={color} />
          </>
        )}

        <div
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 transition-colors"
          style={{
            borderColor: direction === 'export' ? color : IDLE_BORDER,
            boxShadow: direction === 'export' ? `0 0 24px ${color}33` : undefined,
          }}
        >
          <Home className="h-5 w-5 text-slate-500 dark:text-slate-300" />
          <span className="text-[10px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">
            CASA
          </span>
        </div>
      </div>
    </Card>
  );
}
