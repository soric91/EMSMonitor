import { useEffect, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { compare } from '../../api/analytics';
import type { CompareResult } from '../../api/types';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatKwh } from '../../utils/format';

interface PeriodComparisonCardProps {
  label: string;
  days: number;
}

export function PeriodComparisonCard({ label, days }: PeriodComparisonCardProps) {
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(false);
      const now = Date.now();
      const dayMs = 86_400_000;
      const params = {
        from_a: new Date(now - 2 * days * dayMs).toISOString(),
        to_a: new Date(now - days * dayMs).toISOString(),
        from_b: new Date(now - days * dayMs).toISOString(),
        to_b: new Date(now).toISOString(),
      };
      try {
        const data = await compare(params);
        if (!cancelled) setResult(data);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (error) {
    return <Card className="text-sm text-red-500">No se pudo cargar {label.toLowerCase()}.</Card>;
  }

  if (!result) {
    return (
      <Card>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-8 w-24" />
      </Card>
    );
  }

  const delta = result.consumption_delta_pct;
  const improved = delta !== null && delta <= 0;

  return (
    <Card>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="text-2xl font-semibold text-slate-900 dark:text-white">
          {formatKwh(result.period_b.consumption_kwh)}
        </p>
        {delta !== null && (
          <span
            className={[
              'flex items-center gap-1 text-xs font-medium',
              improved ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
            ].join(' ')}
          >
            {improved ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-400">
        vs. {formatKwh(result.period_a.consumption_kwh)} periodo anterior · importado
      </p>
    </Card>
  );
}
