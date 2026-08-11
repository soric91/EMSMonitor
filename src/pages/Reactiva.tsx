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

const IMPORT_COLOR = '#f59e0b';
const IMPORT_SOFT_COLOR = '#fbbf24';
const EXPORT_SOFT_COLOR = '#34d399';
const EXPORT_COLOR = '#10b981';

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
    color: IMPORT_COLOR,
  },
  {
    key: 'q2_kvarh',
    id: 'q2',
    etiqueta: 'Q2 · Importada capacitiva',
    descripcion: 'Reactiva absorbida de la red con factor capacitivo',
    color: IMPORT_SOFT_COLOR,
  },
  {
    key: 'q3_kvarh',
    id: 'q3',
    etiqueta: 'Q3 · Exportada capacitiva',
    descripcion: 'Reactiva devuelta a la red con factor capacitivo',
    color: EXPORT_SOFT_COLOR,
  },
  {
    key: 'q4_kvarh',
    id: 'q4',
    etiqueta: 'Q4 · Exportada inductiva',
    descripcion: 'Reactiva devuelta a la red con factor inductivo',
    color: EXPORT_COLOR,
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
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
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
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Tendencia por ventana
                </p>
                <div className="flex flex-wrap gap-3">
                  {CUADRANTES.map((c) => (
                    <span
                      key={c.id}
                      className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.etiqueta}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-end gap-1">
                {response.trend.map((punto) => {
                  const bucketTotal = totalDe(punto);
                  return (
                    <div key={punto.time} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex w-full items-end justify-center" style={{ height: 160 }}>
                        <div
                          className="flex w-full max-w-8 flex-col-reverse overflow-hidden rounded-t"
                          style={{
                            height: maxBucket > 0 ? `${(bucketTotal / maxBucket) * 100}%` : '0%',
                          }}
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
                                title={`${c.etiqueta}: ${formatVariableValue('kvarh', value)}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                      <span className="whitespace-nowrap text-[10px] text-slate-400 dark:text-slate-500">
                        {formatLocalDateTime(punto.time, 'd MMM, HH:mm')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function Reactiva() {
  return (
    <DashboardFiltersProvider>
      <ReactivaContent />
    </DashboardFiltersProvider>
  );
}
