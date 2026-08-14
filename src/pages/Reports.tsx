import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Download, FileText, Scale } from 'lucide-react';
import { getReport, getCustomReport } from '../api/reports';
import { useDevice } from '../hooks/useDevice';
import type { Period } from '../domain/periods';
import type { ReportData } from '../api/types';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { TabPills } from '../components/ui/TabPills';
import { MetricsGrid } from '../components/ui/MetricsGrid';
import { ComparisonBarChart } from '../components/charts/ComparisonBarChart';
import { CostBreakdownSummary } from '../components/dashboard/CostBreakdownSummary';
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
  const [period, setPeriod] = useState<Period>('day');
  const [fromIso, setFromIso] = useState(() => localInputToUtcIso(hoursAgoLocalInput(24)));
  const [toIso, setToIso] = useState(() => localInputToUtcIso(nowLocalInput()));
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Una sola fusión sirve a la gráfica y al CSV: comparten los mismos buckets.
  const merged = report
    ? mergeSeries(report.consumption_series, report.export_series, (time) =>
        formatLocalDateTime(time, 'd MMM HH:mm'),
      )
    : [];

  const exportCsv = () => {
    if (!report) return;
    // costs.series trae kWh + COP por bucket (mismo bucketing que las series de energía).
    const costByTime = new Map(report.costs.series.map((p) => [p.time, p]));
    downloadCsv(`reporte_${report.report_type}.csv`, [
      [
        'hora_bogota',
        'importado_kwh',
        'exportado_kwh',
        'costo_importado_cop',
        'credito_exportado_cop',
        'costo_neto_cop',
      ],
      ...merged.map((p) => {
        const cost = costByTime.get(p.time);
        return [
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
    if (period === 'custom') return;
    const fixed = period;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(false);
      try {
        const data = await getReport(fixed, selectedDeviceId ?? undefined);
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
  }, [period, selectedDeviceId]);

  const generateCustom = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getCustomReport({
        from: fromIso,
        to: toIso,
        device_id: selectedDeviceId ?? undefined,
      });
      setReport(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <TabPills
          layoutId="report-tab-pill"
          size="sm"
          options={TABS}
          value={period}
          onChange={(key) => {
            setPeriod(key);
            setReport(null);
          }}
        />

        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker
              fromIso={fromIso}
              toIso={toIso}
              onChange={(f, t) => {
                setFromIso(f);
                setToIso(t);
              }}
            />
            <button
              onClick={generateCustom}
              disabled={loading}
              className="rounded-lg bg-accent-500 px-4 py-2 text-xs font-medium text-slate-950 transition hover:bg-accent-400 disabled:opacity-60"
            >
              {loading ? 'Generando…' : 'Generar'}
            </button>
          </div>
        )}
      </Card>

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-32" />
            </Card>
          ))}
        </div>
      )}

      {!loading && error && (
        <Card className="text-sm text-red-500">No se pudo generar el reporte.</Card>
      )}

      {!loading && !error && !report && period === 'custom' && (
        <EmptyState
          icon={FileText}
          title="Reporte personalizado"
          description="Elige un rango de fechas y presiona Generar."
        />
      )}

      {!loading && !error && report && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>
              Periodo: {formatLocalDateTime(report.period_start, 'd MMM yyyy, HH:mm')} —{' '}
              {formatLocalDateTime(report.period_end, 'd MMM yyyy, HH:mm')}
            </span>
            <span>Generado: {formatLocalDateTime(report.generated_at)}</span>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Importado</p>
                <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-white">
                  {formatKwh(report.consumption_kwh)}
                </p>
              </div>
              <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                <ArrowDownToLine className="h-5 w-5" />
              </div>
            </Card>
            <Card className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Exportado</p>
                <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-white">
                  {formatKwh(report.export_kwh)}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                <ArrowUpFromLine className="h-5 w-5" />
              </div>
            </Card>
            <Card className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Balance neto
                </p>
                <p
                  className={[
                    'mt-1.5 text-2xl font-semibold',
                    report.net_balance_kwh >= 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400',
                  ].join(' ')}
                >
                  {formatKwh(Math.abs(report.net_balance_kwh))}
                </p>
                <p
                  className={[
                    'text-xs',
                    report.net_balance_kwh >= 0
                      ? 'text-amber-600/80 dark:text-amber-400/80'
                      : 'text-emerald-600/80 dark:text-emerald-400/80',
                  ].join(' ')}
                >
                  {report.net_balance_kwh >= 0 ? 'Importador neto' : 'Exportador neto'}
                </p>
              </div>
              <div className="rounded-xl bg-slate-500/10 p-2 text-slate-500 dark:text-slate-400">
                <Scale className="h-5 w-5" />
              </div>
            </Card>
          </div>

          <CostBreakdownSummary costs={report.costs} />

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Importación vs. exportación
              </p>
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 rounded-lg border border-slate-900/10 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar CSV
              </button>
            </div>
            <ComparisonBarChart
              data={merged}
              labelA="Importado"
              labelB="Exportado"
              valueFormatter={(v) => formatKwh(v)}
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Potencia promedio
              </p>
              <p className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
                {report.kpis.power_avg_w !== null
                  ? formatWatts(report.kpis.power_avg_w)
                  : NOT_APPLICABLE}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Voltaje promedio
              </p>
              <p className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
                {report.kpis.voltage_avg_v !== null
                  ? `${report.kpis.voltage_avg_v.toFixed(1)} V`
                  : NOT_APPLICABLE}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Corriente promedio
              </p>
              <p className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
                {report.kpis.current_avg_a !== null
                  ? `${report.kpis.current_avg_a.toFixed(2)} A`
                  : NOT_APPLICABLE}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Factor de potencia
              </p>
              <p className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
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
        </>
      )}
    </div>
  );
}
