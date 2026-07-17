import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Home, Minus, Zap } from 'lucide-react';
import { useRealtime } from '../../hooks/useRealtime';
import { Card } from '../ui/Card';
import { formatWatts } from '../../utils/format';
import type { WsDataEvent } from '../../api/types';

const IMPORT_COLOR = '#f59e0b';
const EXPORT_COLOR = '#10b981';
const NEUTRAL_COLOR = '#64748b';
const IDLE_BORDER = 'rgba(148,163,184,0.2)';
const VARIABLE = 'POWER_ACTIVE_INST_TOTAL';

function FlowDots({ direction, color, axis }: { direction: 'import' | 'export'; color: string; axis: 'x' | 'y' }) {
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

function FlowArrowhead({ direction, axis, color }: { direction: 'import' | 'export'; axis: 'x' | 'y'; color: string }) {
  const Icon =
    axis === 'x' ? (direction === 'import' ? ArrowRight : ArrowLeft) : direction === 'import' ? ArrowDown : ArrowUp;
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

export function EnergyFlowHero() {
  const { status, subscribedVariable, latestData, subscribe, onDataEvent } = useRealtime();
  const [lastKnown, setLastKnown] = useState<WsDataEvent | null>(null);

  useEffect(() => {
    return onDataEvent((event) => {
      if (event.variable === VARIABLE) setLastKnown(event);
    });
  }, [onDataEvent]);

  useEffect(() => {
    // Solo reclama la suscripción si nada más la está usando: el chart de abajo
    // puede haberla movido a otra variable a pedido explícito del usuario.
    if (status === 'connected' && subscribedVariable === null) {
      subscribe(VARIABLE);
    }
  }, [status, subscribedVariable, subscribe]);

  const isLive = subscribedVariable === VARIABLE;
  const value = isLive ? (latestData?.value ?? lastKnown?.value ?? null) : (lastKnown?.value ?? null);
  const isImporting = value !== null && value > 1;
  const isExporting = value !== null && value < -1;
  const direction: 'import' | 'export' | 'neutral' = isImporting ? 'import' : isExporting ? 'export' : 'neutral';
  const color = isImporting ? IMPORT_COLOR : isExporting ? EXPORT_COLOR : NEUTRAL_COLOR;

  return (
    <Card>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Balance energético</p>
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
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Online</span>
            </span>
          ) : (
            value !== null && <span className="text-[10px] text-slate-400">último valor</span>
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

      <div className={['flex flex-col items-center gap-6 sm:flex-row sm:justify-between', !isLive && 'opacity-70'].join(' ')}>
        <div
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 transition-colors"
          style={{
            borderColor: direction === 'import' ? color : IDLE_BORDER,
            boxShadow: direction === 'import' ? `0 0 24px ${color}33` : undefined,
          }}
        >
          <Zap className="h-5 w-5 text-slate-500 dark:text-slate-300" />
          <span className="text-[10px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">RED</span>
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
          <p className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {value !== null ? formatWatts(Math.abs(value)) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-400">Potencia activa en la frontera</p>
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
          <span className="text-[10px] font-semibold tracking-wide text-slate-500 dark:text-slate-400">CASA</span>
        </div>
      </div>

      {!isLive && (
        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400">
          {direction === 'import' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
          En pausa — el gráfico de abajo está mostrando otra variable
        </div>
      )}
    </Card>
  );
}
