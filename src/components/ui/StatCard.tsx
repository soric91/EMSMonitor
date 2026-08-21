import { Card } from './Card';
import { Skeleton } from './Skeleton';

type Tone = 'neutral' | 'import' | 'export';

const TONE_ICON_BG: Record<Tone, string> = {
  neutral: 'bg-slate-500/10 text-slate-500 dark:text-slate-400',
  import: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  export: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

/** El filo de color del borde izquierdo: dice de qué es el dato sin leerlo. */
const TONE_EDGE: Record<Tone, string> = {
  neutral: 'before:bg-slate-400/50',
  import: 'before:bg-amber-500',
  export: 'before:bg-emerald-500',
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
 * las tarjetas de balance y el grid de demanda. Una sola pieza: el label
 * arriba, el valor dominante, el icono en su caja de color, y opcionalmente un
 * footer. Con `value={undefined}` muestra el esqueleto — el consumo/estados de
 * carga no se escriben a mano en cada página.
 *
 * El valor va en la tipografía de lectura: cifras tabulares y apretadas, para
 * que un número que se actualiza en vivo no baile de ancho entre dígitos.
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
    <Card
      className={`relative flex items-start justify-between gap-3 overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-0.5 ${TONE_EDGE[tone]} ${className}`}
    >
      <div className="min-w-0">
        <p className="stencil text-slate-500 dark:text-slate-400">{label}</p>
        {value === undefined ? (
          <Skeleton className="mt-3 h-8 w-32" />
        ) : (
          <p className="readout mt-2 text-2xl text-slate-900 dark:text-white">{value}</p>
        )}
        {footer && <div className="mt-1 text-xs text-slate-400">{footer}</div>}
      </div>
      {icon && <div className={`rounded-xl p-2 ${TONE_ICON_BG[tone]}`}>{icon}</div>}
    </Card>
  );
}
