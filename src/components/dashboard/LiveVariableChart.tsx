import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownToLine, ArrowUpFromLine, Minus } from 'lucide-react';
import { useRealtime } from '../../hooks/useRealtime';
import { createEmsWebSocket, type EmsWebSocketClient, type WsConnectionStatus } from '../../api/websocket';
import { getHistoryDownsample } from '../../api/history';
import { LiveLineChart, type LiveChartPoint, type LiveChartSeries } from '../charts/LiveLineChart';
import { Card } from '../ui/Card';
import { formatVariableValue } from '../../utils/format';
import { VARIABLE_LIST, VARIABLE_META } from '../../types/variable';
import type { Variable } from '../../api/types';

interface Tab {
  key: string;
  label: string;
  variables: Variable[];
}

const PRIMARY_TABS: Tab[] = [
  { key: 'power', label: 'Potencia', variables: ['POWER_ACTIVE_INST_TOTAL'] },
  { key: 'voltage', label: 'Voltaje', variables: ['VOLTAGE_A', 'VOLTAGE_B'] },
  { key: 'current', label: 'Corriente', variables: ['CURRENT_A', 'CURRENT_B'] },
  { key: 'factor', label: 'F. potencia', variables: ['FACTOR_POTENCIA_TOTAL'] },
];
const PRIMARY_VARIABLES = new Set(PRIMARY_TABS.flatMap((t) => t.variables));
const SECONDARY_VARIABLES = VARIABLE_LIST.filter((v) => !PRIMARY_VARIABLES.has(v));

const BUFFER_WINDOW_MS = 6 * 3_600_000; // 6 horas
const BACKFILL_TARGET_POINTS = 360; // ~1min de resolución sobre 6h
const IMPORT_COLOR = '#f59e0b';
const EXPORT_COLOR = '#10b981';
const NEUTRAL_COLOR_A = '#3b82f6';
const NEUTRAL_COLOR_B = '#06b6d4';

type VariableBuffers = Partial<Record<Variable, LiveChartPoint[]>>;

function pruneOld(points: LiveChartPoint[]): LiveChartPoint[] {
  const cutoff = Date.now() - BUFFER_WINDOW_MS;
  const idx = points.findIndex((p) => p.time >= cutoff);
  return idx <= 0 ? points : points.slice(idx);
}

function appendPoint(buffers: VariableBuffers, variable: Variable, point: LiveChartPoint): VariableBuffers {
  const list = buffers[variable] ?? [];
  return { ...buffers, [variable]: pruneOld([...list, point]) };
}

