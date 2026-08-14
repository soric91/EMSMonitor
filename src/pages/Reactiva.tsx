import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Activity, BadgeCheck, Download, FileSpreadsheet } from 'lucide-react';
import { DashboardFiltersProvider } from '../context/DashboardFiltersContext';
import { useDashboardFilters } from '../hooks/useDashboardFilters';
import { useDevice } from '../hooks/useDevice';
import { downloadReactiveQuadrantsCsv, getReactiveQuadrants } from '../api/analytics';
import type { ReactiveQuadrantPoint, ReactiveQuadrantsResult } from '../api/types';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { TabPills } from '../components/ui/TabPills';
import { saveBlob } from '../utils/downloadCsv';
import { formatLocalDateTime, formatPercent, formatVariableValue } from '../utils/format';

// Cuatro matices bien diferenciados (accesibles en daltónicos): uno por
// cuadrante, en vez de pares ámbar/verde casi iguales que no se distinguían.
const Q1_COLOR = '#f59e0b';
const Q2_COLOR = '#06b6d4';
const Q3_COLOR = '#10b981';
const Q4_COLOR = '#8b5cf6';

/**
 * Los cuatro cuadrantes (IEC 60375) con su lectura física en la acometida.
 *
 * La etiqueta corta y el color definen cómo se pinta el resto de la página; el
 * nombre del campo llega del backend (`q1_kvarh`…). Q1/Q2 importan reactiva de
 * la red; Q3/Q4 la devuelven; inductivo/capacitivo es el signo de la reactiva.
 */
const CUADRANTES: {
  key: 'q1_kvarh' | 'q2_kvarh' | 'q3_kvarh' | 'q4_kvarh';
  id: string;
  etiqueta: string;
  descripcion: string;
  color: string;
}[] = [
  {
    key: 'q1_kvarh',
    id: 'q1',
    etiqueta: 'Q1 · Importada inductiva',
    descripcion: 'Reactiva absorbida de la red con factor inductivo',
    color: Q1_COLOR,
  },
  {
    key: 'q2_kvarh',
    id: 'q2',
    etiqueta: 'Q2 · Importada capacitiva',
    descripcion: 'Reactiva absorbida de la red con factor capacitivo',
    color: Q2_COLOR,
  },
  {
    key: 'q3_kvarh',
    id: 'q3',
    etiqueta: 'Q3 · Exportada capacitiva',
    descripcion: 'Reactiva devuelta a la red con factor capacitivo',
    color: Q3_COLOR,
  },
  {
    key: 'q4_kvarh',
    id: 'q4',
    etiqueta: 'Q4 · Exportada inductiva',
    descripcion: 'Reactiva devuelta a la red con factor inductivo',
    color: Q4_COLOR,
  },
];

const DOMINANTE_LABEL: Record<string, string> = Object.fromEntries(
  CUADRANTES.map((c) => [c.id, c.etiqueta]),
);

/**
 * El rango del EXPORTE (24h ó 7d) — independiente del DateRangePicker de la
 * página y deliberadamente sin 30 días: el CSV baja todos los puntos reales
 * (1 Hz), y una semana son ~2.4 millones de filas; un mes sería un archivo
 * enorme con poco que aportar.
 */
const EXPORT_RANGE_OPTIONS = [
  { key: '24h', label: 'Últimas 24h' },
  { key: '7d', label: 'Últimos 7 días' },
] as const;
type ExportRangeKey = (typeof EXPORT_RANGE_OPTIONS)[number]['key'];

const EXPORT_HOURS: Record<ExportRangeKey, number> = { '24h': 24, '7d': 24 * 7 };

/** Fecha con la que se nombran los archivos, en hora Bogotá. */
function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function totalDe(punto: ReactiveQuadrantPoint): number {
  return punto.q1_kvarh + punto.q2_kvarh + punto.q3_kvarh + punto.q4_kvarh;
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (detail) return detail;
  }
  return fallback;
}

/** Ancho de ventana de la tendencia, inferido del intervalo real de los puntos. */
function ventanaLabel(puntos: ReactiveQuadrantPoint[]): string {
  if (puntos.length < 2) return '';
  const primerPunto = puntos[0]!;
  const segundoPunto = puntos[1]!;
  const ms = new Date(segundoPunto.time).getTime() - new Date(primerPunto.time).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const hours = ms / 3_600_000;
  if (hours <= 1.5) return '1 hora';
  if (hours <= 4) return '3 horas';
  if (hours <= 8) return '6 horas';
  return '1 día';
}

