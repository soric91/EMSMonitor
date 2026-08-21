import type { CostPoint } from '../../api/types';
import { Card } from '../ui/Card';
import { ComparisonBarChart } from './ComparisonBarChart';
import { puntosDeCosto } from './puntosDeCosto';
import { formatCop } from '../../utils/format';

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
      <p className="mb-4 stencil text-slate-500 dark:text-slate-400">Costo por periodo (COP)</p>
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
