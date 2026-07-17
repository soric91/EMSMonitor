import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Wallet } from 'lucide-react';
import type { CostBreakdown } from '../../api/types';
import { Card } from '../ui/Card';
import { formatCop } from '../../utils/format';

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00Z`),
  );
}

/** Desglose de costos ya calculado (viene embebido en reportes o de /costs/*). */
export function CostBreakdownSummary({ costs }: { costs: CostBreakdown }) {
  const inFavor = costs.net_cost_cop < 0;
  const staleMonths = costs.stale_months ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Costo importado</p>
            <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
              {formatCop(costs.consumption_cost_cop)}
            </p>
          </div>
          <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
            <ArrowDownToLine className="h-5 w-5" />
          </div>
        </Card>
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Crédito exportado</p>
            <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
              {formatCop(costs.export_credit_cop)}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
            <ArrowUpFromLine className="h-5 w-5" />
          </div>
        </Card>
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Costo neto</p>
            <p
              className={[
                'mt-1.5 text-xl font-semibold',
                inFavor ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white',
              ].join(' ')}
            >
              {formatCop(Math.abs(costs.net_cost_cop))}
              {inFavor && <span className="ml-1.5 text-xs font-medium">a tu favor</span>}
            </p>
            <p className="text-xs text-slate-400">
              {costs.cargo_fijo_included
                ? `incluye ${formatCop(costs.cargo_fijo_cop)} de cargo fijo`
                : 'no incluye cargo fijo'}
            </p>
          </div>
          <div
            className={[
              'rounded-xl p-2',
              inFavor
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            ].join(' ')}
          >
            <Wallet className="h-5 w-5" />
          </div>
        </Card>
      </div>

      {staleMonths.length > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Tarifa estimada con datos de {costs.months_used.map(monthLabel).join(', ')} — actualiza la
            tarifa de {staleMonths.map(monthLabel).join(', ')}
          </span>
        </p>
      )}
    </div>
  );
}
