import { EnergyFlowHero } from '../components/dashboard/EnergyFlowHero';
import { LiveVariableChart } from '../components/dashboard/LiveVariableChart';
import { PeriodComparisonCard } from '../components/dashboard/PeriodComparisonCard';
import { ConnectivityStatus } from '../components/dashboard/ConnectivityStatus';
import { CostoDelPeriodo } from '../components/dashboard/CostoDelPeriodo';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <EnergyFlowHero />
      <LiveVariableChart />
      {/* Cuatro recuadros en dos filas: cada período con su importado y su
          exportado al mismo tamaño. Cada componente pinta los dos suyos con
          una sola petición. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CostoDelPeriodo periodo="hoy" period="day" />
        <CostoDelPeriodo periodo="del mes" period="month" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PeriodComparisonCard label="Últimos 7 días" days={7} />
        <PeriodComparisonCard label="Últimos 30 días" days={30} />
        <ConnectivityStatus />
      </div>
    </div>
  );
}
