import { useEffect, useState } from 'react';
import { Ghost, TrendingDown, TrendingUp } from 'lucide-react';
import { getBaseloadTrend } from '../../api/analytics';
import type { BaseLoadTrendResult } from '../../api/types';
import { useDevice } from '../../hooks/useDevice';
import { AreaChartWidget } from '../charts/AreaChartWidget';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatCop, formatKwh, formatWatts } from '../../utils/format';

/**
 * La carga base: lo que la instalación consume aunque no haya nadie.
 *
 * Es el insight que más veces se traduce en plata sin cambiar hábitos, y por
 * eso se muestra en vatios, en kWh al mes Y en pesos: "180 W" no le dice nada
 * a nadie, "$108.000 al mes" sí.
 */

/** Un salto de más de esto en una semana es algo que se quedó encendido. */
const SALTO_RELEVANTE_W = 20;

interface PhantomLoadCardProps {
  fromIso: string;
  toIso: string;
}

export function PhantomLoadCard({ fromIso, toIso }: PhantomLoadCardProps) {
  const { selectedDeviceId } = useDevice();
  const [data, setData] = useState<BaseLoadTrendResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(false);
      try {
        const result = await getBaseloadTrend({
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

  if (error) {
    return <Card className="text-sm text-red-500">No se pudo cargar la carga base.</Card>;
  }

  if (data === null) {
    return (
      <Card>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-[180px] w-full" />
      </Card>
    );
  }

  if (data.current_w === null) {
    return (
      <Card>
        <p className="stencil text-slate-500 dark:text-slate-400">Consumo de fondo</p>
        <p className="mt-2 text-sm text-slate-400">
          {data.window === 'noche'
            ? 'Sin lecturas nocturnas en este rango. Con generación solar solo se mide de noche: de día el medidor ve el balance neto.'
            : 'Sin datos suficientes en este rango.'}
        </p>
      </Card>
    );
  }

  const subio = data.trend_delta_w !== null && data.trend_delta_w > SALTO_RELEVANTE_W;
  const bajo = data.trend_delta_w !== null && data.trend_delta_w < -SALTO_RELEVANTE_W;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 stencil text-slate-500 dark:text-slate-400">
            <Ghost className="h-3.5 w-3.5" /> Consumo de fondo
            {data.window === 'noche' && <span className="text-slate-400">· medido de noche</span>}
          </p>
          <p className="mt-1.5 readout text-2xl text-slate-900 dark:text-white">
            {formatWatts(data.current_w)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {data.monthly_kwh !== null && <>≈ {formatKwh(data.monthly_kwh)} al mes</>}
            {data.monthly_cost_cop !== null && <> · {formatCop(data.monthly_cost_cop)} al mes</>}
            {data.share_of_import !== null && (
              <> · {Math.round(data.share_of_import * 100)}% de lo importado</>
            )}
          </p>
        </div>
        {(subio || bajo) && (
          <span
            className={[
              'flex items-center gap-1 text-xs font-medium',
              subio
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400',
            ].join(' ')}
          >
            {subio ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {subio ? '+' : ''}
            {formatWatts(data.trend_delta_w ?? 0)} vs. la semana anterior
          </span>
        )}
      </div>

      {subio && (
        <p className="mt-2 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
          Tu consumo de fondo subió esta semana y no volvió a bajar: suele ser algo que quedó
          encendido.
        </p>
      )}

      {data.points.length > 1 && (
        <div className="mt-4">
          <AreaChartWidget
            data={data.points.map((p) => ({
              time: Date.parse(`${p.date}T12:00:00Z`),
              value: p.base_load_w,
            }))}
            color="#8b5cf6"
            height={160}
            valueFormatter={(v) => formatWatts(v)}
            timeFormatter={(t) =>
              new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
            }
          />
        </div>
      )}
    </Card>
  );
}
