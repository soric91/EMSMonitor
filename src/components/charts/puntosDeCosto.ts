import type { CostPoint } from '../../api/types';
import type { ComparisonBarPoint } from './ComparisonBarChart';

/**
 * Los dos valores que se enfrentan en cada barra. Sale del componente para
 * poder probarse: dentro del árbol de recharts, qué serie quedó en `a` y cuál
 * en `b` no se puede observar. Y vive fuera del componente por lo mismo que
 * `chartPoints`: exportar función y componente del mismo archivo apaga el fast
 * refresh.
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
