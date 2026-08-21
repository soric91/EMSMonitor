import type { CostPoint } from '../../api/types';
import { Card } from '../ui/Card';
import { ComparisonBarChart, type ComparisonBarPoint } from './ComparisonBarChart';
import { formatCop } from '../../utils/format';

/**
 * Los dos valores que se enfrentan en cada barra. Sale del componente para
 * poder probarse: dentro del árbol de recharts, qué serie quedó en `a` y cuál
 * en `b` no se puede observar.
 */
export function puntosDeCosto(
  series: CostPoint[],
  labelOf: (time: string) => string,
  soloImporta = false,
): ComparisonBarPoint[] {
  return series.map((p) => ({
    label: labelOf(p.time),
    a: p.consumption_cost_cop,
    // En consumo puro el crédito es cero en todos los buckets: dibujar esa
    // serie sería una fila de barras invisibles con su entrada en la leyenda.
    b: soloImporta ? 0 : p.export_credit_cop,
  }));
}

interface PeriodCostChartProps {
  /** Un punto por bucket, con el mismo bucketing que las series de energía. */
  series: CostPoint[];
  /** Cómo se escribe el bucket en el eje (ver `formatoDeBucket`). */
  labelOf: (time: string) => string;
  /** En una sede sin generación no hay crédito por exportar que enfrentar. */
  soloImporta?: boolean;
}

/**
 * Lo que costó cada bucket, en pesos, contra el crédito que generó exportar.
 *
 * Los valores son los que calculó el backend por bucket; acá no se suma ni se
 * reparte nada. El crédito por exportar se divide en tramos contra lo
 * importado del MES, así que agregar estas barras en el cliente daría un total
 * que no cuadra con la factura.
 *
 * Sin serie no se dibuja nada: una gráfica de costos vacía en un periodo sin
 * tarifa cargada se lee como "no costó nada", que es lo contrario de "no se
 * sabe".
 */
export function PeriodCostChart({ series, labelOf, soloImporta = false }: PeriodCostChartProps) {
  if (series.length === 0) return null;

  return (
    <Card>
      <p className="mb-4 text-xs font-medium text-slate-500 dark:text-slate-400">
        Costo por periodo (COP)
      </p>
      <ComparisonBarChart
        data={puntosDeCosto(series, labelOf, soloImporta)}
        labelA={soloImporta ? 'Costo' : 'Costo importado'}
        labelB="Crédito exportado"
        valueFormatter={(v) => formatCop(v)}
        ocultarB={soloImporta}
      />
    </Card>
  );
}
