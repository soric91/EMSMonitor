import { useEffect, useState } from 'react';
import { getLoadDuration } from '../../api/analytics';
import type { LoadDurationResult } from '../../api/types';
import { useDevice } from '../../hooks/useDevice';
import { LoadDurationChart } from '../charts/LoadDurationChart';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatWatts } from '../../utils/format';

/**
 * "¿Mi consumo es parejo o vive de picos?"
 *
 * La curva sola no se lee sin práctica, así que arriba va la frase que la
 * resume: cuánta potencia se supera el 5% del tiempo y qué porción de la
 * energía se va en ese 5%. Eso es lo que decide si conviene atacar los picos
 * o el consumo de fondo.
 */

interface LoadDurationCardProps {
  fromIso: string;
  toIso: string;
}

export function LoadDurationCard({ fromIso, toIso }: LoadDurationCardProps) {
  const { selectedDeviceId } = useDevice();
  const [data, setData] = useState<LoadDurationResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(false);
      try {
        const result = await getLoadDuration({
          from: fromIso,
          to: toIso,
          device_id: selectedDeviceId ?? undefined,
        });
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [fromIso, toIso, selectedDeviceId]);

  const porcentajeAlto = data ? Math.round(data.top_fraction * 100) : 5;

  return (
    <Card>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        Curva de duración de carga
      </p>

      {error && (
        <p className="mt-2 text-sm text-red-500">No se pudo cargar la curva de duración.</p>
      )}
      {!error && data === null && <Skeleton className="mt-3 h-[240px] w-full" />}
      {!error && data !== null && (
        <>
          {data.p5_w !== null && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              El <strong>{porcentajeAlto}%</strong> del tiempo consumes por encima de{' '}
              <strong>{formatWatts(data.p5_w)}</strong>
              {data.top_energy_share !== null && (
                <>
                  , y ese {porcentajeAlto}% explica el{' '}
                  <strong>{Math.round(data.top_energy_share * 100)}%</strong> de tu energía
                </>
              )}
              .
            </p>
          )}
          <div className="mt-3">
            <LoadDurationChart data={data} />
          </div>
          {data.p50_w !== null && (
            <p className="mt-2 text-[11px] text-slate-400">
              Mediana {formatWatts(data.p50_w)} · muestreo cada{' '}
              {Math.round(data.sample_seconds / 60)} min · solo horas de importación
            </p>
          )}
        </>
      )}
    </Card>
  );
}
