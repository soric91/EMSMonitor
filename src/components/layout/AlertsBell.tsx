import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellOff } from 'lucide-react';
import { useAlerts } from '../../hooks/useAlerts';
import type { Alert, AlertSeverity } from '../../api/types';
import { formatLocalDateTime } from '../../utils/format';

const SEVERITY_STYLES: Record<AlertSeverity, { dot: string; text: string; label: string }> = {
  high: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', label: 'Alta' },
  moderate: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'Moderada' },
};

function AlertItem({ alert }: { alert: Alert }) {
  const style = SEVERITY_STYLES[alert.severity];
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className={['mt-1.5 h-2 w-2 shrink-0 rounded-full', style.dot].join(' ')} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={['text-[10px] font-semibold uppercase tracking-wide', style.text].join(' ')}>
            {style.label}
          </span>
          <span className="text-[10px] text-slate-400">{formatLocalDateTime(alert.timestamp, 'd MMM, HH:mm')}</span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">{alert.message}</p>
      </div>
    </li>
  );
}

export function AlertsBell() {
  const { alerts, unreadCount, liveAlert, markAllSeen } = useAlerts();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer click fuera del panel.
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

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) markAllSeen();
  };

  return (
    <div ref={containerRef} className="relative">
      <motion.button
        onClick={toggle}
        // sacudida sutil cada vez que llega una alerta nueva en vivo
        key={liveAlert?.timestamp ?? 'idle'}
        animate={liveAlert ? { rotate: [0, -12, 12, -8, 8, 0] } : undefined}
        transition={{ duration: 0.5 }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
        title="Alertas"
      >
        <Bell className="h-[18px] w-[18px]" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

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
              <p className="text-xs font-semibold text-slate-900 dark:text-white">Alertas de consumo</p>
              <p className="text-[10px] text-slate-400">Desde el último arranque del sistema</p>
            </div>
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <BellOff className="h-5 w-5 text-slate-300 dark:text-slate-600" />
                <p className="text-xs text-slate-400">Sin alertas — consumo dentro de lo normal</p>
              </div>
            ) : (
              <ul className="max-h-96 divide-y divide-slate-900/5 overflow-y-auto dark:divide-white/5">
                {alerts.map((alert) => (
                  <AlertItem key={`${alert.kind}-${alert.timestamp}-${alert.variable}`} alert={alert} />
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
