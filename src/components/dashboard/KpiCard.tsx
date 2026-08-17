import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Sparkline } from '../charts/Sparkline';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatLocalDateTime } from '../../utils/format';

type KpiTone = 'neutral' | 'import' | 'export' | 'warning';

const TONE: Record<KpiTone, { value: string; icon: string }> = {
  neutral: {
    value: 'text-slate-900 dark:text-white',
    icon: 'bg-slate-500/10 text-slate-500 dark:text-slate-400',
  },
  import: {
    value: 'text-amber-600 dark:text-amber-400',
    icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  export: {
    value: 'text-emerald-600 dark:text-emerald-400',
    icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  warning: {
    value: 'text-red-600 dark:text-red-400',
    icon: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
};

export interface KpiVariacion {
  /** Delta en porcentaje, con signo (ej. 4.7, -3.2). */
  delta: number;
  /** Qué se compara (ej. "vs. período anterior"). */
  label: string;
  /** Si un delta positivo es bueno (exportar más = bueno; consumir más = malo). */
  positivo: boolean;
}

interface KpiCardProps {
  /** Nombre del indicador, arriba a la izquierda. */
  label: string;
  /** Valor ya formateado (ej. "7.45 kWh", "$ 6.722"). */
  value: ReactNode;
  /** Unidad como texto secundario (ej. "kW"). Opcional si el valor ya la lleva. */
  unit?: string;
  /** Timestamp de la última actualización (ISO) — se muestra como hora local. */
  timestamp?: string | null;
  tone?: KpiTone;
  icon?: ReactNode;
  loading?: boolean;
  /** Sin dato disponible: muestra "—" en vez de inventar un valor. */
  empty?: boolean;
  variacion?: KpiVariacion | null;
  /**
   * Miniserie de los últimos días, en orden cronológico. Sin ella la tarjeta
   * se dibuja igual que siempre: un número solo no dice si viene subiendo.
   */
  sparkline?: number[] | null;
  footer?: ReactNode;
}

/**
 * La tarjeta KPI única del panel: valor dominante, unidad, icono con tono,
 * timestamp, variación vs. período anterior y estados loading/empty.
 *
 * Es la pieza que estaba repartida entre StatCard, CostoDelPeriodo y las cards
 * sueltas: un solo contrato visual para todos los indicadores del RESUMEN.
 */
export function KpiCard({
  label,
  value,
  unit,
  timestamp,
  tone = 'neutral',
  icon,
  loading = false,
  empty = false,
  variacion,
  sparkline,
  footer,
}: KpiCardProps) {
  const tono = TONE[tone];

  if (loading) {
    return (
      <Card className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-8 rounded-xl" />
        </div>
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-3 w-28" />
      </Card>
    );
  }

  const esBueno = variacion ? variacion.delta >= 0 === variacion.positivo : null;
  const direccion = variacion && variacion.delta >= 0 ? 'subir' : 'bajar';

  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {icon && <div className={`rounded-xl p-2 ${tono.icon}`}>{icon}</div>}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className={`text-2xl font-semibold tabular-nums tracking-tight ${tono.value}`}>
          {empty ? '—' : value}
        </span>
        {unit && !empty && <span className="text-xs text-slate-400">{unit}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {variacion && (
          <span
            className={[
              'flex items-center gap-1 text-[11px] font-medium',
              esBueno
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400',
            ].join(' ')}
          >
            {direccion === 'subir' ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {`${variacion.delta >= 0 ? '+' : ''}${variacion.delta.toFixed(1)}% ${variacion.label}`}
          </span>
        )}
        {timestamp && (
          <span className="text-[11px] text-slate-400">
            {formatLocalDateTime(timestamp, 'HH:mm')}
          </span>
        )}
      </div>

      {sparkline && sparkline.length > 1 && (
        <div className={`mt-1 ${tono.value}`}>
          <Sparkline values={sparkline} label={`${label}: últimos ${sparkline.length} días`} />
        </div>
      )}

      {footer && <div className="mt-1 text-[11px] text-slate-400">{footer}</div>}
    </Card>
  );
}
