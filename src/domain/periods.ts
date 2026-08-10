/**
 * La única convención de periodos del panel.
 *
 * Antes había dos por culpa del backend: las tabs usaban "day"/"week"/…
 * (Period) y la ruta /reports pedía "daily"/"weekly"/… (ReportType), bridgadas
 * con un mapeo manual PERIOD_TO_REPORT_TYPE que se copiaba. Todo lo que calcula
 * el backend sale de esta enum: /reports/{daily|…|yearly|custom} y /costs/{day|…}.
 */

export type Period = 'day' | 'week' | 'month' | 'year' | 'custom';

/** Los periodos fijos que el backend calcula sin from/to (excluye custom). */
export type FixedPeriod = Exclude<Period, 'custom'>;

const REPORT_TYPE: Record<Period, string> = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
  year: 'yearly',
  custom: 'custom',
};

/** La ruta del reporte para un periodo: `/reports/{daily|weekly|monthly|yearly|custom}`. */
export function toReportPath(period: Period): string {
  return `/reports/${REPORT_TYPE[period]}`;
}

/** Presets del DateRangePicker: etiqueta + cuántas horas hacia atrás. */
export const RANGE_PRESETS = [
  { label: 'Últimas 24h', hours: 24 },
  { label: 'Últimos 7 días', hours: 24 * 7 },
  { label: 'Últimos 30 días', hours: 24 * 30 },
] as const;
