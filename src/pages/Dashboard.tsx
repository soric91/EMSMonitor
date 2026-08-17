import { useEffect, useState } from 'react';
import { AlertTriangle, PiggyBank, Wallet } from 'lucide-react';
import { EnergyFlowHero } from '../components/dashboard/EnergyFlowHero';
import { LiveVariableChart } from '../components/dashboard/LiveVariableChart';
import { PeriodComparisonCard } from '../components/dashboard/PeriodComparisonCard';
import { KpiCard } from '../components/dashboard/KpiCard';
import { BillProjectionCard } from '../components/dashboard/BillProjectionCard';
import { PowerForecastCard } from '../components/dashboard/PowerForecastCard';
import { DeviceStatus } from '../components/dashboard/DeviceStatus';
import { AlarmPanel } from '../components/dashboard/AlarmPanel';
import { Card } from '../components/ui/Card';
import { getDashboardSummary } from '../api/dashboard';
import type { CostBreakdown, DashboardSummary } from '../api/types';
import { useDevice } from '../hooks/useDevice';
import { useEnergiaDiaria } from '../hooks/useEnergiaDiaria';
import { formatCop, formatKwh } from '../utils/format';
import { monthLabel } from '../utils/labels';

// Cascada en la primera carga: el resumen consolidado (que incluye el cálculo
// de lo importado/exportado y cuesta ~20 consultas a InfluxDB) se pide unos
// instantes después del arranque. Así el gráfico en vivo (variables + WS +
// backfill) consigue las primeras consultas sin competir por el mismo backend,
// y los recuadros de importado/exportado aparecen después, ya listos.
const RESUMEN_CASCADA_MS = 1500;

/** La advertencia de tarifa vencida, si el período se estimó con un mes viejo. */
function TarifaAviso({ cost }: { cost?: CostBreakdown | null }) {
  if (!cost || cost.stale_months.length === 0) return null;
  return (
    <span className="flex items-start gap-1 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        Tarifa estimada con {cost.months_used.map((m) => monthLabel(m)).join(', ')} — actualiza la
        tarifa de {cost.stale_months.map((m) => monthLabel(m)).join(', ')}
      </span>
    </span>
  );
}

function TituloSeccion({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
      {children}
    </h2>
  );
}

/** Cuántos días de historia llevan las miniseries de los KPIs. */
const DIAS_SPARKLINE = 14;

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState(false);
  const { selectedDeviceId } = useDevice();
  // Después del resumen, no a la par: las miniseries son accesorias y no deben
  // competir con la carga que sí bloquea la pantalla (ver RESUMEN_CASCADA_MS).
  const energiaDiaria = useEnergiaDiaria(DIAS_SPARKLINE, summary !== null);

  useEffect(() => {
    if (!selectedDeviceId) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      setError(false);
      try {
        const data = await getDashboardSummary({ device_id: selectedDeviceId ?? undefined });
        if (!cancelled) setSummary(data);
      } catch {
        if (!cancelled) setError(true);
      }
    }, RESUMEN_CASCADA_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedDeviceId]);

  if (error) {
    return <Card className="text-sm text-red-500">No se pudo cargar el resumen del tablero.</Card>;
  }

  const netoHoy = summary?.costs_day.net_cost_cop ?? 0;
  const netoMes = summary?.costs_month.net_cost_cop ?? 0;
  const aFavorHoy = netoHoy < 0;
  const aFavorMes = netoMes < 0;

  return (
    <div className="space-y-8">
      {/* RESUMEN: el balance en vivo (hero) + los KPIs del período */}
      <section aria-label="Resumen" className="space-y-4">
        <EnergyFlowHero seedWatts={summary?.power_active_total_w ?? null} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Consumido hoy"
            value={summary ? formatKwh(summary.consumption_today_kwh) : undefined}
            timestamp={summary?.last_update ?? null}
            tone="import"
            icon={<Wallet className="h-5 w-5" />}
            loading={summary === null}
            sparkline={energiaDiaria.importado}
          />
          <KpiCard
            label="Exportado hoy"
            value={summary ? formatKwh(summary.export_today_kwh) : undefined}
            timestamp={summary?.last_update ?? null}
            tone="export"
            icon={<PiggyBank className="h-5 w-5" />}
            loading={summary === null}
            sparkline={energiaDiaria.exportado}
          />
          <KpiCard
            label="Neto hoy"
            value={summary ? formatCop(Math.abs(netoHoy)) : undefined}
            timestamp={summary?.last_update ?? null}
            tone={aFavorHoy ? 'export' : 'import'}
            icon={<Wallet className="h-5 w-5" />}
            loading={summary === null}
            footer={
              summary && (
                <>
                  <span>{aFavorHoy ? 'Saldo a tu favor' : 'A pagar del día'}</span>
                  <TarifaAviso cost={summary.costs_day} />
                </>
              )
            }
          />
          <KpiCard
            label="Consumido mes"
            value={summary ? formatKwh(summary.consumption_month_kwh) : undefined}
            timestamp={summary?.last_update ?? null}
            tone="import"
            icon={<Wallet className="h-5 w-5" />}
            loading={summary === null}
          />
          <KpiCard
            label="Exportado mes"
            value={summary ? formatKwh(summary.export_month_kwh) : undefined}
            timestamp={summary?.last_update ?? null}
            tone="export"
            icon={<PiggyBank className="h-5 w-5" />}
            loading={summary === null}
          />
          <KpiCard
            label="Neto mes"
            value={summary ? formatCop(Math.abs(netoMes)) : undefined}
            timestamp={summary?.last_update ?? null}
            tone={aFavorMes ? 'export' : 'import'}
            icon={<Wallet className="h-5 w-5" />}
            loading={summary === null}
            footer={
              summary && (
                <>
                  <span>{aFavorMes ? 'Saldo a tu favor' : 'A pagar del mes'}</span>
                  <TarifaAviso cost={summary.costs_month} />
                </>
              )
            }
          />
        </div>
      </section>

      {/* PROYECCIÓN: en cuánto termina el mes al ritmo actual */}
      <section aria-label="Proyección" className="space-y-4">
        <TituloSeccion>Proyección</TituloSeccion>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BillProjectionCard costoMesActualCop={summary?.costs_month.net_cost_cop ?? null} />
          <PowerForecastCard />
        </div>
      </section>

      {/* GRÁFICA EN VIVO */}
      <section aria-label="Gráfica en vivo" className="space-y-4">
        <TituloSeccion>Gráfica en vivo</TituloSeccion>
        <LiveVariableChart />
      </section>

      {/* OPERACIÓN: dispositivos y alarmas */}
      <section aria-label="Operación" className="space-y-4">
        <TituloSeccion>Operación</TituloSeccion>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DeviceStatus />
          <AlarmPanel />
        </div>
      </section>

      {/* ANÁLISIS: comparación de períodos */}
      <section aria-label="Análisis" className="space-y-4">
        <TituloSeccion>Análisis</TituloSeccion>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PeriodComparisonCard label="Últimos 7 días" days={7} />
          <PeriodComparisonCard label="Últimos 30 días" days={30} />
        </div>
      </section>
    </div>
  );
}
