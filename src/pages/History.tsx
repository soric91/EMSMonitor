import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
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
import { getHistoryStats } from '../api/history';
import type { HistoryStats, Variable, VariableDisponible } from '../api/types';
import { colorModeFor } from '../types/variable';
import { useVariablesDelMedidor } from '../hooks/useVariablesDelMedidor';
import { useHistorialEnCascada } from '../hooks/useHistorialEnCascada';
import { duracionLegible, marcarVacios } from '../domain/historico';
import type { PuntoConVacio } from '../domain/historico';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { AreaChartWidget } from '../components/charts/AreaChartWidget';
import { formatVariableValue, formatLocalDateTime } from '../utils/format';
import { NOT_APPLICABLE } from '../utils/labels';
import { downloadCsv } from '../utils/downloadCsv';

const IMPORT_COLOR = '#f59e0b';
const EXPORT_COLOR = '#10b981';
const NEUTRAL_COLOR = '#3b82f6';

/**
 * "Agrupar cada". Los tres primeros son el detalle fino que hace falta para
 * ubicar CUÁNDO pasó algo — un pico, un corte, un arranque— y no solo que pasó.
 *
 * Cada uno trae su techo de rango. No es una restricción caprichosa: a un
 * segundo, un día son 86 400 puntos, y aunque la cascada los trae de a tramos,
 * pedir un mes segundo a segundo son dos millones y medio de puntos que ni el
 * backend debería barrer ni el navegador dibujar. El techo dice hasta dónde el
 * detalle sigue siendo útil.
 */
const INTERVAL_OPTIONS: { label: string; seconds: number; maxRangoSegundos: number }[] = [
  { label: '1 segundo', seconds: 1, maxRangoSegundos: 2 * 3600 },
  { label: '1 min', seconds: 60, maxRangoSegundos: 24 * 3600 },
  { label: '5 min', seconds: 300, maxRangoSegundos: 7 * 24 * 3600 },
  { label: '15 min', seconds: 900, maxRangoSegundos: 31 * 24 * 3600 },
  { label: '30 min', seconds: 1800, maxRangoSegundos: 62 * 24 * 3600 },
  { label: '1 hora', seconds: 3600, maxRangoSegundos: 366 * 24 * 3600 },
  { label: '6 horas', seconds: 6 * 3600, maxRangoSegundos: Infinity },
  { label: '12 horas', seconds: 12 * 3600, maxRangoSegundos: Infinity },
  { label: '24 horas', seconds: 24 * 3600, maxRangoSegundos: Infinity },
];
const DEFAULT_INTERVAL_SECONDS = 900;

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

