import { useEffect, useState } from 'react';
import { getDailyProfile, getHeatmap } from '../../api/analytics';
import type { HeatmapResult, HourProfilePoint, ReportData } from '../../api/types';
import {
  admiteDetalleSemanal,
  agruparPorSemana,
  diaDeMayorConsumo,
  horaDeMayorConsumo,
  semanaDeMayorConsumo,
} from '../../domain/detalleDelPeriodo';
import { useDevice } from '../../hooks/useDevice';
import { useSiteMode } from '../../hooks/useSiteMode';
import type { MergedEnergyPoint } from '../../utils/mergeSeries';
import { formatKwh } from '../../utils/format';
import { Card } from '../ui/Card';
import { CalendarHeatmap } from '../charts/CalendarHeatmap';
import { HourlyProfileChart } from '../charts/HourlyProfileChart';
import { PeakInsightsCard } from './PeakInsightsCard';
import { WeeklyBreakdownCard } from './WeeklyBreakdownCard';

interface PeriodDetailSectionsProps {
  report: ReportData;
  /** Los buckets ya fusionados que la página usa para su gráfica y su CSV. */
  merged: MergedEnergyPoint[];
}

/**
 * Lo que un reporte largo debe contar además de sus totales.
 *
 * Aparece solo cuando el periodo da para semanas (ver `admiteDetalleSemanal`):
 * en un reporte diario estas secciones no dirían nada, y en uno anual —que
 * llega con buckets mensuales— dirían algo falso.
 *
 * Las dos consultas extra van con `catch`: son detalle, no el reporte. Si el
 * mapa de calor falla, el cliente sigue viendo sus totales, su gráfica y su
 * CSV, y solo faltan las secciones que dependían de él.
 *
 * El mapa se pide una sola vez y sirve a dos cosas: la cuadrícula hora × día y
 * la hora pico. Montar acá el `HeatmapCard` de Analytics —que trae su propio
 * selector de métrica y su propia consulta— habría pedido el mismo dato dos
 * veces para dibujarlo una.
 */
export function PeriodDetailSections({ report, merged }: PeriodDetailSectionsProps) {
  const { selectedDeviceId } = useDevice();
  // Sin respuesta todavía no se esconde nada: adivinar el caso mayoritario
  // haría parpadear la interfaz en las sedes que sí tienen solar.
  const soloImporta = useSiteMode()?.mode === 'consumo';
  const aplica = admiteDetalleSemanal(report);
  const desde = report.period_start;
  const hasta = report.period_end;
  // A qué consulta pertenece lo que hay guardado. Va PEGADO al dato en vez de
  // limpiarse al empezar la siguiente: vaciar el estado dentro del efecto
  // dispara un render en cascada, y además deja una ventana en la que el
  // detalle del rango viejo ya se borró y el nuevo todavía no llegó.
  const clave = `${desde}|${hasta}|${selectedDeviceId ?? ''}`;
  const [traido, setTraido] = useState<{
    clave: string;
    heatmap: HeatmapResult | null;
    perfil: HourProfilePoint[] | null;
  } | null>(null);

  // Lo de otra consulta no se muestra: se ignora hasta que llegue lo de esta.
  const heatmap = traido?.clave === clave ? traido.heatmap : null;
  const perfil = traido?.clave === clave ? traido.perfil : null;

  useEffect(() => {
    if (!aplica) return;
    let cancelled = false;
    const rango = { from: desde, to: hasta, device_id: selectedDeviceId ?? undefined };

    const guardar = (parte: { heatmap?: HeatmapResult; perfil?: HourProfilePoint[] }) => {
      setTraido((previo) => ({
        clave,
        heatmap: parte.heatmap ?? (previo?.clave === clave ? previo.heatmap : null),
        perfil: parte.perfil ?? (previo?.clave === clave ? previo.perfil : null),
      }));
    };

    void getHeatmap({ ...rango, metric: 'import' })
      .then((data) => {
        if (!cancelled) guardar({ heatmap: data });
      })
      .catch(() => {});
    void getDailyProfile(rango)
      .then((data) => {
        if (!cancelled) guardar({ perfil: data });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [aplica, desde, hasta, selectedDeviceId, clave]);

  if (!aplica) return null;

  const semanas = agruparPorSemana(merged);
  const horaPico = heatmap ? horaDeMayorConsumo(heatmap) : null;

  return (
    <>
      <WeeklyBreakdownCard semanas={semanas} soloImporta={soloImporta} />

      <PeakInsightsCard
        diaPico={diaDeMayorConsumo(merged)}
        horaPico={horaPico}
        semanaPico={semanaDeMayorConsumo(semanas)}
      />

      {heatmap && heatmap.dates.length > 0 && (
        <Card>
          <p className="stencil text-slate-500 dark:text-slate-400">
            Reparto hora × día · energía importada (kWh)
          </p>
          <p className="mt-0.5 mb-4 text-[11px] text-slate-400">
            Cada fila es un día y cada columna una hora: acá saltan los patrones que una línea
            esconde. Cuanto más oscura la casilla, más consumo tuvo esa hora.
          </p>
          <CalendarHeatmap data={heatmap} valueFormatter={(v) => formatKwh(v)} />
        </Card>
      )}

      {perfil && perfil.length > 0 && (
        <Card>
          <p className="stencil text-slate-500 dark:text-slate-400">Perfil horario medio</p>
          <p className="mt-0.5 mb-4 text-[11px] text-slate-400">
            El promedio de cada hora en todo el periodo, no el de un día suelto.
          </p>
          <HourlyProfileChart
            profile={perfil}
            peakConsumptionHour={horaPico?.hora ?? null}
            peakExportHour={null}
          />
        </Card>
      )}
    </>
  );
}
