import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, FileText } from 'lucide-react';
import { getReport, getCustomReport } from '../api/reports';
import { useDevice } from '../hooks/useDevice';
import { useSiteMode } from '../hooks/useSiteMode';
import type { Period, RangoIso } from '../domain/periods';
import {
  MENSAJE_RANGO_INVALIDO,
  agrupacionPorDefecto,
  agrupacionesDisponibles,
  esPeriodo,
  formatoDeBucket,
  validarRango,
} from '../domain/periods';
import type { EnergyBucket, ReportData } from '../api/types';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { TabPills } from '../components/ui/TabPills';
import { MetricsGrid } from '../components/ui/MetricsGrid';
import { ComparisonBarChart } from '../components/charts/ComparisonBarChart';
import { PeriodCostChart } from '../components/charts/PeriodCostChart';
import { CostBreakdownSummary } from '../components/dashboard/CostBreakdownSummary';
import { EnergyBalanceCards } from '../components/dashboard/EnergyBalanceCards';
import { MonthlyReportButton } from '../components/dashboard/MonthlyReportButton';
import { PeriodDetailSections } from '../components/dashboard/PeriodDetailSections';
import { mergeSeries } from '../utils/mergeSeries';
import { downloadCsv } from '../utils/downloadCsv';
import { NOT_APPLICABLE } from '../utils/labels';
import { formatKwh, formatLocalDateTime, formatWatts } from '../utils/format';
import { hoursAgoLocalInput, localInputToUtcIso, nowLocalInput } from '../utils/timezone';

const TABS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Diario' },
  { key: 'week', label: 'Semanal' },
  { key: 'month', label: 'Mensual' },
  { key: 'year', label: 'Anual' },
  { key: 'custom', label: 'Personalizado' },
];