function exportCsv(variable: Variable, points: PuntoConVacio[]): void {
  // La tercera columna es la que faltaba cuando alguien abre el CSV y encuentra
  // un valor imposible: dice que ese punto acumula lo de un tramo sin lecturas.
  downloadCsv(`${variable.toLowerCase()}_historico.csv`, [
    ['hora_bogota', 'valor', 'segundos_sin_lecturas_antes'],
    ...points.map((p) => [
      formatLocalDateTime(p.time, "yyyy-MM-dd'T'HH:mm:ss"),
      String(p.value),
      p.vacioSegundos === null ? '' : String(p.vacioSegundos),
    ]),
  ]);
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

  const opcionIntervalo =
    INTERVAL_OPTIONS.find((o) => o.seconds === intervalSeconds) ?? INTERVAL_OPTIONS[3]!;
  const rangoSegundos = (Date.parse(toIso) - Date.parse(fromIso)) / 1000;
  // Un intervalo fino sobre un rango largo no se pide y se dice por qué: es
  // preferible a mandar veinte mil consultas y que el navegador se arrastre.
  const rangoExcedido = rangoSegundos > opcionIntervalo.maxRangoSegundos;

  const {
    puntos: points,
    respuesta: response,
    cargando: loading,
    error,
    avance,
  } = useHistorialEnCascada({
    variable,
    desde: fromIso,
    hasta: toIso,
    intervaloSegundos: intervalSeconds,
    deviceId: selectedDeviceId ?? undefined,
    activo: !rangoExcedido,
  });
  // Los puntos que vienen tras un hueco se marcan acá y no se corrigen: el
  // valor es energía real, lo que está mal es a qué ventana se le atribuye
  // (ver `marcarVacios`).
  const puntosMarcados = useMemo(
    () => marcarVacios(points, intervalSeconds),
    [points, intervalSeconds],
  );
  const conVacio = puntosMarcados.filter((p) => p.vacioSegundos !== null);
  const vacioMayor = conVacio.reduce(
    (mayor, p) => (p.vacioSegundos! > (mayor?.vacioSegundos ?? 0) ? p : mayor),
    null as PuntoConVacio | null,
  );

  const chartData = points.map((p) => ({ time: Date.parse(p.time), value: p.value }));
  const color = colorForSeries(info, points);

  // F0.2: los cuatro números de abajo salían de reducir `points`, que YA viene
  // agregado por ventana — con "agrupar cada 24 h", el "Máximo" era el mayor de
  // los promedios diarios, varias veces menor que el pico real. Para una
  // variable instantánea se piden a `/history/stats`, que reduce sobre los datos
  // crudos. Un contador acumulativo no admite esa reducción (solo
  // difference()/last()); ahí la serie ya ES energía por ventana, así que sus
  // extremos son legítimos y se rotulan como lo que son.
  const esAcumulativa = info?.acumulativa ?? false;
  const variableConocida = info !== undefined;
  const [stats, setStats] = useState<HistoryStats | null>(null);

  useEffect(() => {
    // Mientras la variable seleccionada no esté en el catálogo del medidor no
    // se pregunta nada: al montar, el filtro trae la variable por defecto de la
    // app, que este medidor puede no reportar (el efecto de arriba la cambia
    // por la primera que sí). Preguntar antes gastaba una consulta por un
    // rango que nadie iba a ver.
    if (!variableConocida || esAcumulativa) return;
    let cancelled = false;

    async function run() {
      try {
        const data = await getHistoryStats({
          variable,
          from: fromIso,
          to: toIso,
          device_id: selectedDeviceId ?? undefined,
        });
        if (!cancelled) setStats(data);
      } catch {
        // El resumen es accesorio: si falla, la gráfica se queda igual.
        if (!cancelled) setStats(null);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [variable, fromIso, toIso, selectedDeviceId, esAcumulativa, variableConocida]);

  const statsPorVentana = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.value);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((sum, v) => sum + v, 0) / values.length,
      last: points[points.length - 1]!.value,
    };
  }, [points]);

  // `stats.variable === variable` evita mostrar los estadísticos de la variable
  // anterior mientras llega la nueva respuesta: el estado sobrevive al cambio
  // de selección, la consulta no es instantánea.
  const resumen = esAcumulativa ? statsPorVentana : stats?.variable === variable ? stats : null;
  const sufijo = esAcumulativa ? ' por ventana' : '';
  const TARJETAS = [
    { clave: 'min', etiqueta: `Mínimo${sufijo}`, icono: TrendingDown },
    { clave: 'max', etiqueta: `Máximo${sufijo}`, icono: TrendingUp },
    { clave: 'mean', etiqueta: `Promedio${sufijo}`, icono: Sigma },
    { clave: 'last', etiqueta: 'Último', icono: Clock },
  ] as const;

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={variable}
          onChange={(e) => setVariable(e.target.value as Variable)}
          className="rounded-lg border border-slate-900/10 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none transition focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
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
          className="rounded-lg border border-slate-900/10 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 outline-none transition focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="stencil text-slate-500 dark:text-slate-400">
            {info?.etiqueta ?? variable}
            {response && (
              <span className="ml-2 text-slate-400">
                · {response.aggregation} · cada {response.interval_seconds}s
              </span>
            )}
          </p>
          {/* Con intervalos finos el rango llega de a tramos: decir cuántos van
              evita que una espera larga se lea como una pantalla colgada. */}
          {loading && avance.total > 1 && (
            <span className="font-stencil text-[10px] tabular-nums text-slate-400">
              trayendo {avance.hechos} / {avance.total} · {points.length} puntos
            </span>
          )}
        </div>

        {rangoExcedido && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
            Con «{opcionIntervalo.label}» el rango no puede pasar de{' '}
            {duracionLegible(opcionIntervalo.maxRangoSegundos)}. Acorta el rango o agrupa más
            grueso: más allá de ahí son millones de puntos que ni el medidor midió tan seguido.
          </div>
        )}

        {/* El pico imposible explicado donde se ve, no en un informe aparte. */}
        {!rangoExcedido && vacioMayor && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
            <p className="font-medium">
              {conVacio.length === 1
                ? 'Un punto de esta serie viene después de un vacío de datos'
                : `${conVacio.length} puntos de esta serie vienen después de un vacío de datos`}
            </p>
            <p className="mt-1 text-[13px] leading-snug opacity-90">
              El mayor es el de {formatLocalDateTime(vacioMayor.time, 'd MMM, HH:mm')}, con{' '}
              {duracionLegible(vacioMayor.vacioSegundos!)} sin lecturas antes.
              {esAcumulativa
                ? ' Su valor no es lo consumido en esa ventana: es todo lo que el contador acumuló durante el vacío. La energía es real; el instante al que se le atribuye, no.'
                : ' Entre esos dos puntos la línea une lo que no se midió.'}
            </p>
          </div>
        )}

        {loading && points.length === 0 && <Skeleton className="h-[260px] w-full" />}
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

      {!loading && !error && resumen && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="grid grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {TARJETAS.map(({ clave, etiqueta, icono: Icono }) => {
            const valor = resumen[clave];
            return (
              <Card key={clave} className="flex items-center justify-between">
                <div>
                  <p className="stencil text-slate-500 dark:text-slate-400">{etiqueta}</p>
                  <p className="mt-1 readout text-lg text-slate-900 dark:text-white">
                    {valor === null
                      ? NOT_APPLICABLE
                      : formatVariableValue(info?.unidad ?? '', valor)}
                  </p>
                </div>
                <Icono className="h-4 w-4 text-slate-400" />
              </Card>
            );
          })}
        </motion.div>
      )}

      {!loading && !error && points.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => exportCsv(variable, puntosMarcados)}
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
