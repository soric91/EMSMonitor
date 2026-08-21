import type { UTCTimestamp } from 'lightweight-charts';
import type { LiveChartPoint } from './LiveLineChart';

/**
 * Los puntos que lightweight-charts acepta: uno por segundo, ordenados y sin
 * valores no finitos.
 *
 * Vive aparte de `LiveLineChart` porque un archivo que exporta un componente y
 * además una función pierde el fast refresh: cada cambio recarga la página
 * entera en vez de repintar el componente.
 */
export function toChartPoints(data: LiveChartPoint[]) {
  const bySecond = new Map<number, number>();
  for (const p of data) {
    // Un tick con valor no finito (null/NaN/Inf — el backend puede recibir
    // NaN del medidor) rompe lightweight-charts con "Value is null"; se
    // descarta el punto, no la serie entera.
    if (!Number.isFinite(p.value) || !Number.isFinite(p.time)) continue;
    bySecond.set(Math.floor(p.time / 1000), p.value);
  }
  return Array.from(bySecond.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, value]) => ({ time: time as UTCTimestamp, value }));
}
