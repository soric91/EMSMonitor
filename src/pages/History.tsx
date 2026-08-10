import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  Download,
  History as HistoryIcon,
  TrendingDown,
  TrendingUp,
  Clock,
  Sigma,
} from 'lucide-react';
import { DashboardFiltersProvider } from '../context/DashboardFiltersContext';
import { useDashboardFilters } from '../hooks/useDashboardFilters';
import { useDevice } from '../hooks/useDevice';
import { getHistory } from '../api/history';
import type { HistoryResponse, TimeSeriesPoint, Variable, VariableDisponible } from '../api/types';
import { colorModeFor } from '../types/variable';
import { useVariablesDelMedidor } from '../hooks/useVariablesDelMedidor';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { AreaChartWidget } from '../components/charts/AreaChartWidget';
import { formatVariableValue, formatLocalDateTime } from '../utils/format';

const IMPORT_COLOR = '#f59e0b';
const EXPORT_COLOR = '#10b981';
const NEUTRAL_COLOR = '#3b82f6';

// "Agrupar cada" — intervalo elegible en vez del binario raw(300s)/downsample(500pts)
// de antes. El backend (`/history`) ya acepta cualquier interval_seconds y protege
// con MAX_POINTS=5000; acá solo se expone la elección.
const INTERVAL_OPTIONS: { label: string; seconds: number }[] = [
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
  { label: '1 hora', seconds: 3600 },
  { label: '3 horas', seconds: 3 * 3600 },
  { label: '6 horas', seconds: 6 * 3600 },
  { label: '12 horas', seconds: 12 * 3600 },
  { label: '24 horas', seconds: 24 * 3600 },
];
const DEFAULT_INTERVAL_SECONDS = 900;

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
  }
  return fallback;
}

function colorForSeries(info: VariableDisponible | undefined, points: { value: number }[]): string {
  const modo = colorModeFor(info?.magnitud ?? null);
  if (modo === 'import') return IMPORT_COLOR;
  if (modo === 'export') return EXPORT_COLOR;
  if (modo === 'power') {
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
  const { variables, porNombre } = useVariablesDelMedidor();
  const info = porNombre.get(variable);

  // Si la variable elegida no la reporta este medidor —el default de la app, o
  // la que quedó seleccionada al cambiar de equipo— se pasa a la primera que sí
  // tenga datos. Antes se quedaba pidiendo una serie que nunca iba a llegar y
  // la pantalla mostraba un vacío sin explicación.
  useEffect(() => {
    if (variables.length === 0 || porNombre.has(variable)) return;
    setVariable(variables[0]!.nombre);
  }, [variables, porNombre, variable, setVariable]);
  const { selectedDeviceId } = useDevice();
  const [intervalSeconds, setIntervalSeconds] = useState(DEFAULT_INTERVAL_SECONDS);
  const [response, setResponse] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await getHistory({
          variable,
          from: fromIso,
          to: toIso,
          interval_seconds: intervalSeconds,
          device_id: selectedDeviceId ?? undefined,
        });
        if (!cancelled) setResponse(data);
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err, 'No se pudo cargar el histórico.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [variable, fromIso, toIso, intervalSeconds, selectedDeviceId]);

  const points = useMemo(() => response?.points ?? [], [response]);
  const chartData = points.map((p) => ({ time: Date.parse(p.time), value: p.value }));
  const color = colorForSeries(info, points);

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
          {variables.map((v) => (
            <option key={v.nombre} value={v.nombre}>
              {v.etiqueta}
            </option>
          ))}
        </select>
        <select
          value={intervalSeconds}
          onChange={(e) => setIntervalSeconds(Number(e.target.value))}
          title="Agrupar cada"
          className="rounded-lg border border-slate-900/10 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
        >
          {INTERVAL_OPTIONS.map((opt) => (
            <option key={opt.seconds} value={opt.seconds}>
              Agrupar cada {opt.label}
            </option>
          ))}
        </select>
        <DateRangePicker fromIso={fromIso} toIso={toIso} onChange={setRange} />
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {info?.etiqueta ?? variable}
            {response && (
              <span className="ml-2 text-slate-400">
                · {response.aggregation} · cada {response.interval_seconds}s
              </span>
            )}
          </p>
        </div>

        {loading && <Skeleton className="h-[260px] w-full" />}
        {!loading && error && <p className="text-sm text-red-500">{error}</p>}
        {!loading && !error && points.length === 0 && (
          <EmptyState
            icon={HistoryIcon}
            title="Sin datos"
            description="No hay puntos en el rango seleccionado."
          />
        )}
        {!loading && !error && points.length > 0 && (
          <AreaChartWidget
            data={chartData}
            color={color}
            height={280}
            valueFormatter={(v) => formatVariableValue(info?.unidad ?? '', v)}
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
                {formatVariableValue(info?.unidad ?? '', stats.min)}
              </p>
            </div>
            <TrendingDown className="h-4 w-4 text-slate-400" />
          </Card>
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Máximo</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {formatVariableValue(info?.unidad ?? '', stats.max)}
              </p>
            </div>
            <TrendingUp className="h-4 w-4 text-slate-400" />
          </Card>
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Promedio</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {formatVariableValue(info?.unidad ?? '', stats.mean)}
              </p>
            </div>
            <Sigma className="h-4 w-4 text-slate-400" />
          </Card>
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Último</p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {formatVariableValue(info?.unidad ?? '', stats.last)}
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
