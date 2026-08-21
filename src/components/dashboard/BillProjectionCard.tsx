import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { getBillForecast } from '../../api/forecast';
import type { BillForecast } from '../../api/types';
import { useDevice } from '../../hooks/useDevice';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatCop, formatKwh } from '../../utils/format';

/**
 * En cuánto termina la factura del mes al ritmo actual.
 *
 * La barra muestra cuánto del mes va corrido, no cuánto del dinero: el gasto
 * no avanza parejo (un fin de semana pesa distinto a un martes) y pintar el
 * avance del dinero contra el total proyectado daría una barra que siempre se
 * ve igual, sin decir nada.
 *
 * Con `insufficient_history` no se dibuja proyección: se muestra lo que va del
 * mes, que es un dato, y se dice por qué todavía no hay pronóstico.
 */
interface BillProjectionCardProps {
  /** Costo del mes hasta hoy, que el panel ya trae en su resumen. */
  costoMesActualCop?: number | null;
}

export function BillProjectionCard({ costoMesActualCop }: BillProjectionCardProps) {
  const { selectedDeviceId } = useDevice();
  const [forecast, setForecast] = useState<BillForecast | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Sin medidor elegido no se pregunta: al montar, el inventario todavía no
    // llegó y esa consulta sería la proyección de la flota entera —28 días de
    // series diarias— para tirarla un instante después.
    if (!selectedDeviceId) return;
    let cancelled = false;

    async function run() {
      setError(false);
      try {
        const data = await getBillForecast({ device_id: selectedDeviceId ?? undefined });
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
    return <Card className="text-sm text-red-500">No se pudo calcular la proyección del mes.</Card>;
  }

  if (forecast === null) {
    return (
      <Card>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-8 w-32" />
      </Card>
    );
  }

  const avance = Math.min(100, Math.round((forecast.days_elapsed / forecast.days_total) * 100));

  return (
    <Card>
      <p className="flex items-center gap-1.5 stencil text-slate-500 dark:text-slate-400">
        <CalendarClock className="h-3.5 w-3.5" /> Proyección del mes
      </p>

      <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
        Vas en <strong>{formatKwh(forecast.kwh_mtd)}</strong>
        {typeof costoMesActualCop === 'number' && <> · {formatCop(costoMesActualCop)}</>}
      </p>

      {forecast.method === 'insufficient_history' ? (
        <p className="mt-2 text-[11px] leading-snug text-slate-400">
          Todavía no hay suficiente historial para proyectar el cierre del mes. Con dos semanas de
          lecturas completas aparece acá.
        </p>
      ) : (
        <>
          <p className="mt-2 readout text-2xl text-slate-900 dark:text-white">
            {forecast.cost_projected_cop !== null
              ? formatCop(forecast.cost_projected_cop)
              : formatKwh(forecast.kwh_projected ?? 0)}
          </p>
          <p className="text-xs text-slate-400">
            proyectado a fin de mes
            {forecast.cost_p10_cop !== null && forecast.cost_p90_cop !== null && (
              <>
                {' '}
                · entre {formatCop(forecast.cost_p10_cop)} y {formatCop(forecast.cost_p90_cop)}
              </>
            )}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {formatKwh(forecast.kwh_projected ?? 0)} estimados según tus últimas 4 semanas,
            separando días laborales, sábados y domingos.
          </p>
        </>
      )}

      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-900/10 dark:bg-white/10">
          <div className="h-full rounded-full bg-accent-500" style={{ width: `${avance}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          {avance}% del mes transcurrido ({Math.floor(forecast.days_elapsed)} de{' '}
          {forecast.days_total} días)
        </p>
      </div>
    </Card>
  );
}
