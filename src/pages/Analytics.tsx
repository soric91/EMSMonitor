import { useEffect, useState } from 'react';
import { BarChart3, Battery, Gauge, TrendingUp } from 'lucide-react';
import {
  compare,
  getAnalyticsOverview,
  getDailyProfile,
  getMonthlyProfile,
} from '../api/analytics';
import { getCostsRange } from '../api/costs';
import type {
  AnalyticsOverview,
  CompareResult,
  CostBreakdown,
  HourProfilePoint,
  WeekdayProfilePoint,
} from '../api/types';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { Badge } from '../components/ui/Badge';
import { DateRangePicker } from '../components/ui/DateRangePicker';
import { AreaChartWidget } from '../components/charts/AreaChartWidget';
import { ComparisonBarChart } from '../components/charts/ComparisonBarChart';
import { CostBreakdownSummary } from '../components/dashboard/CostBreakdownSummary';
import { AnalyticsSummary } from '../components/dashboard/AnalyticsSummary';
import { formatCop, formatKwh, formatLocalDateTime, formatPercent, formatWatts } from '../utils/format';
import { hoursAgoLocalInput, localInputToUtcIso, nowLocalInput } from '../utils/timezone';

const NOT_APPLICABLE = 'No aplica — exportando';

export default function Analytics() {
  const [fromIso, setFromIso] = useState(() => localInputToUtcIso(hoursAgoLocalInput(24)));
  const [toIso, setToIso] = useState(() => localInputToUtcIso(nowLocalInput()));

  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
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
      const params = { from: fromIso, to: toIso };
      // Costos aparte: si /costs/range falla, el resto de analytics no se afecta.
      getCostsRange({ from: fromIso, to: toIso })
        .then((data) => {
          if (!cancelled) setRangeCosts(data);
        })
        .catch(() => {});
      try {
        const [o, daily, weekly] = await Promise.all([
          getAnalyticsOverview(params),
          getDailyProfile(params),
          getMonthlyProfile(params),
        ]);
        if (!cancelled) {
          setOverview(o);
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
  }, [fromIso, toIso]);

  return (
    <div className="space-y-6">
      <AnalyticsSummary />

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Rango de análisis</p>
        <DateRangePicker fromIso={fromIso} toIso={toIso} onChange={(f, t) => { setFromIso(f); setToIso(t); }} />
      </Card>

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

      {!loading && error && <Card className="text-sm text-red-500">No se pudo cargar analytics.</Card>}

      {!loading && !error && overview && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Importado</p>
              <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
                {formatKwh(overview.consumption_kwh)}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Exportado</p>
              <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
                {formatKwh(overview.export_kwh)}
              </p>
            </Card>
            <Card>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <TrendingUp className="h-3.5 w-3.5" /> Demanda máxima
              </div>
              {overview.max_demand.peak_power_w !== null ? (
                <>
                  <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
                    {formatWatts(overview.max_demand.peak_power_w)}
                  </p>
                  {overview.max_demand.peak_at && (
                    <p className="text-xs text-slate-400">{formatLocalDateTime(overview.max_demand.peak_at)}</p>
                  )}
                </>
              ) : (
                <p className="mt-1.5 text-sm text-slate-400">{NOT_APPLICABLE}</p>
              )}
            </Card>
            <Card>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Gauge className="h-3.5 w-3.5" /> Factor de carga
              </div>
              {overview.load_factor.load_factor !== null ? (
                <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
                  {formatPercent(overview.load_factor.load_factor)}
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-slate-400">{NOT_APPLICABLE}</p>
              )}
            </Card>
            <Card>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <Battery className="h-3.5 w-3.5" /> Carga base
              </div>
              {overview.base_load.base_load_w !== null ? (
                <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
                  {formatWatts(overview.base_load.base_load_w)}
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-slate-400">{NOT_APPLICABLE}</p>
              )}
            </Card>
          </div>

          {rangeCosts && <CostBreakdownSummary costs={rangeCosts} />}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <p className="mb-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                Perfil horario típico
              </p>
              {dailyProfile && dailyProfile.length > 0 ? (
                <AreaChartWidget
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

      <ComparePeriods />
    </div>
  );
}

function ComparePeriods() {
  const [fromA, setFromA] = useState(() => localInputToUtcIso(hoursAgoLocalInput(48)));
  const [toA, setToA] = useState(() => localInputToUtcIso(hoursAgoLocalInput(24)));
  const [fromB, setFromB] = useState(() => localInputToUtcIso(hoursAgoLocalInput(24)));
  const [toB, setToB] = useState(() => localInputToUtcIso(nowLocalInput()));
  const [result, setResult] = useState<CompareResult | null>(null);
  const [costsA, setCostsA] = useState<CostBreakdown | null>(null);
  const [costsB, setCostsB] = useState<CostBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const runCompare = () => {
    setLoading(true);
    setError(false);
    setCostsA(null);
    setCostsB(null);
    // Costos aparte: si /costs/range falla, la comparación de kWh sale igual.
    getCostsRange({ from: fromA, to: toA }).then(setCostsA).catch(() => {});
    getCostsRange({ from: fromB, to: toB }).then(setCostsB).catch(() => {});
    compare({ from_a: fromA, to_a: toA, from_b: fromB, to_b: toB })
      .then(setResult)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  const costDelta = costsA && costsB ? costsB.net_cost_cop - costsA.net_cost_cop : null;

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <BarChart3 className="h-3.5 w-3.5" /> Comparar periodos
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs text-slate-400">Periodo A</p>
          <DateRangePicker fromIso={fromA} toIso={toA} onChange={(f, t) => { setFromA(f); setToA(t); }} />
        </div>
        <div>
          <p className="mb-1.5 text-xs text-slate-400">Periodo B</p>
          <DateRangePicker fromIso={fromB} toIso={toB} onChange={(f, t) => { setFromB(f); setToB(t); }} />
        </div>
      </div>

      <button
        onClick={runCompare}
        disabled={loading}
        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
      >
        {loading ? 'Comparando…' : 'Comparar'}
      </button>

      {error && <p className="text-sm text-red-500">No se pudo comparar los periodos.</p>}

      {result && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-900/5 p-4 dark:border-white/5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Periodo A</p>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              {formatKwh(result.period_a.consumption_kwh)} importado
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {formatKwh(result.period_a.export_kwh)} exportado
            </p>
            {costsA && (
              <p
                className={[
                  'mt-2 text-sm font-medium',
                  costsA.net_cost_cop < 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-700 dark:text-slate-200',
                ].join(' ')}
              >
                {formatCop(Math.abs(costsA.net_cost_cop))}
                {costsA.net_cost_cop < 0 ? ' a tu favor' : ' costo neto'}
              </p>
            )}
          </div>
          <div className="rounded-xl border border-slate-900/5 p-4 dark:border-white/5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Periodo B</p>
              {result.consumption_delta_pct !== null && (
                <Badge tone={result.consumption_delta_pct >= 0 ? 'amber' : 'emerald'}>
                  {result.consumption_delta_pct >= 0 ? '+' : ''}
                  {result.consumption_delta_pct.toFixed(1)}% importación
                </Badge>
              )}
            </div>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              {formatKwh(result.period_b.consumption_kwh)} importado
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {formatKwh(result.period_b.export_kwh)} exportado
              {result.export_delta_pct !== null && (
                <span className="ml-1">
                  ({result.export_delta_pct >= 0 ? '+' : ''}
                  {result.export_delta_pct.toFixed(1)}%)
                </span>
              )}
            </p>
            {costsB && (
              <p
                className={[
                  'mt-2 text-sm font-medium',
                  costsB.net_cost_cop < 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-700 dark:text-slate-200',
                ].join(' ')}
              >
                {formatCop(Math.abs(costsB.net_cost_cop))}
                {costsB.net_cost_cop < 0 ? ' a tu favor' : ' costo neto'}
                {costDelta !== null && (
                  <span
                    className={[
                      'ml-1.5 text-xs',
                      costDelta <= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400',
                    ].join(' ')}
                  >
                    ({costDelta >= 0 ? '+' : '−'}
                    {formatCop(Math.abs(costDelta))} vs. A)
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
