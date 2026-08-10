import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownToLine, ArrowUpFromLine, Minus } from 'lucide-react';
import { useRealtime } from '../../hooks/useRealtime';
import {
  createEmsWebSocket,
  type EmsWebSocketClient,
  type WsConnectionStatus,
} from '../../api/websocket';
import { getHistoryDownsample } from '../../api/history';
import { LiveLineChart, type LiveChartPoint, type LiveChartSeries } from '../charts/LiveLineChart';
import { Card } from '../ui/Card';
import { formatVariableValue } from '../../utils/format';
import {
  colorModeFor,
  esGraficableEnVivo,
  etiquetaMagnitud,
  ordenarMagnitudes,
} from '../../types/variable';
import { useVariablesDelMedidor } from '../../hooks/useVariablesDelMedidor';
import type { Variable, VariableDisponible } from '../../api/types';

interface Tab {
  key: string;
  label: string;
  variables: VariableDisponible[];
}

// Cuántas fases se dibujan juntas en una pestaña. Cada variable extra necesita
// su propia conexión WebSocket —el backend acepta una variable por conexión—
// así que el límite es real y no estético: son sockets abiertos.
const MAX_SERIES_POR_GRUPO = 3;

const BUFFER_WINDOW_MS = 6 * 3_600_000; // 6 horas
const BACKFILL_TARGET_POINTS = 360; // ~1min de resolución sobre 6h
const IMPORT_COLOR = '#f59e0b';
const EXPORT_COLOR = '#10b981';
const NEUTRAL_COLOR_A = '#3b82f6';
// Para la segunda y tercera fase de un grupo. La primera usa `primaryColor`.
const SERIE_COLORES = ['#06b6d4', '#a855f7'];

type VariableBuffers = Partial<Record<Variable, LiveChartPoint[]>>;

function pruneOld(points: LiveChartPoint[]): LiveChartPoint[] {
  const cutoff = Date.now() - BUFFER_WINDOW_MS;
  const idx = points.findIndex((p) => p.time >= cutoff);
  return idx <= 0 ? points : points.slice(idx);
}

function appendPoint(
  buffers: VariableBuffers,
  variable: Variable,
  point: LiveChartPoint,
): VariableBuffers {
  const list = buffers[variable] ?? [];
  return { ...buffers, [variable]: pruneOld([...list, point]) };
}