/** Número corto para el eje Y (2.4k, 123, 0.5) — en cuadrantes de kvarh vive bien sin "+00". */
function formatKvarhAxis(value: number): string {
  if (value >= 10_000) return `${(value / 1000).toFixed(0)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 10) return value.toFixed(0);
  return value.toFixed(1);
}

/** Tooltip de una ventana: cuánto total, y el desglose por cuadrante con lecturas. */
function tooltipDe(punto: ReactiveQuadrantPoint): string {
  const partes = CUADRANTES.filter((c) => punto[c.key] > 0).map(
    (c) => `${c.etiqueta}: ${formatVariableValue('kvarh', punto[c.key])}`,
  );
  return [formatLocalDateTime(punto.time, 'd MMM yyyy, HH:mm'), ...partes].join('\n');
}

function ReactivaContent() {
  const { fromIso, toIso, setRange } = useDashboardFilters();
  const { selectedDeviceId } = useDevice();
  const [response, setResponse] = useState<ReactiveQuadrantsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportRangeKey, setExportRangeKey] = useState<ExportRangeKey>('24h');
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await getReactiveQuadrants({
          from: fromIso,
          to: toIso,
          device_id: selectedDeviceId ?? undefined,
        });
        if (!cancelled) setResponse(data);
      } catch (err) {
        if (!cancelled)
          setError(extractErrorMessage(err, 'No se pudo cargar la energía reactiva.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [fromIso, toIso, selectedDeviceId]);

  const exportCsv = async () => {
    if (exportingCsv) return;
    setExportingCsv(true);
    setExportError(null);
    const now = new Date().toISOString();
    const from = new Date(Date.now() - EXPORT_HOURS[exportRangeKey] * 3_600_000).toISOString();
    try {
      // El navegador recibe el stream de puntos crudos como Blob (sin JSON
      // gigante en memoria) y lo descarga directo a disco.
      const blob = await downloadReactiveQuadrantsCsv({
        from,
        to: now,
        device_id: selectedDeviceId ?? undefined,
      });
      saveBlob(blob, `reactiva_${exportRangeKey}_${hoyBogota()}.csv`);
    } catch (err) {
      setExportError(extractErrorMessage(err, 'No se pudo exportar el CSV.'));
    } finally {
      setExportingCsv(false);
    }
  };

  const exportPdf = async () => {
    if (!response || exportingPdf) return;
    setExportingPdf(true);
    setExportError(null);
    try {
      // Informe vectorial programático; el `response` de la página ya tiene
      // todo lo que dibuja el PDF — no hay consulta extra.
      const { buildReactiveQuadrantsPdf } = await import('../utils/reactiveQuadrantsPdf');
      await buildReactiveQuadrantsPdf(response);
    } catch (err) {
      setExportError(extractErrorMessage(err, 'No se pudo exportar el PDF.'));
    } finally {
      setExportingPdf(false);
    }
  };

  const total = response
    ? response.q1_kvarh + response.q2_kvarh + response.q3_kvarh + response.q4_kvarh
    : 0;

  const maxBucket = useMemo(
    () => (response ? Math.max(0, ...response.trend.map(totalDe)) : 0),
    [response],
  );

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-500/10 text-accent-600 dark:text-accent-400">
            <Activity className="h-[18px] w-[18px]" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-900 dark:text-white">
              Energía reactiva
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              kvarh por cuadrante — Q1/Q2 importada, Q3/Q4 exportada
            </p>
          </div>
        </div>
        <DateRangePicker fromIso={fromIso} toIso={toIso} onChange={setRange} />
      </Card>

      {!loading && !error && response && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-900/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-800/50">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Datos a exportar
            </span>
            <TabPills
              options={[...EXPORT_RANGE_OPTIONS]}
              value={exportRangeKey}
              onChange={setExportRangeKey}
              layoutId="reactiva-export-range"
              size="sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void exportCsv()}
              disabled={exportingCsv}
              className="flex items-center gap-1.5 rounded-lg border border-slate-900/10 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 disabled:opacity-60 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {exportingCsv ? 'Exportando…' : 'Exportar CSV'}
            </button>
            <button
              onClick={() => void exportPdf()}
              disabled={exportingPdf}
              className="flex items-center gap-1.5 rounded-lg border border-slate-900/10 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 disabled:opacity-60 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <Download className="h-3.5 w-3.5" />
              {exportingPdf ? 'Exportando…' : 'Exportar PDF'}
            </button>
          </div>
        </div>
      )}

      {exportError && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {exportError}
        </p>
      )}

      {loading && <Skeleton className="h-[320px] w-full" />}
      {!loading && error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && !error && response && total === 0 && (
        <EmptyState
          icon={Activity}
          title="Sin energía reactiva"
          description="El medidor no reportó reactiva en este rango. Verificá que los cuadrantes Q1..Q4 estén declarados en el CRM y con lecturas."
        />
      )}

      {!loading && !error && response && total > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="flex flex-col justify-between">
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Reactiva importada
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {formatVariableValue('kvarh', response.total_import_kvarh)}
              </p>
              <p className="text-xs text-slate-400">
                {formatPercent(response.total_import_kvarh / total)} del total
              </p>
            </Card>
            <Card className="flex flex-col justify-between">
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Reactiva exportada
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {formatVariableValue('kvarh', response.total_export_kvarh)}
              </p>
              <p className="text-xs text-slate-400">
                {formatPercent(response.total_export_kvarh / total)} del total
              </p>
            </Card>
            <Card className="flex flex-col justify-between">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Balance (importada menos exportada)
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                {`${response.balance_kvarh >= 0 ? '+' : ''}${formatVariableValue('kvarh', response.balance_kvarh)}`}
              </p>
              <p className="text-xs text-slate-400">
                {response.balance_kvarh >= 0
                  ? 'La red le entrega reactiva al cliente'
                  : 'El cliente devuelve reactiva a la red'}
              </p>
            </Card>
          </div>

          {response.dominant && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <BadgeCheck className="h-4 w-4" />
              Cuadrante dominante: {DOMINANTE_LABEL[response.dominant] ?? response.dominant} (
              {formatVariableValue('kvarh', response.dominant_kvarh)})
            </div>
          )}

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
              Cuadrantes
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {CUADRANTES.map((c) => {
                const value = response[c.key];
                const share = total > 0 ? value / total : 0;
                const dominante = response.dominant === c.id;
                return (
                  <Card key={c.id} className={dominante ? 'ring-2 ring-emerald-500/40' : undefined}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {c.etiqueta}
                      </p>
                      {dominante && (
                        <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Dominante
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                      {formatVariableValue('kvarh', value)}
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-900/5 dark:bg-white/5">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${share * 100}%`, backgroundColor: c.color }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatPercent(share)} del total · {c.descripcion}
                    </p>
                  </Card>
                );
              })}
            </div>
          </div>

          {response.trend.length > 0 && (
            <TendenciaPorVentana puntos={response.trend} maxBucket={maxBucket} />
          )}
        </>
      )}
    </div>
  );
}

