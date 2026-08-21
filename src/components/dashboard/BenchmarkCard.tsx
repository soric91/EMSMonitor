import { useEffect, useState } from 'react';
import { getBenchmark } from '../../api/analytics';
import type { BenchmarkResult } from '../../api/types';
import { useDevice } from '../../hooks/useDevice';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatKwh } from '../../utils/format';

/**
 * Esta sede frente a las otras del mismo cliente.
 *
 * Se muestra el ranking completo y no solo la posición: "estás en el percentil
 * 60" no le dice a nadie qué hacer, mientras que ver que la bodega consume el
 * doble que la oficina sí señala dónde mirar.
 *
 * Las barras son relativas a la sede que más consume del grupo — la
 * comparación es entre ellas, no contra un absoluto que no existe.
 */

interface BenchmarkCardProps {
  /** Cuántas sedes se listan antes de resumir. */
  maximo?: number;
}

export function BenchmarkCard({ maximo = 8 }: BenchmarkCardProps) {
  const { selectedDeviceId } = useDevice();
  const [data, setData] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!selectedDeviceId) return;
    let cancelled = false;

    async function run() {
      setError(false);
      try {
        const result = await getBenchmark({ device_id: selectedDeviceId as string });
        if (!cancelled) setData(result);
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
    return <Card className="text-sm text-red-500">No se pudo comparar con tus otras sedes.</Card>;
  }

  if (data === null) {
    return (
      <Card>
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-3 h-24 w-full" />
      </Card>
    );
  }

  if (data.own_kwh_per_day === null) {
    return (
      <Card>
        <p className="stencil text-slate-500 dark:text-slate-400">Tus sedes</p>
        <p className="mt-2 text-sm text-slate-400">
          Sin consumo registrado en los últimos {data.days} días para comparar.
        </p>
      </Card>
    );
  }

  const mayor = Math.max(...data.peers.map((p) => p.kwh_per_day));
  const visibles = data.peers.slice(0, maximo);
  const restantes = data.peers.length - visibles.length;

  return (
    <Card>
      <p className="stencil text-slate-500 dark:text-slate-400">
        Tus sedes <span className="text-slate-400">· consumo medio de {data.days} días</span>
      </p>

      {data.enough_peers && data.median_kwh_per_day !== null ? (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Esta sede consume <strong>{formatKwh(data.own_kwh_per_day)}</strong> al día
          {data.own_kwh_per_day > data.median_kwh_per_day
            ? ', por encima de'
            : ', por debajo de'}{' '}
          la mediana de tus {data.peers.length} sedes ({formatKwh(data.median_kwh_per_day)}).
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Esta sede consume <strong>{formatKwh(data.own_kwh_per_day)}</strong> al día.{' '}
          <span className="text-slate-400">
            Hacen falta al menos tres sedes comparables para ubicarla en un ranking.
          </span>
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {visibles.map((sede) => (
          <li key={sede.device_id} className="flex items-center gap-2 text-xs">
            <span
              className={[
                'w-28 shrink-0 truncate',
                sede.is_self
                  ? 'font-semibold text-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400',
              ].join(' ')}
              title={`${sede.site} · ${sede.name}`}
            >
              {sede.name}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-900/5 dark:bg-white/5">
              <span
                className={[
                  'block h-full rounded-full',
                  sede.is_self ? 'bg-accent-500' : 'bg-slate-400/50',
                ].join(' ')}
                style={{ width: `${Math.max(2, (sede.kwh_per_day / mayor) * 100)}%` }}
              />
            </span>
            <span className="w-20 shrink-0 text-right tabular-nums text-slate-500 dark:text-slate-400">
              {formatKwh(sede.kwh_per_day)}
            </span>
          </li>
        ))}
      </ul>
      {restantes > 0 && (
        <p className="mt-1 text-[11px] text-slate-400">y {restantes} sede(s) más.</p>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        Solo tus propias sedes, y solo las del mismo tipo (con o sin generación propia).
      </p>
    </Card>
  );
}