export default function Reports() {
  const { selectedDeviceId } = useDevice();
  // La mayoría de las sedes solo importa energía; esta instalación con solar
  // es el caso especial. Donde no hay generación, exportado y crédito no se
  // muestran en cero: se omiten (ver `useSiteMode`). Mientras no se sabe, no
  // se esconde nada.
  const soloImporta = useSiteMode()?.mode === 'consumo';

  // El periodo y el rango viven en la URL: un reporte por fecha que no se
  // puede recargar ni pasar por chat es un reporte que hay que volver a armar
  // a mano cada vez.
  const [params, setParams] = useSearchParams();
  // Las fechas por defecto se fijan al montar: recalcular "ahora" en cada
  // render haría que el rango cambiara solo mientras nadie lo toca.
  const [rangoInicial] = useState(() => ({
    from: localInputToUtcIso(hoursAgoLocalInput(24)),
    to: localInputToUtcIso(nowLocalInput()),
  }));
  const period: Period = esPeriodo(params.get('period')) ? (params.get('period') as Period) : 'day';
  const fromIso = params.get('from') ?? rangoInicial.from;
  const toIso = params.get('to') ?? rangoInicial.to;

  // El rango efectivamente pedido, que no es el del selector: las fechas se
  // editan sin que cada tecla dispare una consulta. En los periodos fijos lo
  // resuelve el backend.
  const [pedido, setPedido] = useState<RangoIso | null>(() =>
    esPeriodo(params.get('period')) &&
    params.get('period') === 'custom' &&
    params.get('from') &&
    params.get('to')
      ? { from: params.get('from')!, to: params.get('to')! }
      : null,
  );
  // El reporte guarda de qué medidor es. Antes se vaciaba dentro de un efecto
  // al cambiar de sede, lo que además de disparar un render en cascada dejaba
  // un parpadeo: los números viejos se iban antes de que llegaran los nuevos.
  const [traido, setTraido] = useState<{ deviceId: string | null; data: ReportData } | null>(null);
  const report = traido?.deviceId === (selectedDeviceId ?? null) ? traido.data : null;
  const setReport = useCallback(
    (data: ReportData | null) =>
      setTraido(data === null ? null : { deviceId: selectedDeviceId ?? null, data }),
    [selectedDeviceId],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // `null` = la que proponga el backend para el rango. Solo se fija cuando
  // alguien elige otra: así cambiar de pestaña no arrastra una agrupación que
  // en el periodo nuevo no tiene sentido.
  const [agrupacion, setAgrupacion] = useState<EnergyBucket | null>(null);

  // Dos cargas distintas: la que no tiene nada que mostrar todavía (esqueleto)
  // y la que ya tiene un reporte en pantalla y solo está trayendo otra versión
  // del mismo periodo. Confundirlas hacía que elegir "Hora" borrara la página
  // entera —totales, costos, KPIs— para volver a pintar lo mismo salvo las
  // barras.
  const sinNada = loading && report === null;
  const recargando = loading && report !== null;

  const motivoInvalido = validarRango(fromIso, toIso);

  /** Escribe periodo y rango en la URL de una sola vez. */
  const navegar = useCallback(
    (siguiente: { period?: Period; from?: string; to?: string }) => {
      setParams(
        (previos) => {
          const copia = new URLSearchParams(previos);
          copia.set('period', siguiente.period ?? period);
          copia.set('from', siguiente.from ?? fromIso);
          copia.set('to', siguiente.to ?? toIso);
          return copia;
        },
        { replace: true },
      );
    },
    [setParams, period, fromIso, toIso],
  );

  // Qué agrupaciones tienen sentido para el periodo que se está viendo, y
  // cuál está activa: la elegida, o la que el backend aplicó por defecto.
  const agrupaciones = report
    ? agrupacionesDisponibles(report.period_start, report.period_end)
    : [];
  const agrupacionActiva =
    agrupacion ?? (report ? agrupacionPorDefecto(report.period_start, report.period_end) : null);

  // La etiqueta del bucket sale de la duración del reporte, no de su nombre:
  // un rango personalizado de seis meses no se puede rotular hora por hora.
  const formato = report
    ? formatoDeBucket(report.period_start, report.period_end, agrupacionActiva ?? undefined)
    : 'd MMM';
  const etiqueta = (time: string) => formatLocalDateTime(time, formato);

  // Una sola fusión sirve a la gráfica y al CSV: comparten los mismos buckets.
  const merged = report
    ? mergeSeries(report.consumption_series, report.export_series, etiqueta)
    : [];

  const exportCsv = () => {
    if (!report) return;
    // costs.series trae kWh + COP por bucket (mismo bucketing que las series de energía).
    const costByTime = new Map(report.costs.series.map((p) => [p.time, p]));
    // El nombre lleva las fechas: con `reporte_custom.csv` todos los rangos
    // se llamaban igual y se pisaban en la carpeta de descargas.
    const desde = formatLocalDateTime(report.period_start, 'yyyy-MM-dd');
    const hasta = formatLocalDateTime(report.period_end, 'yyyy-MM-dd');
    // La agrupación va en el nombre: el mismo rango bajado por hora y por día
    // son dos archivos distintos y hay que poder distinguirlos.
    const paso = agrupacionActiva ?? 'auto';
    // Las columnas de exportación solo van donde hay generación: en una sede
    // de consumo puro serían dos columnas de ceros que alguien tendría que
    // interpretar en su hoja de cálculo.
    const columnas = soloImporta
      ? ['hora_bogota', 'consumo_kwh', 'costo_cop']
      : [
          'hora_bogota',
          'importado_kwh',
          'exportado_kwh',
          'costo_importado_cop',
          'credito_exportado_cop',
          'costo_neto_cop',
        ];
    downloadCsv(`reporte_${desde}_${hasta}_${paso}.csv`, [
      columnas,
      ...merged.map((p) => {
        const cost = costByTime.get(p.time);
        return soloImporta
          ? [p.label, String(p.a), String(cost?.consumption_cost_cop ?? '')]
          : [
              p.label,
              String(p.a),
              String(p.b),
              String(cost?.consumption_cost_cop ?? ''),
              String(cost?.export_credit_cop ?? ''),
              String(cost?.net_cost_cop ?? ''),
            ];
      }),
    ]);
  };

  useEffect(() => {
    // Un periodo fijo lo calcula el backend; uno personalizado espera a que
    // alguien pida ese rango (Generar o un atajo).
    if (period === 'custom' && !pedido) return;
    const device_id = selectedDeviceId ?? undefined;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(false);
      try {
        const data =
          period === 'custom'
            ? await getCustomReport({ ...pedido!, device_id, bucket: agrupacion ?? undefined })
            : await getReport(period, device_id, agrupacion ?? undefined);
        if (!cancelled) setReport(data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [period, pedido, selectedDeviceId, agrupacion, setReport]);

  // Un periodo fijo llega sin fechas visibles: las del reporte que devolvió el
  // backend se copian al selector para que se vea de qué días se está
  // hablando, y se puedan ajustar desde ahí.
  const periodoDelReporte = report ? `${report.period_start}|${report.period_end}` : null;
  useEffect(() => {
    if (period === 'custom' || !periodoDelReporte) return;
    const [inicio, fin] = periodoDelReporte.split('|') as [string, string];
    if (inicio !== fromIso || fin !== toIso) navegar({ from: inicio, to: fin });
  }, [period, periodoDelReporte, fromIso, toIso, navegar]);

  /** Pide el reporte del rango que hay en el selector. */
  const generar = (from = fromIso, to = toIso) => {
    if (validarRango(from, to)) return;
    navegar({ period: 'custom', from, to });
    setPedido({ from, to });
  };

  /** Editar una fecha a mano cambia a Personalizado, pero no consulta todavía. */
  const editarRango = (from: string, to: string) => {
    navegar({ period: 'custom', from, to });
    setPedido(null);
    setReport(null);
    setAgrupacion(null);
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabPills
            layoutId="report-tab-pill"
            size="sm"
            options={TABS}
            value={period}
            onChange={(key) => {
              navegar({ period: key });
              setPedido(null);
              setReport(null);
              setAgrupacion(null);
            }}
          />

          <MonthlyReportButton desde={report?.period_start} hasta={report?.period_end} />
        </div>

        {/* El selector está siempre: los cuatro tabs no son otro modo, son
            atajos a un rango de fechas, y verlo escrito es lo que permite
            ajustarlo sin volver a empezar. */}
        <div className="flex flex-wrap items-end gap-2">
          <DateRangePicker
            fromIso={fromIso}
            toIso={toIso}
            onChange={editarRango}
            onPreset={(f, t) => generar(f, t)}
          />
          <button
            onClick={() => generar()}
            disabled={loading || motivoInvalido !== null}
            className="rounded-lg bg-accent-500 px-4 py-2 text-xs font-medium text-slate-950 transition hover:bg-accent-400 disabled:opacity-60"
          >
            {loading ? 'Generando…' : 'Generar'}
          </button>
        </div>

        {motivoInvalido && (
          <p className="text-xs text-red-500">{MENSAJE_RANGO_INVALIDO[motivoInvalido]}</p>
        )}
      </Card>

      {sinNada && <EnergyBalanceCards soloImporta={soloImporta} />}

      {!loading && error && report === null && (
        <Card className="text-sm text-red-500">No se pudo generar el reporte.</Card>
      )}

      {!loading && error && report !== null && (
        // Falló la recarga pero hay un reporte en pantalla: no se borra, se
        // avisa. Sin este aviso quedarían números viejos sin nada que lo diga.
        <Card className="text-sm text-red-500">
          No se pudo actualizar el reporte. Lo que se muestra es la consulta anterior.
        </Card>
      )}

      {!loading && !error && !report && period === 'custom' && (
        <EmptyState
          icon={FileText}
          title="Reporte por fecha"
          description="Elige un rango —o un atajo como “Mes pasado”— y presiona Generar."
        />
      )}

      {report && (
        // Durante una recarga el contenido se queda: lo que cambia es el paso
        // de las barras, no los totales.
        <div className={recargando ? 'space-y-6 opacity-60 transition-opacity' : 'space-y-6'}>
          <Card className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>
              Periodo: {formatLocalDateTime(report.period_start, 'd MMM yyyy, HH:mm')} —{' '}
              {formatLocalDateTime(report.period_end, 'd MMM yyyy, HH:mm')}
            </span>
            <span>Generado: {formatLocalDateTime(report.generated_at)}</span>
          </Card>

          <EnergyBalanceCards
            consumptionKwh={report.consumption_kwh}
            exportKwh={report.export_kwh}
            netKwh={report.net_balance_kwh}
            soloImporta={soloImporta}
          />

          <CostBreakdownSummary costs={report.costs} />

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="stencil text-slate-500 dark:text-slate-400">
                {soloImporta ? 'Consumo del periodo' : 'Importación vs. exportación'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {/* Agrupar es un cambio de lectura, no de datos: los totales
                    de arriba no se mueven, solo en cuántas barras se reparte
                    el periodo. Lo elegido vale también para el CSV. */}
                <TabPills
                  layoutId="report-bucket-pill"
                  size="sm"
                  options={agrupaciones}
                  value={agrupacionActiva}
                  onChange={setAgrupacion}
                />
                <button
                  onClick={exportCsv}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-900/10 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
                >
                  <Download className="h-3.5 w-3.5" />
                  Exportar CSV
                </button>
              </div>
            </div>
            <ComparisonBarChart
              data={merged}
              labelA={soloImporta ? 'Consumo' : 'Importado'}
              labelB="Exportado"
              valueFormatter={(v) => formatKwh(v)}
              ocultarB={soloImporta}
            />
          </Card>

          <PeriodCostChart
            series={report.costs.series}
            labelOf={etiqueta}
            soloImporta={soloImporta}
          />

          {/* El detalle de un periodo largo: semanas, picos y reparto horario.
              Se monta solo cuando el rango da para semanas. */}
          <PeriodDetailSections report={report} merged={merged} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="stencil text-slate-500 dark:text-slate-400">Potencia promedio</p>
              <p className="mt-1.5 readout text-lg text-slate-900 dark:text-white">
                {report.kpis.power_avg_w !== null
                  ? formatWatts(report.kpis.power_avg_w)
                  : NOT_APPLICABLE}
              </p>
            </Card>
            <Card>
              <p className="stencil text-slate-500 dark:text-slate-400">Voltaje promedio</p>
              <p className="mt-1.5 readout text-lg text-slate-900 dark:text-white">
                {report.kpis.voltage_avg_v !== null
                  ? `${report.kpis.voltage_avg_v.toFixed(1)} V`
                  : NOT_APPLICABLE}
              </p>
            </Card>
            <Card>
              <p className="stencil text-slate-500 dark:text-slate-400">Corriente promedio</p>
              <p className="mt-1.5 readout text-lg text-slate-900 dark:text-white">
                {report.kpis.current_avg_a !== null
                  ? `${report.kpis.current_avg_a.toFixed(2)} A`
                  : NOT_APPLICABLE}
              </p>
            </Card>
            <Card>
              <p className="stencil text-slate-500 dark:text-slate-400">Factor de potencia</p>
              <p className="mt-1.5 readout text-lg text-slate-900 dark:text-white">
                {report.kpis.power_factor_avg !== null
                  ? report.kpis.power_factor_avg.toFixed(2)
                  : NOT_APPLICABLE}
              </p>
            </Card>
          </div>

          <MetricsGrid
            max_demand={report.max_demand}
            load_factor={report.load_factor}
            base_load={report.base_load}
          />
        </div>
      )}
    </div>
  );
}
