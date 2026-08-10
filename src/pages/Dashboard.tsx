import { useEffect, useState } from 'react';
import { EnergyFlowHero } from '../components/dashboard/EnergyFlowHero';
import { LiveVariableChart } from '../components/dashboard/LiveVariableChart';
import { PeriodComparisonCard } from '../components/dashboard/PeriodComparisonCard';
import { CostoDelPeriodo } from '../components/dashboard/CostoDelPeriodo';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { getDashboardSummary } from '../api/dashboard';
import type { DashboardSummary } from '../api/types';
import { useDevice } from '../hooks/useDevice';

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState(false);
  const { selectedDeviceId } = useDevice();

  useEffect(() => {
    if (!selectedDeviceId) return;
    let cancelled = false;

    async function load() {
      setError(false);
      try {
        const data = await getDashboardSummary({ device_id: selectedDeviceId ?? undefined });
        if (!cancelled) setSummary(data);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedDeviceId]);

  if (error) {
    return <Card className="text-sm text-red-500">No se pudo cargar el resumen del tablero.</Card>;
  }

  // Costo y potencia ya llegaron en el payload consolidado; ningún componente
  // de abajo vuelve a preguntar. Los casos dispersos del 7/30 días no están
  // en ese payload porque la comparación es un caso de uso aparte.
  return (
    <div className="space-y-6">
      <EnergyFlowHero seedWatts={summary?.power_active_total_w ?? null} />
      <LiveVariableChart />
      {summary === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-8 w-32" />
            <Skeleton className="mt-2 h-3 w-20" />
          </Card>
          <Card>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-8 w-32" />
            <Skeleton className="mt-2 h-3 w-20" />
          </Card>
        </div>
      ) : (
        <>
          {/* Cuatro recuadros en dos filas: cada período con su importado y su
              exportado al mismo tamaño. Ambos salen de /dashboard/summary. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CostoDelPeriodo periodo="hoy" costo={summary.costs_day} />
            <CostoDelPeriodo periodo="del mes" costo={summary.costs_month} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PeriodComparisonCard label="Últimos 7 días" days={7} />
            <PeriodComparisonCard label="Últimos 30 días" days={30} />
          </div>
        </>
      )}
    </div>
  );
}
