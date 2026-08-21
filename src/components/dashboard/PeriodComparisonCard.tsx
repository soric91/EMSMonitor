import { useEffect, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { compare } from '../../api/analytics';
import type { CompareResult } from '../../api/types';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { useDevice } from '../../hooks/useDevice';
import { formatKwh } from '../../utils/format';
import { startOfLocalDay } from '../../utils/timezone';

const DAY_MS = 86_400_000;

interface PeriodComparisonCardProps {
  label: string;
  days: number;
}

export function PeriodComparisonCard({ label, days }: PeriodComparisonCardProps) {
  const { selectedDeviceId, cargando: cargandoInventario } = useDevice();
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Se espera al inventario: sin medidor elegido el backend agrega TODAS las
    // acometidas del cliente, y esta tarjeta terminaba mostrando la suma de la
    // flota mientras el selector de arriba decía otra cosa. Pedirlo una vez sin
    // medidor y no volver a pedirlo era peor: el número quedaba congelado en
    // esa mezcla aunque después se cambiara de gateway.
    if (cargandoInventario) return;
    let cancelled = false;

    async function run() {
      setError(false);
      // Lo del medidor anterior no es de este: mejor el esqueleto que una cifra
      // ajena mientras llega la buena.
      setResult(null);
      // F0.4: los dos rangos terminan en la medianoche local de HOY, no en
      // "ahora". Antes el periodo B llegaba hasta el instante actual, así que
      // su último día estaba a medio consumir y el delta salía siempre a favor:
      // a las 9 a.m. comparaba 6 días y pico contra 7 completos.
      const finB = startOfLocalDay();
      const finA = new Date(finB.getTime() - days * DAY_MS);
      const params = {
        from_a: new Date(finA.getTime() - days * DAY_MS).toISOString(),
        to_a: finA.toISOString(),
        from_b: finA.toISOString(),
        to_b: finB.toISOString(),
        device_id: selectedDeviceId ?? undefined,
      };
      try {
        const data = await compare(params);
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [days, selectedDeviceId, cargandoInventario]);

  if (error) {
    return <Card className="text-sm text-red-500">No se pudo cargar {label.toLowerCase()}.</Card>;
  }

  if (!result) {
    return (
      <Card>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-8 w-24" />
      </Card>
    );
  }

  const delta = result.consumption_delta_pct;
  const improved = delta !== null && delta <= 0;

  return (
    <Card>
      <p className="stencil text-slate-500 dark:text-slate-400">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="readout text-2xl text-slate-900 dark:text-white">
          {formatKwh(result.period_b.consumption_kwh)}
        </p>
        {delta !== null && (
          <span
            className={[
              'flex items-center gap-1 text-xs font-medium',
              improved
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400',
            ].join(' ')}
          >
            {improved ? (
              <TrendingDown className="h-3.5 w-3.5" />
            ) : (
              <TrendingUp className="h-3.5 w-3.5" />
            )}
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        vs. {formatKwh(result.period_a.consumption_kwh)} periodo anterior · importado · días
        completos (sin contar hoy)
      </p>
    </Card>
  );
}
