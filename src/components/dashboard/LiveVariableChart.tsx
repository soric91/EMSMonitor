import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Minus } from 'lucide-react';
import { useRealtime } from '../../hooks/useRealtime';
import {
  createEmsWebSocket,
  type EmsWebSocketClient,
  type WsConnectionStatus,
} from '../../api/websocket';
import { getHistoryDownsample } from '../../api/history';
import {
  HISTORY_BUCKET_HOURS,
  HISTORY_POINTS_PER_BUCKET,
  LIVE_HISTORY_BUFFER_MS,
  LIVE_HISTORY_WINDOW_HOURS,
} from '../../config/liveChart';
import { LiveLineChart, type LiveChartPoint, type LiveChartSeries } from '../charts/LiveLineChart';
import { Card } from '../ui/Card';
import { OnlineDot } from '../ui/OnlineDot';
import { TabPills } from '../ui/TabPills';
import { formatVariableValue } from '../../utils/format';
import {
  colorModeFor,
  esGraficableEnVivo,
  etiquetaMagnitud,
  ordenarMagnitudes,
} from '../../types/variable';
import { useDevice } from '../../hooks/useDevice';
import { useVariablesDelMedidor } from '../../hooks/useVariablesDelMedidor';
import type { Magnitud, Variable, VariableDisponible } from '../../api/types';

// Cuántas fases se dibujan juntas en una pestaña. Cada variable extra necesita
// su propia conexión WebSocket —el backend acepta una variable por conexión—
// así que el límite es real y no estético: son sockets abiertos.
const MAX_SERIES_POR_GRUPO = 3;

// Las magnitudes que viven como pestañas en el main. El resto (frecuencia,
// factor de potencia, aparente, reactiva…) va a "Más variables…", para que el
// panel no abra una pestaña por cada magnitud del catálogo. Si un medidor no
// reporta NINGUNA de estas, se vuelve al comportamiento anterior (todo en
// pestañas) para no esconder variables que sí existen.
const MAGNITUDES_PRINCIPALES: ReadonlySet<Magnitud> = new Set([
  'potencia_activa',
  'tension',
  'corriente',
]);

const IMPORT_COLOR = '#f59e0b';
const EXPORT_COLOR = '#10b981';
const NEUTRAL_COLOR_A = '#3b82f6';
// Para la segunda y tercera fase de un grupo. La primera usa `primaryColor`.
const SERIE_COLORES = ['#06b6d4', '#a855f7'];

type VariableBuffers = Partial<Record<Variable, LiveChartPoint[]>>;

/**
 * Lo dibujado, junto al medidor del que salió.
 *
 * Todo lo que acumula esta gráfica —los puntos, qué variables ya se
 * rellenaron, cuáles están encuadradas— pertenece a UN medidor. Al elegir
 * otro, lo anterior no se borra: se reconoce como ajeno al leerlo. Así un
 * equipo recién instalado, sin historia propia, no hereda la curva del que
 * estaba antes ni la conserva mientras llega la suya.
 */
interface PorMedidor<T> {
  device: string | null;
  contenido: T;
}

const SIN_BUFFERS: VariableBuffers = {};
const SIN_VARIABLES: ReadonlySet<Variable> = new Set();

/** Lo guardado si es de este medidor; el vacío si es del anterior. */
function propio<T>(estado: PorMedidor<T>, device: string | null, vacio: T): T {
  return estado.device === device ? estado.contenido : vacio;
}

