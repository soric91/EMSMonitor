import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Battery,
  Download,
  FileText,
  Gauge,
  Scale,
  TrendingUp,
} from 'lucide-react';
import { getReport, getCustomReport } from '../api/reports';
import type { ReportData, ReportType } from '../api/types';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { ComparisonBarChart, type ComparisonBarPoint } from '../components/charts/ComparisonBarChart';
import { CostBreakdownSummary } from '../components/dashboard/CostBreakdownSummary';
import { formatKwh, formatLocalDateTime, formatPercent, formatWatts } from '../utils/format';
import { hoursAgoLocalInput, localInputToUtcIso, nowLocalInput } from '../utils/timezone';

const NOT_APPLICABLE = 'No aplica — exportando';

const TABS: { key: ReportType; label: string }[] = [
  { key: 'daily', label: 'Diario' },
  { key: 'weekly', label: 'Semanal' },
  { key: 'monthly', label: 'Mensual' },
  { key: 'yearly', label: 'Anual' },
  { key: 'custom', label: 'Personalizado' },
];

function mergeSeries(report: ReportData): (ComparisonBarPoint & { time: string })[] {
  const byTime = new Map<string, ComparisonBarPoint & { time: string }>();
  for (const p of report.consumption_series) {
    byTime.set(p.time, { time: p.time, label: formatLocalDateTime(p.time, 'd MMM HH:mm'), a: p.value, b: 0 });
  }
  for (const p of report.export_series) {
    const existing = byTime.get(p.time);
    if (existing) {
      existing.b = p.value;
    } else {
      byTime.set(p.time, { time: p.time, label: formatLocalDateTime(p.time, 'd MMM HH:mm'), a: 0, b: p.value });
    }
  }
  return Array.from(byTime.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, point]) => point);
}

function downloadCsv(report: ReportData): void {
  // costs.series trae kWh + COP por bucket (mismo bucketing que las series de energía).
  const costByTime = new Map(report.costs.series.map((p) => [p.time, p]));
  const rows = [
    'hora_bogota,importado_kwh,exportado_kwh,costo_importado_cop,credito_exportado_cop,costo_neto_cop',
    ...mergeSeries(report).map((p) => {
      const cost = costByTime.get(p.time);
      return [
        p.label,
        p.a,
        p.b,
        cost?.consumption_cost_cop ?? '',
        cost?.export_credit_cop ?? '',
        cost?.net_cost_cop ?? '',
      ].join(',');
    }),
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `reporte_${report.report_type}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [fromIso, setFromIso] = useState(() => localInputToUtcIso(hoursAgoLocalInput(24)));
  const [toIso, setToIso] = useState(() => localInputToUtcIso(nowLocalInput()));
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (reportType === 'custom') return;
    const type = reportType;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(false);
      try {
        const data = await getReport(type);
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
  }, [reportType]);

  const generateCustom = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getCustomReport({ from: fromIso, to: toIso });
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
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-900/10 bg-slate-900/[0.03] p-1 dark:border-white/10 dark:bg-white/5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setReportType(tab.key);
                setReport(null);
              }}
              className={[
                'relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                reportType === tab.key
                  ? 'text-slate-950'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
              ].join(' ')}
            >
              {reportType === tab.key && (
                <motion.span
                  layoutId="report-tab-pill"
                  className="absolute inset-0 rounded-md bg-emerald-500"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">{tab.label}</span>
            </button>
          ))}
        </div>

        {reportType === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker fromIso={fromIso} toIso={toIso} onChange={(f, t) => { setFromIso(f); setToIso(t); }} />
            <button
              onClick={generateCustom}
              disabled={loading}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
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

      {!loading && error && <Card className="text-sm text-red-500">No se pudo generar el reporte.</Card>}

      {!loading && !error && !report && reportType === 'custom' && (
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
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Balance neto</p>
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
                onClick={() => downloadCsv(report)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-900/10 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar CSV
              </button>
            </div>
            <ComparisonBarChart
              data={mergeSeries(report)}
              labelA="Importado"
              labelB="Exportado"
              valueFormatter={(v) => formatKwh(v)}
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Potencia promedio</p>
              <p className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
                {report.kpis.power_avg_w !== null ? formatWatts(report.kpis.power_avg_w) : NOT_APPLICABLE}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Voltaje promedio</p>
              <p className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
                {report.kpis.voltage_avg_v !== null ? `${report.kpis.voltage_avg_v.toFixed(1)} V` : NOT_APPLICABLE}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Corriente promedio</p>
              <p className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
                {report.kpis.current_avg_a !== null ? `${report.kpis.current_avg_a.toFixed(2)} A` : NOT_APPLICABLE}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Factor de potencia</p>
              <p className="mt-1.5 text-lg font-semibold text-slate-900 dark:text-white">
                {report.kpis.power_factor_avg !== null ? report.kpis.power_factor_avg.toFixed(2) : NOT_APPLICABLE}
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <TrendingUp className="h-3.5 w-3.5" /> Demanda máxima
              </div>
              {report.max_demand.peak_power_w !== null ? (
                <>
                  <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
                    {formatWatts(report.max_demand.peak_power_w)}
                  </p>
                  {report.max_demand.peak_at && (
                    <p className="text-xs text-slate-400">{formatLocalDateTime(report.max_demand.peak_at)}</p>
                  )}
                </>
              ) : (
                <p className="mt-1.5 text-sm text-slate-400">{NOT_APPLICABLE}</p>
              )}
            </Card>
            <Card>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Gauge className="h-3.5 w-3.5" /> Factor de carga
              </div>
              {report.load_factor.load_factor !== null ? (
                <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
                  {formatPercent(report.load_factor.load_factor)}
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-slate-400">{NOT_APPLICABLE}</p>
              )}
            </Card>
            <Card>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Battery className="h-3.5 w-3.5" /> Carga base
              </div>
              {report.base_load.base_load_w !== null ? (
                <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
                  {formatWatts(report.base_load.base_load_w)}
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-slate-400">{NOT_APPLICABLE}</p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
