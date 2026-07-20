import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info } from 'lucide-react';
import { useAlerts } from '../../hooks/useAlerts';
import { formatLocalDateTime } from '../../utils/format';

/**
 * Campana de "Aviso": muestra dailyTotal (comparación del último día completo
 * contra su banda típica) — separado de AlertsBell porque es un dato distinto
 * (una observación puntual, no un historial de eventos).
 */
export function NoticeBell() {
  const { dailyTotal } = useAlerts();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!dailyTotal) return null;

  const isHigh = dailyTotal.severity === 'high';
  const dotColor = isHigh ? 'bg-red-500' : 'bg-amber-500';
  const textColor = isHigh ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400';

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
        title="Aviso"
      >
        <Info className="h-[18px] w-[18px]" />
        <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
          <motion.span
            className={['absolute inline-flex h-full w-full rounded-full', dotColor].join(' ')}
            animate={{ scale: [1, 1.8], opacity: [0.7, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          />
          <span className={['relative inline-flex h-2.5 w-2.5 rounded-full', dotColor].join(' ')} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-2xl border border-slate-900/10 bg-white shadow-2xl shadow-black/20 dark:border-white/10 dark:bg-slate-900"
          >
            <div className="border-b border-slate-900/5 px-4 py-3 dark:border-white/5">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">Aviso</p>
              <p className="text-[10px] text-slate-400">Consumo diario fuera de lo típico</p>
            </div>
            <div className="px-4 py-3">
              <p className={['text-xs font-medium', textColor].join(' ')}>
                {isHigh ? 'Desviación alta' : 'Desviación moderada'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                {dailyTotal.message}
              </p>
              <p className="mt-2 text-[10px] text-slate-400">
                {formatLocalDateTime(dailyTotal.timestamp, 'd MMM yyyy')}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
