import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react';
import { getAlertsHistory } from '../../api/alerts';
import type { AlertsHistory } from '../../api/types';
import { useDevice } from '../../hooks/useDevice';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatLocalDateTime } from '../../utils/format';

/**
 * Qué pasó en los últimos 30 días: los días que se salieron de lo normal y,
 * aparte, el cambio de nivel sostenido.
 *
 * Van separados a propósito. Un día atípico es un evento que ya pasó y no
 * pide nada; un cambio de nivel sigue costando plata todos los días hasta que
 * alguien lo revise, así que va arriba y con más peso visual.
 *
 * Rango fijo de 30 días —no el del selector de la página—: es el mismo
 * horizonte con el que se arman las bandas, y comparar contra una banda que
 * cubre más días de los que se están mirando daría veredictos con menos
 * respaldo del que aparentan.
 */

/** Cuántas anomalías se listan antes de resumir el resto. */
const MAXIMO_VISIBLE = 8;

export function InsightsTimeline() {
  const { selectedDeviceId } = useDevice();
  const [historial, setHistorial] = useState<AlertsHistory | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(false);
      try {
        const data = await getAlertsHistory({ device_id: selectedDeviceId ?? undefined });
        if (!cancelled) setHistorial(data);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedDeviceId]);

  if (error) {
    return <Card className="text-sm text-red-500">No se pudo cargar el historial.</Card>;
  }

  if (historial === null) {
    return (
      <Card>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-24 w-full" />
      </Card>
    );
  }

  const cambio = historial.level_shift;
  const visibles = historial.anomalies.slice(0, MAXIMO_VISIBLE);
  const restantes = historial.anomalies.length - visibles.length;

  return (
    <Card>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        Qué pasó <span className="text-slate-400">· últimos 30 días</span>
      </p>

      {cambio && (
        <div
          className={[
            'mt-3 flex items-start gap-2 rounded-lg p-3',
            cambio.direction === 'up'
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
          ].join(' ')}
        >
          {cambio.direction === 'up' ? (
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <p className="text-sm leading-snug">{cambio.message}</p>
            <p className="mt-0.5 text-[11px] opacity-80">
              {cambio.delta_pct > 0 ? '+' : ''}
              {cambio.delta_pct}% respecto de antes
            </p>
          </div>
        </div>
      )}

      {historial.anomalies.length === 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          {historial.days_analyzed === 0
            ? 'Todavía no hay días completos para analizar.'
            : `Ningún día se salió de lo normal en ${historial.days_analyzed} días analizados.`}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visibles.map((anomalia) => (
            <li key={anomalia.timestamp} className="flex items-start gap-2">
              <AlertTriangle
                className={[
                  'mt-0.5 h-3.5 w-3.5 shrink-0',
                  anomalia.severity === 'high'
                    ? 'text-red-500'
                    : 'text-amber-500 dark:text-amber-400',
                ].join(' ')}
              />
              <div className="min-w-0">
                <p className="text-sm leading-snug text-slate-700 dark:text-slate-200">
                  {anomalia.message}
                </p>
                <p className="text-[11px] text-slate-400">
                  {formatLocalDateTime(anomalia.timestamp, 'd MMM yyyy')}
                </p>
              </div>
            </li>
          ))}
          {restantes > 0 && (
            <li className="text-[11px] text-slate-400">
              y {restantes} día{restantes > 1 ? 's' : ''} atípico{restantes > 1 ? 's' : ''} más en
              el periodo.
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
