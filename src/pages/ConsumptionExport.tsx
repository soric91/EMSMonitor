import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownToLine, ArrowUpFromLine, Scale } from 'lucide-react';
import { getReport } from '../api/reports';
import { useDevice } from '../hooks/useDevice';
import type { Period, ReportData, ReportType } from '../api/types';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import {
  ComparisonBarChart,
  type ComparisonBarPoint,
} from '../components/charts/ComparisonBarChart';
import { CostBreakdownSummary } from '../components/dashboard/CostBreakdownSummary';
import { formatCop, formatKwh, formatLocalDateTime } from '../utils/format';

const TABS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Día' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'year', label: 'Año' },
];

// getReport usa ReportType ("daily"/"weekly"/...), esta página usa Period
// ("day"/"week"/...) para las tabs — mismo periodo, dos convenciones de string
// distintas ya establecidas en el backend (ver CostPeriod vs ReportType).
const PERIOD_TO_REPORT_TYPE: Record<Period, Exclude<ReportType, 'custom'>> = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
  year: 'yearly',
};

const BUCKET_FORMAT: Record<Period, string> = {
  day: 'HH:mm',
  week: 'EEE',
  month: 'd MMM',
  year: 'MMM',
};

function mergeSeries(report: ReportData, period: Period): ComparisonBarPoint[] {
  const byTime = new Map<string, ComparisonBarPoint>();
  for (const p of report.consumption_series) {
    byTime.set(p.time, {
      label: formatLocalDateTime(p.time, BUCKET_FORMAT[period]),
      a: p.value,
      b: 0,
    });
  }
  for (const p of report.export_series) {
    const existing = byTime.get(p.time);
    if (existing) {
      existing.b = p.value;
    } else {
      byTime.set(p.time, {
        label: formatLocalDateTime(p.time, BUCKET_FORMAT[period]),
        a: 0,
        b: p.value,
      });
    }
  }
  return Array.from(byTime.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, point]) => point);
}

export default function ConsumptionExport() {
  const { selectedDeviceId } = useDevice();
  const [period, setPeriod] = useState<Period>('day');
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(false);
      try {
        const data = await getReport(PERIOD_TO_REPORT_TYPE[period], selectedDeviceId ?? undefined);
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

  const net = report ? report.net_balance_kwh : null;
  const costs = report ? report.costs : null;

  return (
    <div className="space-y-6">
      <Card className="inline-flex w-fit gap-1 p-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setPeriod(tab.key)}
            className={[
              'relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              period === tab.key
                ? 'text-slate-950'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
            ].join(' ')}
          >
            {period === tab.key && (
              <motion.span
                layoutId="consumption-tab-pill"
                className="absolute inset-0 rounded-lg bg-emerald-500"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">{tab.label}</span>
          </button>
        ))}
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
        <Card className="text-sm text-red-500">No se pudo cargar la comparación.</Card>
      )}

      {!loading && !error && report && (
        <>
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
                    net === null
                      ? 'text-slate-900 dark:text-white'
                      : net >= 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400',
                  ].join(' ')}
                >
                  {net !== null ? formatKwh(Math.abs(net)) : '—'}
                </p>
                <p
                  className={[
                    'text-xs',
                    net === null
                      ? 'text-slate-400'
                      : net >= 0
                        ? 'text-amber-600/80 dark:text-amber-400/80'
                        : 'text-emerald-600/80 dark:text-emerald-400/80',
                  ].join(' ')}
                >
                  {net !== null && (net >= 0 ? 'Importador neto' : 'Exportador neto')}
                </p>
              </div>
              <div
                className={[
                  'rounded-xl p-2',
                  net === null
                    ? 'bg-slate-500/10 text-slate-500 dark:text-slate-400'
                    : net >= 0
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                ].join(' ')}
              >
                <Scale className="h-5 w-5" />
              </div>
            </Card>
          </div>

          {costs && <CostBreakdownSummary costs={costs} />}

          <Card>
            <p className="mb-4 text-xs font-medium text-slate-500 dark:text-slate-400">
              Importación vs. exportación
            </p>
            <ComparisonBarChart
              data={mergeSeries(report, period)}
              labelA="Importado"
              labelB="Exportado"
              valueFormatter={(v) => formatKwh(v)}
            />
          </Card>

          {costs && costs.series.length > 0 && (
            <Card>
              <p className="mb-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                Costo por periodo (COP)
              </p>
              <ComparisonBarChart
                data={costs.series.map((p) => ({
                  label: formatLocalDateTime(p.time, BUCKET_FORMAT[period]),
                  a: p.consumption_cost_cop,
                  b: p.export_credit_cop,
                }))}
                labelA="Costo importado"
                labelB="Crédito exportado"
                valueFormatter={(v) => formatCop(v)}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
