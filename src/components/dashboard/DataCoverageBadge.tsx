import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getCoverage } from '../../api/analytics';
import type { CoverageResult } from '../../api/types';
import { useDevice } from '../../hooks/useDevice';

/**
 * Cuánto dato hay realmente en el rango que se está mirando.
 *
 * Sin esto, un gateway caído diez horas deja un día que se ve como de bajo
 * consumo y nadie se entera: el hueco y el ahorro se dibujan igual. Cualquier
 * comparación entre periodos depende de saber que ambos lados están completos.
 */

/** Por debajo de esto el rango se marca como incompleto, igual que el backend. */
const COMPLETO_DESDE = 0.95;

interface DataCoverageBadgeProps {
  fromIso: string;
  toIso: string;
}

export function DataCoverageBadge({ fromIso, toIso }: DataCoverageBadgeProps) {
  const { selectedDeviceId } = useDevice();
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const data = await getCoverage({
          from: fromIso,
          to: toIso,
          device_id: selectedDeviceId ?? undefined,
        });
        if (!cancelled) setCoverage(data);
      } catch {
        // Es un aviso, no un dato: si falla, la página no cambia.
        if (!cancelled) setCoverage(null);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [fromIso, toIso, selectedDeviceId]);

  if (coverage === null || coverage.overall_ratio === null) return null;

  const porcentaje = Math.round(coverage.overall_ratio * 100);
  const completo = coverage.overall_ratio >= COMPLETO_DESDE;

  return (
    <span
      title={
        completo
          ? 'Llegaron casi todas las lecturas esperadas en este rango.'
          : `Faltan lecturas en ${coverage.incomplete_buckets} ventana(s). Los totales del rango son parciales: un hueco de datos no es consumo cero.`
      }
      className={[
        'flex items-center gap-1.5 text-[11px] font-medium',
        completo ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
      ].join(' ')}
    >
      {completo ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5" />
      )}
      Datos {completo ? 'completos' : 'incompletos'} al {porcentaje}%
      {coverage.expected_source === 'inferido' && (
        <span className="font-normal text-slate-400">(estimado)</span>
      )}
    </span>
  );
}
