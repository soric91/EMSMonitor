import type { AnalyticsSummary } from '../api/types';

/**
 * Los cinco KPIs de energía del resumen general, con su etiqueta y su signo.
 *
 * Viven acá porque los pintan DOS consumidores —la tarjeta de Analítica y el
 * PDF que se exporta desde ella— y tenerlos duplicados ya dejó al PDF diciendo
 * "(prom.)" cuando la pantalla decía otra cosa.
 *
 * F0.3: no son promedios. `compute_kpis` (ApiEMS) devuelve el acumulado del
 * día, la semana y el mes EN CURSO recortado al rango pedido: a las 6 a.m. el
 * "consumo diario" es lo que va de esa madrugada. Las etiquetas dicen eso.
 */
export interface KpiEnergia {
  key: keyof AnalyticsSummary;
  label: string;
  tone: 'import' | 'export';
}

export const KPIS_ENERGIA: KpiEnergia[] = [
  { key: 'consumption_daily_kwh', label: 'Consumo de hoy', tone: 'import' },
  { key: 'consumption_weekly_kwh', label: 'Consumo de esta semana', tone: 'import' },
  { key: 'consumption_monthly_kwh', label: 'Consumo de este mes', tone: 'import' },
  { key: 'export_daily_kwh', label: 'Exportación de hoy', tone: 'export' },
  { key: 'export_monthly_kwh', label: 'Exportación de este mes', tone: 'export' },
];
