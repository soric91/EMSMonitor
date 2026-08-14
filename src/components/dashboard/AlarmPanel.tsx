import { BellOff } from 'lucide-react';
import { useAlerts } from '../../hooks/useAlerts';
import { Card } from '../ui/Card';
import { formatLocalDateTime } from '../../utils/format';
import type { AlertSeverity } from '../../api/types';

const SEVERIDAD: Record<AlertSeverity, { dot: string; text: string; label: string }> = {
  high: { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', label: 'Alta' },
  moderate: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'Moderada' },
};

const TOPE = 5;

/**
 * El panel de alarmas (OPERACIÓN). Lee las alertas que AlertsProvider ya trajo
 * de `/alerts` y mantiene por WS — no agrega peticiones. Muestra las últimas
 * `TOPE` con su severidad, o un empty state honesto.
 */
export function AlarmPanel() {
  const { alerts } = useAlerts();
  const recientes = alerts.slice(0, TOPE);

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Alertas recientes
        </p>
        {recientes.length > 0 && (
          <span className="text-[11px] text-slate-400">
            {recientes.length} {recientes.length === 1 ? 'alerta' : 'alertas'}
          </span>
        )}
      </div>

      {recientes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <BellOff className="h-5 w-5 text-slate-300 dark:text-slate-600" />
          <p className="text-xs text-slate-400">Sin alertas — consumo dentro de lo normal</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-900/5 dark:divide-white/5">
          {recientes.map((alerta) => {
            const severidad = SEVERIDAD[alerta.severity];
            return (
              <li
                key={`${alerta.kind}-${alerta.timestamp}-${alerta.variable}-${alerta.device_id ?? ''}`}
                className="flex gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severidad.dot}`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide ${severidad.text}`}
                    >
                      {severidad.label}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatLocalDateTime(alerta.timestamp, 'd MMM, HH:mm')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                    {alerta.message}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
