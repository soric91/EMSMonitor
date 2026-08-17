import { useEffect, useState } from 'react';
import { getPowerForecast } from '../../api/forecast';
import type { PowerForecast } from '../../api/types';
import { useDevice } from '../../hooks/useDevice';
import { ForecastBandChart } from '../charts/ForecastBandChart';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatKwh, formatLocalDateTime } from '../../utils/format';

/**
 * El consumo esperado de las próximas 48 horas.
 *
 * Va etiquetado como pronóstico en tres lugares —el título, la línea punteada
 * y la banda— porque es lo único de esta pantalla que todavía no pasó, y
 * confundirlo con una medición es el error más caro que puede cometer quien lo
 * mira.
 *
 * El error medido del método se muestra al pie: si el pronóstico va a guiar
 * una decisión, quien lo lee merece saber cuánto suele fallar.
 */

const HORIZONTE_HORAS = 48;

export function PowerForecastCard() {
  const { selectedDeviceId } = useDevice();
  const [forecast, setForecast] = useState<PowerForecast | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Sin medidor elegido no se pregunta: sería el pronóstico de la flota
    // entera, cuatro semanas de serie horaria, para descartarlo enseguida.
    if (!selectedDeviceId) return;
    let cancelled = false;

    async function run() {
      setError(false);
      try {
        const data = await getPowerForecast({
          horizon_hours: HORIZONTE_HORAS,
          device_id: selectedDeviceId ?? undefined,
        });
        if (!cancelled) setForecast(data);
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
    return <Card className="text-sm text-red-500">No se pudo calcular el pronóstico.</Card>;
  }

  if (forecast === null) {
    return (
      <Card>
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-3 h-[200px] w-full" />
      </Card>
    );
  }

  if (forecast.method === 'insufficient_history' || forecast.points.length === 0) {
    return (
      <Card>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Consumo esperado</p>
        <p className="mt-2 text-[11px] leading-snug text-slate-400">
          Hacen falta dos semanas de lecturas horarias para pronosticar. Mientras tanto no se dibuja
          nada: un pronóstico sobre pocos días diría más del azar que del consumo.
        </p>
      </Card>
    );
  }

  const total = forecast.points.reduce((suma, p) => suma + p.kwh, 0);
  const pico = forecast.points.reduce((mayor, p) => (p.kwh > mayor.kwh ? p : mayor));
  const backtest = forecast.backtest;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Consumo esperado{' '}
          <span className="text-slate-400">· próximas {forecast.horizon_hours} h</span>
        </p>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{formatKwh(total)}</p>
      </div>

      <p className="mt-1 text-[11px] text-slate-400">
        Pico esperado a las {formatLocalDateTime(pico.time, 'HH:mm')} del{' '}
        {formatLocalDateTime(pico.time, 'd MMM')} ({formatKwh(pico.kwh)} en esa hora).
      </p>

      <div className="mt-3">
        <ForecastBandChart points={forecast.points} />
      </div>

      <p className="mt-2 text-[11px] leading-snug text-slate-400">
        Línea punteada y banda: es un pronóstico, no una medición. Sale del consumo de esa misma
        hora en tus días del mismo tipo.
        {backtest && (
          <>
            {' '}
            En los últimos días falló {formatKwh(backtest.mae_kwh)} por hora en promedio, contra{' '}
            {formatKwh(backtest.naive_mae_kwh)} de repetir el día anterior.
          </>
        )}
      </p>
    </Card>
  );
}
