import { useEffect, useState } from 'react';
import { getDailyProfile, getMonthlyProfile } from '../api/analytics';
import { getCostsRange } from '../api/costs';
import { getCustomReport } from '../api/reports';
import { useDevice } from '../hooks/useDevice';
import type {
  CostBreakdown,
  HourProfilePoint,
  ReportData,
  WeekdayProfilePoint,
} from '../api/types';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { MetricsGrid } from '../components/ui/MetricsGrid';
import { AreaChartWidget } from '../components/charts/AreaChartWidget';
import { ComparisonBarChart } from '../components/charts/ComparisonBarChart';
import { CostBreakdownSummary } from '../components/dashboard/CostBreakdownSummary';
import { AnalyticsSummary } from '../components/dashboard/AnalyticsSummary';
import { DataCoverageBadge } from '../components/dashboard/DataCoverageBadge';
import { HeatmapCard } from '../components/dashboard/HeatmapCard';
import { LoadDurationCard } from '../components/dashboard/LoadDurationCard';
import { PhantomLoadCard } from '../components/dashboard/PhantomLoadCard';
import { formatKwh, formatWatts } from '../utils/format';
import { hoursAgoLocalInput, localInputToUtcIso, nowLocalInput } from '../utils/timezone';

export default function Analytics() {
  const { selectedDeviceId } = useDevice();
  const [fromIso, setFromIso] = useState(() => localInputToUtcIso(hoursAgoLocalInput(24)));
  const [toIso, setToIso] = useState(() => localInputToUtcIso(nowLocalInput()));

  const [report, setReport] = useState<ReportData | null>(null);
  const [dailyProfile, setDailyProfile] = useState<HourProfilePoint[] | null>(null);
  const [weeklyProfile, setWeeklyProfile] = useState<WeekdayProfilePoint[] | null>(null);
  const [rangeCosts, setRangeCosts] = useState<CostBreakdown | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(false);
      setRangeCosts(null);
      const params = { from: fromIso, to: toIso, device_id: selectedDeviceId ?? undefined };
      // Costos aparte: si /costs/range falla, el resto de la sección no se afecta.
      getCostsRange(params)
        .then((data) => {
          if (!cancelled) setRangeCosts(data);
        })
        .catch(() => {});
      try {
        const [r, daily, weekly] = await Promise.all([
          getCustomReport(params),
          getDailyProfile(params),
          getMonthlyProfile(params),
        ]);
        if (!cancelled) {
          setReport(r);
          setDailyProfile(daily);
          setWeeklyProfile(weekly);
        }
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
  }, [fromIso, toIso, selectedDeviceId]);

  return (
    <div className="space-y-6">
      <AnalyticsSummary />

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Rango de análisis
          </p>
          <DataCoverageBadge fromIso={fromIso} toIso={toIso} />
        </div>
        <DateRangePicker
          fromIso={fromIso}
          toIso={toIso}
          onChange={(f, t) => {
            setFromIso(f);
            setToIso(t);
          }}
        />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PhantomLoadCard fromIso={fromIso} toIso={toIso} />
        <LoadDurationCard fromIso={fromIso} toIso={toIso} />
      </div>

      <HeatmapCard fromIso={fromIso} toIso={toIso} />

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-3 h-7 w-24" />
            </Card>
          ))}
        </div>
      )}

      {!loading && error && (
        <Card className="text-sm text-red-500">No se pudieron cargar los datos de análisis.</Card>
      )}

      {!loading && !error && report && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Importado</p>
              <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
                {formatKwh(report.consumption_kwh)}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Exportado</p>
              <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
                {formatKwh(report.export_kwh)}
              </p>
            </Card>
          </div>

          <MetricsGrid
            max_demand={report.max_demand}
            load_factor={report.load_factor}
            base_load={report.base_load}
          />

          {rangeCosts && <CostBreakdownSummary costs={rangeCosts} />}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <p className="mb-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                Perfil horario típico
              </p>
              {dailyProfile && dailyProfile.length > 0 ? (
                <AreaChartWidget
                  // hour ya viene en hora Bogotá desde el backend (fix 2026-07-19)
                  data={dailyProfile.map((p) => ({ time: p.hour, value: p.power_avg_w }))}
                  color="#3b82f6"
                  valueFormatter={(v) => formatWatts(v)}
                  timeFormatter={(h) => `${h}:00`}
                />
              ) : (
                <p className="text-sm text-slate-400">Sin datos suficientes.</p>
              )}
            </Card>
            <Card>
              <p className="mb-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                Perfil semanal (importación vs. exportación)
              </p>
              {weeklyProfile && weeklyProfile.length > 0 ? (
                <ComparisonBarChart
                  data={weeklyProfile.map((p) => ({
                    label: p.weekday_name.slice(0, 3),
                    a: p.consumption_avg_kwh,
                    b: p.export_avg_kwh,
                  }))}
                  labelA="Importado"
                  labelB="Exportado"
                  valueFormatter={(v) => formatKwh(v)}
                />
              ) : (
                <p className="text-sm text-slate-400">Sin datos suficientes.</p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
