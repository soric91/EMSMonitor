import { useEffect, useState } from 'react';
import { AlertTriangle, PiggyBank, Wallet } from 'lucide-react';
import { getCosts } from '../../api/costs';
import type { CostBreakdown, Period } from '../../api/types';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatCop } from '../../utils/format';

interface CostCardProps {
  label: string;
  period: Period;
}

function monthLabel(month: string): string {
  // "2026-07" → "jul 2026" (mediodía UTC para esquivar corrimientos de zona)
  return new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00Z`),
  );
}

export function CostCard({ label, period }: CostCardProps) {
  const [cost, setCost] = useState<CostBreakdown | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(false);
      try {
        const data = await getCosts(period);
        if (!cancelled) setCost(data);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [period]);

  if (error) {
    return <Card className="text-sm text-red-500">No se pudo cargar {label.toLowerCase()}.</Card>;
  }

  if (!cost) {
    return (
      <Card>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-8 w-32" />
        <Skeleton className="mt-2 h-3 w-40" />
      </Card>
    );
  }

  // net_cost_cop negativo = el crédito por exportación superó el costo: saldo a favor.
  const inFavor = cost.net_cost_cop < 0;
  const staleMonths = cost.stale_months ?? [];

  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p
          className={[
            'mt-1.5 text-2xl font-semibold',
            inFavor ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white',
          ].join(' ')}
        >
          {formatCop(Math.abs(cost.net_cost_cop))}
          {inFavor && <span className="ml-1.5 text-xs font-medium">a tu favor</span>}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {formatCop(cost.consumption_cost_cop)} importado · {formatCop(cost.export_credit_cop)} crédito
          {cost.cargo_fijo_included
            ? ` · ${formatCop(cost.cargo_fijo_cop)} cargo fijo`
            : ' · no incluye cargo fijo'}
        </p>
        {staleMonths.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Tarifa estimada con datos de {cost.months_used.map(monthLabel).join(', ')} — actualiza la
              tarifa de {staleMonths.map(monthLabel).join(', ')}
            </span>
          </p>
        )}
      </div>
      <div
        className={[
          'rounded-xl p-2',
          inFavor
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        ].join(' ')}
      >
        {inFavor ? <PiggyBank className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}
      </div>
    </Card>
  );
}