export function LiveVariableChart() {
  const { status, latestData, subscribe, onDataEvent } = useRealtime();
  const { porMagnitud, cargando: cargandoVariables } = useVariablesDelMedidor();
  const [tabKey, setTabKey] = useState<string | null>(null);
  const [customVariable, setCustomVariable] = useState<VariableDisponible | null>(null);
  const [buffers, setBuffers] = useState<VariableBuffers>({});
  // El estado va junto a las variables a las que corresponde. Guardar solo el
  // estado obligaba a resetearlo a 'connecting' desde el efecto al cambiar de
  // pestaña; con la clave adentro, un estado viejo se reconoce como viejo y no
  // hay nada que resetear.
  const [estadoConexionesExtra, setEstadoConexionesExtra] = useState<{
    key: string;
    status: WsConnectionStatus;
  }>({ key: '', status: 'connecting' });
  const [backfilling, setBackfilling] = useState(false);
  const [readyVariables, setReadyVariables] = useState<ReadonlySet<Variable>>(new Set());
  const secondaryClientsRef = useRef<EmsWebSocketClient[]>([]);
  const backfilledRef = useRef(new Set<Variable>());

  // Una pestaña por magnitud que este cliente realmente reporta. Un medidor
  // monofásico ve "Voltaje" con una sola serie; uno trifásico, con tres. La
  // pestaña de una magnitud que no llega simplemente no existe, en vez de
  // abrirse a una gráfica vacía.
  const tabs = useMemo<Tab[]>(() => {
    const magnitudes = ordenarMagnitudes([...porMagnitud.keys()]);
    return magnitudes
      .map((magnitud) => ({
        key: magnitud,
        label: etiquetaMagnitud(magnitud),
        variables: (porMagnitud.get(magnitud) ?? [])
          .filter(esGraficableEnVivo)
          .slice(0, MAX_SERIES_POR_GRUPO),
      }))
      .filter((tab) => tab.variables.length > 0);
  }, [porMagnitud]);

  // Lo que no entró en ninguna pestaña: magnitudes con más fases que el tope
  // del grupo. Sigue siendo alcanzable, solo que un paso más lejos.
  const variablesSueltas = useMemo(() => {
    const enPestanas = new Set(tabs.flatMap((t) => t.variables.map((v) => v.nombre)));
    return [...porMagnitud.values()]
      .flat()
      .filter((v) => !enPestanas.has(v.nombre) && esGraficableEnVivo(v));
  }, [tabs, porMagnitud]);

  // La pestaña activa se deriva, no se guarda: si la elegida no está entre las
  // que este medidor reporta —al arrancar, o al cambiar de equipo— cae sola a
  // la primera disponible. Guardarla en estado obligaba a corregirla desde un
  // efecto, que es un render de más y una ventana en la que la vista apunta a
  // una magnitud que no existe.
  const activeTab = tabs.find((t) => t.key === tabKey) ?? tabs[0];
  const activeKey = activeTab?.key ?? null;
  const activeVariables: VariableDisponible[] = useMemo(
    () => (customVariable ? [customVariable] : (activeTab?.variables ?? [])),
    [customVariable, activeTab],
  );
  const primaryVariable = activeVariables[0]?.nombre;
  // Todas menos la primera necesitan conexión propia.
  const secondaryVariables = useMemo(
    () => activeVariables.slice(1).map((v) => v.nombre),
    [activeVariables],
  );
  const secondaryKey = secondaryVariables.join(',');

  // Al activar una variable por primera vez, se rellena con 1h de historial real
  // antes de seguir agregando los ticks en vivo por encima.
  useEffect(() => {
    const toBackfill = [primaryVariable, ...secondaryVariables].filter(
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
            const seeded = response.points.map((p) => ({
              time: Date.parse(p.time),
              value: p.value,
            }));
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
    // `secondaryKey` en vez del array: un array nuevo en cada render
    // reejecutaría el efecto para siempre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryVariable, secondaryKey]);

  // La variable primaria siempre va por la conexión WS compartida del dashboard.
  useEffect(() => {
    if (status === 'connected' && primaryVariable) {
      subscribe(primaryVariable);
    }
  }, [status, primaryVariable, subscribe]);

  useEffect(() => {
    return onDataEvent((event) => {
      setBuffers((prev) =>
        appendPoint(prev, event.variable, {
          time: Date.parse(event.timestamp),
          value: event.value,
        }),
      );
    });
  }, [onDataEvent]);

  // Las fases que no son la primera necesitan una conexión cada una: el
  // backend permite una sola variable activa por conexión, y la compartida del
  // dashboard ya la ocupa la primaria. Con un trifásico son dos sockets extra.
  useEffect(() => {
    const nombres = secondaryKey === '' ? [] : secondaryKey.split(',');
    if (nombres.length === 0) return;

    const clients = nombres.map((nombre) => {
      const client = createEmsWebSocket({
        // Solo la primera reporta estado: con varias conexiones el indicador
        // mostraría el de la última en cambiar, que no dice nada útil.
        onStatusChange:
          nombre === nombres[0]
            ? (status) => setEstadoConexionesExtra({ key: secondaryKey, status })
            : () => {},
        onData: (event) => {
          setBuffers((prev) =>
            appendPoint(prev, event.variable, {
              time: Date.parse(event.timestamp),
              value: event.value,
            }),
          );
        },
      });
      client.connect();
      client.subscribe(nombre);
      return client;
    });
    secondaryClientsRef.current = clients;

    return () => {
      for (const client of clients) client.close();
      secondaryClientsRef.current = [];
    };
  }, [secondaryKey]);

  // Sin fases extra no hay nada conectando: el estado guardado es de la última
  // vez que sí las hubo y mostraría un "conectando…" que ya no corresponde.
  const secondaryStatus: WsConnectionStatus =
    secondaryVariables.length === 0
      ? 'connected'
      : estadoConexionesExtra.key === secondaryKey
        ? estadoConexionesExtra.status
        : 'connecting';
  const primaryInfo = activeVariables[0] ?? null;
  const primaryColorMode = primaryInfo ? colorModeFor(primaryInfo.magnitud) : 'neutral';
  const primaryBuffer = primaryVariable ? (buffers[primaryVariable] ?? []) : [];
  const primaryValue =
    latestData && latestData.variable === primaryVariable
      ? latestData.value
      : (primaryBuffer[primaryBuffer.length - 1]?.value ?? null);

  const isPowerSigned = primaryColorMode === 'power';
  const isImporting = isPowerSigned && primaryValue !== null && primaryValue > 1;
  const isExporting = isPowerSigned && primaryValue !== null && primaryValue < -1;
  const primaryColor =
    primaryColorMode === 'import' || isImporting
      ? IMPORT_COLOR
      : primaryColorMode === 'export' || isExporting
        ? EXPORT_COLOR
        : NEUTRAL_COLOR_A;

  const chartSeries: LiveChartSeries[] = activeVariables.map((v, i) => ({
    key: v.nombre,
    // La etiqueta viene del catálogo: "Tensión fase C", no `PhV_phsC`.
    label: v.etiqueta,
    color: i === 0 ? primaryColor : SERIE_COLORES[(i - 1) % SERIE_COLORES.length]!,
    data: buffers[v.nombre] ?? [],
  }));
  const hasData = chartSeries.some((s) => s.data.length > 1);
  const isPrimaryReady = primaryVariable ? readyVariables.has(primaryVariable) : false;
  const groupKey = `${customVariable?.nombre ?? activeKey}:${isPrimaryReady ? 'ready' : 'pending'}`;

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
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setTabKey(tab.key);
                  setCustomVariable(null);
                }}
                className={[
                  'relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  !customVariable && activeKey === tab.key
                    ? 'text-slate-950'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                ].join(' ')}
              >
                {!customVariable && activeKey === tab.key && (
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
            value={customVariable?.nombre ?? ''}
            onChange={(e) =>
              setCustomVariable(variablesSueltas.find((v) => v.nombre === e.target.value) ?? null)
            }
            className="rounded-lg border border-slate-900/10 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="" disabled>
              Más variables…
            </option>
            {variablesSueltas.map((v) => (
              <option key={v.nombre} value={v.nombre}>
                {v.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* En modo dual (Voltaje/Corriente) la leyenda dentro de la gráfica ya muestra
          ambos valores en vivo — repetir uno grande aquí sería duplicado. */}
      {secondaryVariables.length === 0 && (
        <div className="mt-4 flex items-center gap-2">
          <p className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {primaryValue !== null && primaryVariable
              ? formatVariableValue(
                  primaryInfo?.unidad ?? '',
                  isPowerSigned ? Math.abs(primaryValue) : primaryValue,
                )
              : '—'}
          </p>
        </div>
      )}
      {secondaryVariables.length > 0 && secondaryStatus !== 'connected' && (
        <p className="mt-4 text-xs text-slate-400">
          conectando {secondaryVariables.length === 1 ? 'la otra fase' : 'las otras fases'}…
        </p>
      )}

      <div className="mt-3">
        {hasData ? (
          <LiveLineChart
            series={chartSeries}
            seriesKey={groupKey}
            forceFit={isPrimaryReady}
            valueFormatter={(v) =>
              primaryInfo ? formatVariableValue(primaryInfo.unidad, v) : `${v}`
            }
          />
        ) : (
          <div className="flex h-[260px] items-center justify-center text-sm text-slate-400">
            {cargandoVariables
              ? 'Cargando variables…'
              : tabs.length === 0
                ? 'Este medidor todavía no reporta ninguna medición'
                : status !== 'connected'
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
