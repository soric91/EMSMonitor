import type {
  AlertsHistory,
  BaseLoadTrendResult,
  BenchmarkResult,
  BillForecast,
  CoverageResult,
  DayArchetypesResult,
  HeatmapResult,
  ReportData,
} from '../api/types';

/**
 * Qué entra en el informe mensual y qué no.
 *
 * Vive separado del dibujo del PDF a propósito: la decisión de omitir una
 * sección es la parte que hay que poder revisar y probar, y dentro del código
 * de jsPDF quedaría enterrada entre coordenadas.
 *
 * La regla es la misma que sigue todo el panel: no se dibuja lo que el dato no
 * sostiene. Una sección vacía en un informe que alguien archiva es peor que su
 * ausencia — parece que el mes no tuvo consumo, no que faltaba historia.
 */

export interface DatosInformeMensual {
  mes: string;
  sede: string;
  reporte: ReportData;
  proyeccion: BillForecast | null;
  cobertura: CoverageResult | null;
  cargaBase: BaseLoadTrendResult | null;
  heatmap: HeatmapResult | null;
  historial: AlertsHistory | null;
  arquetipos: DayArchetypesResult | null;
  comparacion: BenchmarkResult | null;
}

export type SeccionInforme =
  | 'resumen'
  | 'cascada'
  | 'cobertura'
  | 'heatmap'
  | 'carga_base'
  | 'anomalias'
  | 'tipos_de_dia'
  | 'sedes';

/** Las secciones que este mes tiene con qué llenarse, en orden de lectura. */
export function seccionesDelInforme(datos: DatosInformeMensual): SeccionInforme[] {
  const secciones: SeccionInforme[] = ['resumen', 'cascada'];

  // La cobertura solo se cuenta cuando hay contra qué compararla: sin
  // referencia de cuántas lecturas esperar, un "97%" sería inventado.
  if (datos.cobertura?.overall_ratio != null) secciones.push('cobertura');

  if ((datos.heatmap?.dates.length ?? 0) > 0) secciones.push('heatmap');

  // Sin carga base medible no hay nada que decir: pasa en una sede con
  // generación y sin lecturas nocturnas en el mes.
  if (datos.cargaBase?.current_w != null) secciones.push('carga_base');

  // Días analizados en cero no es "no hubo anomalías": es que no se miró nada.
  if (
    datos.historial &&
    datos.historial.days_analyzed > 0 &&
    (datos.historial.anomalies.length > 0 || datos.historial.level_shift !== null)
  ) {
    secciones.push('anomalias');
  }

  if ((datos.arquetipos?.archetypes.length ?? 0) > 0) secciones.push('tipos_de_dia');

  // Con menos de tres sedes comparables el ranking no significa nada, y el
  // backend ya lo dice con `enough_peers`.
  if (datos.comparacion?.enough_peers) secciones.push('sedes');

  return secciones;
}
