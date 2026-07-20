import { EnergyFlowHero } from '../components/dashboard/EnergyFlowHero';
import { LiveVariableChart } from '../components/dashboard/LiveVariableChart';
import { PeriodComparisonCard } from '../components/dashboard/PeriodComparisonCard';
import { ConnectivityStatus } from '../components/dashboard/ConnectivityStatus';
import { CostCard } from '../components/dashboard/CostCard';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <EnergyFlowHero />
      <LiveVariableChart />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CostCard label="Costo de hoy" period="day" />
        <CostCard label="Costo del mes" period="month" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PeriodComparisonCard label="Últimos 7 días" days={7} />
        <PeriodComparisonCard label="Últimos 30 días" days={30} />
        <ConnectivityStatus />
      </div>
    </div>
  );
}