const TENDENCIA_TICKS = [0, 0.25, 0.5, 0.75, 1];

/**
 * La tendencia por ventana: cuánta reactiva cayó en cada ventana y en cuál
 * cuadrante. Cada barra apilada es el total kvarh de su ventana partido en
 * Q1–Q4; el eje Y y el valor sobre la barra la hacen legible sin depender del
 * hover, y el tooltip da el desglose exacto por cuadrante.
 */
function TendenciaPorVentana({
  puntos,
  maxBucket,
}: {
  puntos: ReactiveQuadrantPoint[];
  maxBucket: number;
}) {
  const xStride = Math.ceil(puntos.length / 8);
  const ventanas = ventanaLabel(puntos);
  const mostrarValor = puntos.length <= 24;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Tendencia por ventana
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Reactiva acumulada por ventana{ventanas ? ` de ${ventanas}` : ''} — cada barra es el
            total de su ventana partido en los cuatro cuadrantes; pase el cursor para el detalle.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {CUADRANTES.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
              {c.etiqueta}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5">
        <div className="relative z-10 h-[170px] w-10 shrink-0 sm:w-11">
          {TENDENCIA_TICKS.map((f) => (
            <span
              key={f}
              className="absolute right-0 top-0 -translate-y-1/2 text-[9px] tabular-nums text-slate-400 dark:text-slate-500"
              style={{ top: `${(1 - f) * 100}%` }}
            >
              {formatKvarhAxis(maxBucket * f)}
            </span>
          ))}
        </div>

        {/* Con rangos largos (30 días → ~120 ventanas) las barras en flex-1
            quedan de ~2px en celular: se les da un ancho mínimo y el bloque
            desliza horizontalmente, con el eje Y fijo a la izquierda. */}
        <div className="relative h-[170px] flex-1 overflow-x-auto">
          <div
            className="absolute inset-0 flex items-end gap-0.5 sm:gap-1"
            style={{ minWidth: `${Math.max(puntos.length * 20, 100)}px` }}
          >
            {TENDENCIA_TICKS.map((f) => (
              <div
                key={f}
                className="absolute left-0 right-0 border-t border-slate-900/5 dark:border-white/5"
                style={{ top: `${(1 - f) * 100}%` }}
              />
            ))}
            {puntos.map((punto, i) => {
              const bucketTotal = totalDe(punto);
              const showEtiqueta = i % xStride === 0 || i === puntos.length - 1;
              return (
                <div key={punto.time} className="flex h-full flex-1 flex-col">
                  {mostrarValor && bucketTotal > 0 && (
                    <span className="pb-0.5 text-center text-[9px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                      {bucketTotal.toFixed(2)}
                    </span>
                  )}
                  <div className="flex flex-1 items-end justify-center">
                    <div
                      className="flex w-full max-w-7 flex-col-reverse overflow-hidden rounded-t sm:max-w-9"
                      style={{
                        height: maxBucket > 0 ? `${(bucketTotal / maxBucket) * 100}%` : '0%',
                      }}
                      title={tooltipDe(punto)}
                    >
                      {CUADRANTES.map((c) => {
                        const value = punto[c.key];
                        if (value <= 0) return null;
                        return (
                          <div
                            key={c.id}
                            style={{
                              height: `${(value / bucketTotal) * 100}%`,
                              backgroundColor: c.color,
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <span className="mt-1 whitespace-nowrap text-center text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                    {showEtiqueta ? formatLocalDateTime(punto.time, 'd MMM, HH:mm') : '\u00A0'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Reactiva() {
  return (
    <DashboardFiltersProvider>
      <ReactivaContent />
    </DashboardFiltersProvider>
  );
}
