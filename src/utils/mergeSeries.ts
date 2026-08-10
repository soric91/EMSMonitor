import type { ComparisonBarPoint } from '../components/charts/ComparisonBarChart';
import type { EnergyPoint } from '../api/types';

export interface MergedEnergyPoint extends ComparisonBarPoint {
  /** El timestamp original del bucket, para exportar CSV con la hora real. */
  time: string;
}

/**
 * Junta las series de importación y exportación en un solo arreglo ordenado
 * por tiempo.
 *
 * Copiado en Reports.tsx y ConsumptionExport.tsx con la misma lógica de mapa
 * y ordenamiento. El merge por `time` sirve a ComparBarChart, que dibuja las
 * dos barras en el mismo bucket; sin él, series con distintos buckets (o puntos
 * solo de un lado) desfasarían las columnas.
 *
 * @param consumption Serie importada con su bucket y kWh.
 * @param exported    Serie exportada con su bucket y kWh.
 * @param labelOf     Cómo se muestra el bucket (ej. formatLocalDateTime(t, 'd MMM')).
 */
export function mergeSeries(
  consumption: EnergyPoint[],
  exported: EnergyPoint[],
  labelOf: (time: string) => string,
): MergedEnergyPoint[] {
  const byTime = new Map<string, MergedEnergyPoint>();
  for (const p of consumption) {
    byTime.set(p.time, { time: p.time, label: labelOf(p.time), a: p.value, b: 0 });
  }
  for (const p of exported) {
    const existing = byTime.get(p.time);
    if (existing) {
      existing.b = p.value;
    } else {
      byTime.set(p.time, { time: p.time, label: labelOf(p.time), a: 0, b: p.value });
    }
  }
  return Array.from(byTime.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, point]) => point);
}
