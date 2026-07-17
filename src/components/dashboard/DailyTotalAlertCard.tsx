import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useAlerts } from '../../hooks/useAlerts';
import { formatLocalDateTime } from '../../utils/format';

/** Solo se muestra si el último día completo cayó fuera de su banda típica. */
export function DailyTotalAlertCard() {
  const { dailyTotal } = useAlerts();
  if (!dailyTotal) return null;

  const isHigh = dailyTotal.severity === 'high';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={[
        'flex items-start gap-3 rounded-2xl border p-4',
        isHigh
          ? 'border-red-500/25 bg-red-500/5'
          : 'border-amber-500/25 bg-amber-500/5',
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
      <div>
        <p
          className={[
            'text-xs font-semibold',
            isHigh ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400',
          ].join(' ')}
        >
          Consumo diario fuera de lo típico
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{dailyTotal.message}</p>
        <p className="mt-1 text-[10px] text-slate-400">{formatLocalDateTime(dailyTotal.timestamp, 'd MMM yyyy')}</p>
      </div>
    </motion.div>
  );
}
