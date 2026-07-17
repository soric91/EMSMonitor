import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, History as HistoryIcon, TrendingDown, TrendingUp, Clock, Sigma } from 'lucide-react';
import { DashboardFiltersProvider } from '../context/DashboardFiltersContext';
import { useDashboardFilters } from '../hooks/useDashboardFilters';
import { getHistory, getHistoryDownsample } from '../api/history';
import type { HistoryResponse, TimeSeriesPoint, Variable } from '../api/types';
import { VARIABLE_LIST, VARIABLE_META } from '../types/variable';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { AreaChartWidget } from '../components/charts/AreaChartWidget';
import { formatVariableValue, formatLocalDateTime } from '../utils/format';

const RAW_THRESHOLD_MS = 6 * 3_600_000;
const IMPORT_COLOR = '#f59e0b';
const EXPORT_COLOR = '#10b981';
const NEUTRAL_COLOR = '#3b82f6';

function colorForSeries(variable: Variable, points: { value: number }[]): string {
  const meta = VARIABLE_META[variable];
  if (meta.colorMode === 'import') return IMPORT_COLOR;
  if (meta.colorMode === 'export') return EXPORT_COLOR;
  if (meta.colorMode === 'power') {
    const mean = points.reduce((sum, p) => sum + p.value, 0) / (points.length || 1);
    return mean >= 0 ? IMPORT_COLOR : EXPORT_COLOR;
  }
  return NEUTRAL_COLOR;
}

function downloadCsv(variable: Variable, points: TimeSeriesPoint[]): void {
  const rows = [
    'hora_bogota,valor',
    ...points.map((p) => `${formatLocalDateTime(p.time, "yyyy-MM-dd'T'HH:mm:ss")},${p.value}`),
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${variable.toLowerCase()}_historico.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function HistoryContent() {
  const { variable, fromIso, toIso, setVariable, setRange } = useDashboardFilters();
  const [response, setResponse] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(false);
      const spanMs = Date.parse(toIso) - Date.parse(fromIso);
      try {
        const data =
          spanMs <= RAW_THRESHOLD_MS
            ? await getHistory({ variable, from: fromIso, to: toIso, interval_seconds: 300 })
            : await getHistoryDownsample({ variable, from: fromIso, to: toIso, target_points: 500 });
        if (!cancelled) setResponse(data);
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
  }, [variable, fromIso, toIso]);

  const meta = VARIABLE_META[variable];
  const points = useMemo(() => response?.points ?? [], [response]);
  const chartData = points.map((p) => ({ time: Date.parse(p.time), value: p.value }));
  const color = colorForSeries(variable, points);

  const stats = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const last = points[points.length - 1]!.value;
    return { min, max, mean, last };
  }, [points]);

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={variable}
          onChange={(e) => setVariable(e.target.value as Variable)}
          className="rounded-lg border border-slate-900/10 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
        >
          {VARIABLE_LIST.map((v) => (
            <option key={v} value={v}>
              {VARIABLE_META[v].label}
            </option>
          ))}
        </select>
        <DateRangePicker fromIso={fromIso} toIso={toIso} onChange={setRange} />
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {meta.label}
            {response && (
              <span className="ml-2 text-slate-400">
                · {response.aggregation} · cada {response.interval_seconds}s
              </span>
            )}
          </p>
        </div>

        {loading && <Skeleton className="h-[260px] w-full" />}
        {!loading && error && (
          <p className="text-sm text-red-500">No se pudo cargar el histórico.</p>
        )}
        {!loading && !error && points.length === 0 && (
          <EmptyState icon={HistoryIcon} title="Sin datos" description="No hay puntos en el rango seleccionado." />
        )}
        {!loading && !error && points.length > 0 && (
          <AreaChartWidget
            data={chartData}
            color={color}
            height={280}
            valueFormatter={(v) => formatVariableValue(variable, v)}
            timeFormatter={(t) => formatLocalDateTime(new Date(t).toISOString(), 'd MMM, HH:mm')}
          />
        )}
      </Card>

      {!loading && !error && stats && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-2 gap-4 sm:grid-cols-4"
        >
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Mínimo</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {formatVariableValue(variable, stats.min)}
              </p>
            </div>
            <TrendingDown className="h-4 w-4 text-slate-400" />
          </Card>
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Máximo</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {formatVariableValue(variable, stats.max)}
              </p>
            </div>
            <TrendingUp className="h-4 w-4 text-slate-400" />
          </Card>
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Promedio</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {formatVariableValue(variable, stats.mean)}
              </p>
            </div>
            <Sigma className="h-4 w-4 text-slate-400" />
          </Card>
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Último</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {formatVariableValue(variable, stats.last)}
              </p>
            </div>
            <Clock className="h-4 w-4 text-slate-400" />
          </Card>
        </motion.div>
      )}

      {!loading && !error && points.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => downloadCsv(variable, points)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-900/10 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV ({points.length} puntos)
          </button>
        </div>
      )}
    </div>
  );
}

export default function History() {
  return (
    <DashboardFiltersProvider>
      <HistoryContent />
    </DashboardFiltersProvider>
  );
}
