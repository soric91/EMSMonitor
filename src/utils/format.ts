import { formatInTimeZone } from 'date-fns-tz';
import type { Variable } from '../api/types';
import { VARIABLE_META } from '../types/variable';

const TIME_ZONE = 'America/Bogota';

export function formatVariableValue(variable: Variable, value: number): string {
  const meta = VARIABLE_META[variable];
  if (meta.unit === 'W') return formatWatts(value);
  if (meta.unit === '') return value.toFixed(2);
  return `${value.toFixed(2)} ${meta.unit}`;
}

export function formatWatts(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${(value / 1000).toFixed(2)} kW`;
  }
  return `${value.toFixed(0)} W`;
}

export function formatKwh(value: number): string {
  return `${value.toFixed(2)} kWh`;
}

export function formatLocalDateTime(iso: string, formatStr = 'd MMM, HH:mm:ss'): string {
  return formatInTimeZone(new Date(iso), TIME_ZONE, formatStr);
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const COP_FORMAT = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatCop(value: number): string {
  return COP_FORMAT.format(value);
}
