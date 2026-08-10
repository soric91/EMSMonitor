/**
 * "2026-07" → "jul. 2026", usando mediodía UTC para esquivar corrimientos de
 * zona horaria (medianoche local de un mes puede caer el día anterior).
 *
 * El mismo nombre estaba copiado en CostoDelPeriodo, CostBreakdownSummary y
 * AnalyticsSummary con dos estilos (corto y largo), cada uno definiendo la
 * suya. Aquí vive una sola vez; la larga se pide con `style: 'long'`.
 */
export function monthLabel(month: string, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat('es-CO', { month: style, year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00Z`),
  );
}

/** Cuando un KPI no aplica (p. ej. un medidor que solo exporta). */
export const NOT_APPLICABLE = 'No aplica — exportando';
