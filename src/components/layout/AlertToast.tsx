import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { useRealtime } from '../../hooks/useRealtime';
import type { Alert } from '../../api/types';
import { formatLocalDateTime } from '../../utils/format';

const AUTO_DISMISS_MS = 7_000;

export function AlertToast() {
  const { onAlertEvent } = useRealtime();
  const [visible, setVisible] = useState<Alert | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = onAlertEvent((event) => {
      setVisible(event);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => setVisible(null), AUTO_DISMISS_MS);
    });
    return () => {
      unsubscribe();
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, [onAlertEvent]);

  const isHigh = visible?.severity === 'high';

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={[
              'pointer-events-auto flex w-80 items-start gap-3 rounded-2xl border p-4 shadow-2xl shadow-black/25 backdrop-blur-xl',
              isHigh
                ? 'border-red-500/30 bg-red-50/95 dark:border-red-500/30 dark:bg-red-950/90'
                : 'border-amber-500/30 bg-amber-50/95 dark:border-amber-500/30 dark:bg-amber-950/90',
            ].join(' ')}
          >
            <div
              className={[
                'rounded-lg p-1.5',
                isHigh ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
              ].join(' ')}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p
                  className={[
                    'text-[10px] font-semibold uppercase tracking-wide',
                    isHigh ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400',
                  ].join(' ')}
                >
                  Alerta {isHigh ? 'alta' : 'moderada'}
                </p>
                <span className="text-[10px] text-slate-400">
                  {formatLocalDateTime(visible.timestamp, 'HH:mm')}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-200">{visible.message}</p>
            </div>
            <button
              onClick={() => setVisible(null)}
              className="shrink-0 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