export function LiveVariableChart() {
  const { status, latestData, subscribe, onDataEvent } = useRealtime();
  const [tabKey, setTabKey] = useState<string>('power');
  const [customVariable, setCustomVariable] = useState<Variable | null>(null);
  const [buffers, setBuffers] = useState<VariableBuffers>({});
  const [secondaryStatus, setSecondaryStatus] = useState<WsConnectionStatus>('connecting');
  const [backfilling, setBackfilling] = useState(false);
  const [readyVariables, setReadyVariables] = useState<ReadonlySet<Variable>>(new Set());
  const secondaryClientRef = useRef<EmsWebSocketClient | null>(null);
  const backfilledRef = useRef(new Set<Variable>());

  const activeTab = PRIMARY_TABS.find((t) => t.key === tabKey);
  const activeVariables: Variable[] = customVariable ? [customVariable] : (activeTab?.variables ?? []);
  const primaryVariable = activeVariables[0];
  const secondaryVariable = activeVariables[1];

  // Al activar una variable por primera vez, se rellena con 1h de historial real
  // antes de seguir agregando los ticks en vivo por encima.
  useEffect(() => {
    const toBackfill = [primaryVariable, secondaryVariable].filter(
      (v): v is Variable => !!v && !backfilledRef.current.has(v),
    );
    if (toBackfill.length === 0) return;

    let cancelled = false;

    async function run() {
      setBackfilling(true);
      await Promise.all(
        toBackfill.map(async (variable) => {
          try {
            const to = new Date();
            const from = new Date(to.getTime() - BUFFER_WINDOW_MS);
            const response = await getHistoryDownsample({
              variable,
              from: from.toISOString(),
              to: to.toISOString(),
              target_points: BACKFILL_TARGET_POINTS,
            });
            // Solo se marca como respaldada si el fetch llegó a aplicarse: en
            // StrictMode (dev) el primer efecto se cancela antes de resolver, y
            // si se marca antes del await, el segundo efecto (el que sí queda)
            // la ve como "ya respaldada" y la salta sin haber traído nada.
            if (cancelled) return;
            backfilledRef.current.add(variable);
            const seeded = response.points.map((p) => ({ time: Date.parse(p.time), value: p.value }));
            setBuffers((prev) => {
              const live = prev[variable] ?? [];
              const liveStart = live.length > 0 ? live[0]!.time : Infinity;
              const merged = pruneOld([...seeded.filter((p) => p.time < liveStart), ...live]);
              return { ...prev, [variable]: merged };
            });
            // Marca la variable como "lista": el chart puede haberse montado antes
            // con un par de ticks en vivo y ya haberse encuadrado a esa vista
            // diminuta; esto dispara un re-encuadre real a las 6h ya cargadas.
            setReadyVariables((prev) => new Set(prev).add(variable));
          } catch {
            // sin historial de respaldo disponible; el buffer sigue solo con datos en vivo
          }
        }),
      );
      if (!cancelled) setBackfilling(false);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [primaryVariable, secondaryVariable]);

  // La variable primaria siempre va por la conexión WS compartida del dashboard.
  useEffect(() => {
    if (status === 'connected' && primaryVariable) {
      subscribe(primaryVariable);
    }
  }, [status, primaryVariable, subscribe]);

  useEffect(() => {
    return onDataEvent((event) => {
      setBuffers((prev) => appendPoint(prev, event.variable, { time: Date.parse(event.timestamp), value: event.value }));
    });
  }, [onDataEvent]);

  // Fase B (Voltaje/Corriente) necesita una segunda conexión: el backend solo
  // permite una variable activa por conexión, y la primaria ya ocupa la compartida.
  useEffect(() => {
    if (!secondaryVariable) {
      secondaryClientRef.current?.close();
      secondaryClientRef.current = null;
      return;
    }

    const client = createEmsWebSocket({
      onStatusChange: setSecondaryStatus,
      onData: (event) => {
        setBuffers((prev) => appendPoint(prev, event.variable, { time: Date.parse(event.timestamp), value: event.value }));
      },
    });
    secondaryClientRef.current = client;
    client.connect();
    client.subscribe(secondaryVariable);

    return () => {
      client.close();
      secondaryClientRef.current = null;
    };
  }, [secondaryVariable]);

  const primaryMeta = primaryVariable ? VARIABLE_META[primaryVariable] : null;
  const primaryBuffer = primaryVariable ? (buffers[primaryVariable] ?? []) : [];
  const primaryValue =
    latestData && latestData.variable === primaryVariable
      ? latestData.value
      : (primaryBuffer[primaryBuffer.length - 1]?.value ?? null);

  const isPowerSigned = primaryMeta?.colorMode === 'power';
  const isImporting = isPowerSigned && primaryValue !== null && primaryValue > 1;
  const isExporting = isPowerSigned && primaryValue !== null && primaryValue < -1;
  const primaryColor =
    primaryMeta?.colorMode === 'import' || isImporting
      ? IMPORT_COLOR
      : primaryMeta?.colorMode === 'export' || isExporting
        ? EXPORT_COLOR
        : NEUTRAL_COLOR_A;

  const chartSeries: LiveChartSeries[] = activeVariables.map((v, i) => ({
    key: v,
    label: VARIABLE_META[v].label,
    color: i === 0 ? primaryColor : NEUTRAL_COLOR_B,
    data: buffers[v] ?? [],
  }));
  const hasData = chartSeries.some((s) => s.data.length > 1);
  const isPrimaryReady = primaryVariable ? readyVariables.has(primaryVariable) : false;
  const groupKey = `${customVariable ?? tabKey}:${isPrimaryReady ? 'ready' : 'pending'}`;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Online</p>
            {status === 'connected' && (
              <span className="relative flex h-1.5 w-1.5">
                <motion.span
                  className="absolute inline-flex h-full w-full rounded-full bg-emerald-500"
                  animate={{ scale: [1, 2.5], opacity: [0.7, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
            )}
            {isPowerSigned && primaryValue !== null && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ color: primaryColor, backgroundColor: `${primaryColor}14` }}
              >
                {isImporting && <ArrowDownToLine className="h-3 w-3" />}
                {isExporting && <ArrowUpFromLine className="h-3 w-3" />}
                {!isImporting && !isExporting && <Minus className="h-3 w-3" />}
                {isImporting ? 'Importando' : isExporting ? 'Exportando' : 'Sin flujo neto'}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-lg border border-slate-900/10 bg-slate-900/[0.03] p-1 dark:border-white/10 dark:bg-white/5">
            {PRIMARY_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setTabKey(tab.key);
                  setCustomVariable(null);
                }}
                className={[
                  'relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  !customVariable && tabKey === tab.key
                    ? 'text-slate-950'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                ].join(' ')}
              >
                {!customVariable && tabKey === tab.key && (
                  <motion.span
                    layoutId="live-chart-tab-pill"
                    className="absolute inset-0 rounded-md bg-white shadow-sm dark:bg-slate-700"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative">{tab.label}</span>
              </button>
            ))}
          </div>
          <select
            value={customVariable ?? ''}
            onChange={(e) => setCustomVariable(e.target.value as Variable)}
            className="rounded-lg border border-slate-900/10 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="" disabled>
              Más variables…
            </option>
            {SECONDARY_VARIABLES.map((v) => (
              <option key={v} value={v}>
                {VARIABLE_META[v].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <p className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {primaryValue !== null && primaryVariable
            ? formatVariableValue(primaryVariable, isPowerSigned ? Math.abs(primaryValue) : primaryValue)
            : '—'}
        </p>
        {secondaryVariable && (
          <span className="text-xs text-slate-400">
            {secondaryStatus === 'connected' ? '· fase B activa' : '· conectando fase B…'}
          </span>
        )}
      </div>

      <div className="mt-3">
        {hasData ? (
          <LiveLineChart
            series={chartSeries}
            seriesKey={groupKey}
            forceFit={isPrimaryReady}
            valueFormatter={(v) => (primaryVariable ? formatVariableValue(primaryVariable, v) : `${v}`)}
          />
        ) : (
          <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
            {status !== 'connected'
              ? 'Conectando al WebSocket…'
              : backfilling
                ? 'Cargando la última hora…'
                : 'Esperando datos…'}
          </div>
        )}
      </div>
    </Card>
  );
}
