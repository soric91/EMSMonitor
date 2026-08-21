import { Card } from './Card';
import { Skeleton } from './Skeleton';

type Tone = 'neutral' | 'import' | 'export';

const TONE_ICON_BG: Record<Tone, string> = {
  neutral: 'bg-slate-500/10 text-slate-500 dark:text-slate-400',
  import: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  export: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

interface StatCardProps {
  label: string;
  icon?: React.ReactNode;
  /** Si no se pasa, se muestra el esqueleto de carga. */
  value?: React.ReactNode;
  tone?: Tone;
  footer?: React.ReactNode;
  className?: string;
}

/**
 * La tarjeta "label + valor" que estaba copiada en AnalyticsSummary, Reports,
 * las tarjetas de balance y el grid de demanda. Una sola pieza: el label arriba, el
 * valor dominante, el icono en su caja de color, y opcionalmente un footer.
 * Con `value={undefined}` muestra el esqueleto — el consumo/estados de carga
 * no se escriben a mano en cada página.
 */
export function StatCard({
  label,
  icon,
  value,
  tone = 'neutral',
  footer,
  className = '',
}: StatCardProps) {
  return (
    <Card className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {value === undefined ? (
          <Skeleton className="mt-3 h-8 w-32" />
        ) : (
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 dark:text-white">{value}</p>
        )}
        {footer && <div className="mt-1 text-xs text-slate-400">{footer}</div>}
      </div>
      {icon && <div className={`rounded-xl p-2 ${TONE_ICON_BG[tone]}`}>{icon}</div>}
    </Card>
  );
}