function pruneOld(points: LiveChartPoint[]): LiveChartPoint[] {
  const cutoff = Date.now() - LIVE_HISTORY_BUFFER_MS;
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
  const { selectedDeviceId } = useDevice();
  const { porMagnitud, cargando: cargandoVariables } = useVariablesDelMedidor();
  const [tabKey, setTabKey] = useState<string | null>(null);
  const [customVariable, setCustomVariable] = useState<VariableDisponible | null>(null);
  const [estadoBuffers, setEstadoBuffers] = useState<PorMedidor<VariableBuffers>>({
    device: null,
    contenido: SIN_BUFFERS,
  });
  // El estado va junto a las variables a las que corresponde. Guardar solo el
  // estado obligaba a resetearlo a 'connecting' desde el efecto al cambiar de
  // pestaña; con la clave adentro, un estado viejo se reconoce como viejo y no
  // hay nada que resetear.
  const [estadoConexionesExtra, setEstadoConexionesExtra] = useState<{
    key: string;
    status: WsConnectionStatus;
  }>({ key: '', status: 'connecting' });
  const [backfilling, setBackfilling] = useState(false);
  const [estadoReady, setEstadoReady] = useState<PorMedidor<ReadonlySet<Variable>>>({
    device: null,
    contenido: SIN_VARIABLES,
  });
  const secondaryClientsRef = useRef<EmsWebSocketClient[]>([]);
  const backfilledRef = useRef<PorMedidor<Set<Variable>>>({
    device: null,
    contenido: new Set(),
  });

  const buffers = propio(estadoBuffers, selectedDeviceId, SIN_BUFFERS);
  const readyVariables = propio(estadoReady, selectedDeviceId, SIN_VARIABLES);

  // Una pestaña por magnitud PRINCIPAL que este cliente realmente reporta. Un
  // medidor monofásico ve "Voltaje" con una sola serie; uno trifásico, con
  // tres. Las magnitudes que no están en MAGNITUDES_PRINCIPALES (y las fases
  // que exceden el tope del grupo) van a "Más variables…".
  const { tabs, variablesSueltas } = useMemo(() => {
    const claves = [...porMagnitud.keys()];
    const hayPrincipales = claves.some((m) => MAGNITUDES_PRINCIPALES.has(m));
    const fuentes = hayPrincipales ? claves.filter((m) => MAGNITUDES_PRINCIPALES.has(m)) : claves;

    const pestanas = ordenarMagnitudes(fuentes)
      .map((magnitud) => ({
        key: magnitud,
        label: etiquetaMagnitud(magnitud),
        variables: (porMagnitud.get(magnitud) ?? [])
          .filter(esGraficableEnVivo)
          .slice(0, MAX_SERIES_POR_GRUPO),
      }))
      .filter((tab) => tab.variables.length > 0);

    const enPestanas = new Set(pestanas.flatMap((t) => t.variables.map((v) => v.nombre)));
    const sueltas = [...porMagnitud.values()]
      .flat()
      .filter((v) => !enPestanas.has(v.nombre) && esGraficableEnVivo(v));

    return { tabs: pestanas, variablesSueltas: sueltas };
  }, [porMagnitud]);

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

  // Al activar una variable por primera vez, se rellena con historial real por
  // buckets horarios secuenciales, de la hora más reciente a la más vieja: cada
  // consulta es liviana (una hora, no la ventana completa) y la gráfica se va
  // llenando hacia atrás hasta completar la ventana configurada.
  useEffect(() => {
    // El registro de lo ya rellenado es de un medidor. Con la misma variable en
    // dos equipos —lo normal: los dos miden potencia activa— dar por cargada la
    // del anterior dejaba la gráfica del nuevo sin pedir nada.
    if (backfilledRef.current.device !== selectedDeviceId) {
      backfilledRef.current = { device: selectedDeviceId, contenido: new Set() };
    }
    const yaCargadas = backfilledRef.current.contenido;

    const toBackfill = [primaryVariable, ...secondaryVariables].filter(
      (v): v is Variable => !!v && !yaCargadas.has(v),
    );
    if (toBackfill.length === 0) return;

    let cancelled = false;

    const buckets = LIVE_HISTORY_WINDOW_HOURS / HISTORY_BUCKET_HOURS;

    async function run() {
      setBackfilling(true);
      await Promise.all(
        toBackfill.map(async (variable) => {
          let gotAny = false;
          for (let i = 0; i < buckets; i++) {
            if (cancelled) return;
            const to = new Date(Date.now() - i * HISTORY_BUCKET_HOURS * 3_600_000);
            const from = new Date(to.getTime() - HISTORY_BUCKET_HOURS * 3_600_000);
            try {
              const response = await getHistoryDownsample({
                variable,
                from: from.toISOString(),
                to: to.toISOString(),
                target_points: HISTORY_POINTS_PER_BUCKET,
                // Sin esto el backend agrega los medidores del cliente y la
                // gráfica dibujaba la suma de todas las acometidas.
                device_id: selectedDeviceId ?? undefined,
              });
              // Solo se considera cargada si al menos un bucket llegó a
              // aplicarse: en StrictMode (dev) el primer efecto se cancela antes
              // de resolver, y si se marca antes del await, el segundo efecto (el
              // que sí queda) la ve como "ya cargada" y la salta sin haber
              // traído nada.
              if (cancelled) return;
              gotAny = true;
              const seeded = response.points.map((p) => ({
                time: Date.parse(p.time),
                value: p.value,
              }));
              setEstadoBuffers((prev) => {
                const actuales = propio(prev, selectedDeviceId, SIN_BUFFERS);
                const existentes = actuales[variable] ?? [];
                const inicio = existentes.length > 0 ? existentes[0]!.time : Infinity;
                // La hora nueva se antepone a la izquierda: primero la más
                // reciente, y las más viejas quedan delante en orden.
                const merged = pruneOld([...seeded.filter((p) => p.time < inicio), ...existentes]);
                return {
                  device: selectedDeviceId,
                  contenido: { ...actuales, [variable]: merged },
                };
              });
            } catch {
              // una hora sin historial disponible; se salta y se sigue con la anterior
            }
          }
          if (!gotAny) return;
          yaCargadas.add(variable);
          // Marca la variable como "lista": el chart puede haberse montado antes
          // con un par de ticks en vivo y ya haberse encuadrado a esa vista
          // diminuta; esto dispara un re-encuadre real a la ventana ya cargada.
          setEstadoReady((prev) => ({
            device: selectedDeviceId,
            contenido: new Set(propio(prev, selectedDeviceId, SIN_VARIABLES)).add(variable),
          }));
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
  }, [primaryVariable, secondaryKey, selectedDeviceId]);

  // La variable primaria siempre va por la conexión WS compartida del dashboard.
  useEffect(() => {
    if (status === 'connected' && primaryVariable) {
      subscribe(primaryVariable);
    }
  }, [status, primaryVariable, subscribe]);

  useEffect(() => {
    return onDataEvent((event) => {
      setEstadoBuffers((prev) => ({
        device: selectedDeviceId,
        contenido: appendPoint(propio(prev, selectedDeviceId, SIN_BUFFERS), event.variable, {
          time: Date.parse(event.timestamp),
          value: event.value,
        }),
      }));
    });
  }, [onDataEvent, selectedDeviceId]);

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
          setEstadoBuffers((prev) => ({
            device: selectedDeviceId,
            contenido: appendPoint(propio(prev, selectedDeviceId, SIN_BUFFERS), event.variable, {
              time: Date.parse(event.timestamp),
              value: event.value,
            }),
          }));
        },
      });
      client.connect();
      client.subscribe(nombre, selectedDeviceId);
      return client;
    });
    secondaryClientsRef.current = clients;

    return () => {
      for (const client of clients) client.close();
      secondaryClientsRef.current = [];
    };
  }, [secondaryKey, selectedDeviceId]);

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
            {status === 'connected' && <OnlineDot pulse size="sm" />}
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
          <TabPills
            layoutId="live-chart-tab-pill"
            size="sm"
            pillClassName="bg-white shadow-sm dark:bg-slate-700"
            options={tabs.map((tab) => ({ key: tab.key, label: tab.label }))}
            value={customVariable ? null : activeKey}
            onChange={(key) => {
              setTabKey(key);
              setCustomVariable(null);
            }}
          />
          <select
            value={customVariable?.nombre ?? ''}
            onChange={(e) =>
              setCustomVariable(variablesSueltas.find((v) => v.nombre === e.target.value) ?? null)
            }
            className="rounded-lg border border-slate-900/10 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 outline-none transition focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
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
          <p className="readout text-2xl text-slate-900 dark:text-white">
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
