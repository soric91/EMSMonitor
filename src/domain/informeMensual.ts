import { admiteDetalleSemanal, agruparPorSemana } from './detalleDelPeriodo';
import type { SemanaDelPeriodo } from './detalleDelPeriodo';
import { formatLocalDateTime } from '../utils/format';
import { mergeSeries } from '../utils/mergeSeries';
import { monthLabel } from '../utils/labels';
import { startOfLocalMonth } from '../utils/timezone';
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

/**
 * Cómo se nombra el periodo del informe.
 *
 * El informe se llamaba siempre "del mes" y titulaba con el mes en curso,
 * aunque el rango fuera otro: quien miraba julio se bajaba un PDF que decía
 * agosto. El título sale ahora del periodo que el backend reportó, y solo dice
 * el nombre del mes cuando el rango ES un mes de calendario.
 */
export function etiquetaDelPeriodo(inicio: string, fin: string): string {
  const mes = mesCalendarioExacto(inicio, fin);
  if (mes) return monthLabel(mes, 'long');

  const mismoAnio = anioLocal(inicio) === anioLocal(fin);
  const desde = formatLocalDateTime(inicio, mismoAnio ? 'd MMM' : 'd MMM yyyy');
  return `${desde} — ${formatLocalDateTime(fin, 'd MMM yyyy')}`;
}

function anioLocal(iso: string): string {
  return formatLocalDateTime(iso, 'yyyy');
}

/** El sufijo del archivo: el mes si lo es, y si no las dos fechas. */
export function sufijoDeArchivo(inicio: string, fin: string): string {
  return (
    mesCalendarioExacto(inicio, fin) ??
    `${formatLocalDateTime(inicio, 'yyyy-MM-dd')}_${formatLocalDateTime(fin, 'yyyy-MM-dd')}`
  );
}

/**
 * "YYYY-MM" si el rango cubre exactamente ese mes en hora de Bogotá, o `null`.
 *
 * Se compara contra los límites locales del mes: un rango que empieza el 1 a
 * medianoche de Bogotá arranca a las 05:00 UTC, y comparar los ISO crudos
 * diría que no es el mes.
 */
function mesCalendarioExacto(inicio: string, fin: string): string | null {
  const mes = formatLocalDateTime(inicio, 'yyyy-MM');
  const desde = new Date(inicio).getTime();
  const hasta = new Date(fin).getTime();
  const inicioDelMes = startOfLocalMonth(0, new Date(inicio)).getTime();
  const finDelMes = startOfLocalMonth(1, new Date(inicio)).getTime();

  // Un minuto de tolerancia: el backend puede devolver el cierre como
  // 23:59:59 del último día en vez del primer instante del siguiente.
  const cierraElMes = Math.abs(hasta - finDelMes) <= 60_000 || finDelMes - hasta <= 1_000;
  return desde === inicioDelMes && cierraElMes && hasta > desde ? mes : null;
}

export type SeccionInforme =
  | 'resumen'
  | 'cascada'
  | 'semanas'
  | 'cobertura'
  | 'heatmap'
  | 'carga_base'
  | 'anomalias'
  | 'tipos_de_dia'
  | 'sedes';

/**
 * Las semanas del informe, o `[]` si el periodo no da para partirlo.
 *
 * Vive acá y no en el PDF porque es la misma definición de semana que usa la
 * pantalla: un informe que corte los lunes distinto a como los corta el panel
 * daría dos respuestas a la misma pregunta.
 */
export function semanasDelInforme(datos: DatosInformeMensual): SemanaDelPeriodo[] {
  if (!admiteDetalleSemanal(datos.reporte)) return [];
  return agruparPorSemana(
    mergeSeries(datos.reporte.consumption_series, datos.reporte.export_series, (time) =>
      formatLocalDateTime(time, 'd MMM'),
    ),
  );
}

/**
 * Si la sede del informe tiene generación propia.
 *
 * El informe no puede preguntarle a `useSiteMode` —se arma fuera de React— así
 * que lo deduce de los datos que ya trae: energía exportada en el periodo, o
 * una carga base medida de NOCHE, que es lo que hace el backend cuando la
 * curva diurna está contaminada por los paneles.
 *
 * Importa porque la mayoría de las sedes solo importa energía: ahí "Exportado"
 * no es un dato en cero, es una tarjeta que nunca va a tener nada.
 */
export function tieneGeneracion(datos: DatosInformeMensual): boolean {
  return datos.reporte.export_kwh > 0 || datos.cargaBase?.window === 'noche';
}

/** Las secciones que este mes tiene con qué llenarse, en orden de lectura. */
export function seccionesDelInforme(datos: DatosInformeMensual): SeccionInforme[] {
  const secciones: SeccionInforme[] = ['resumen', 'cascada'];

  // Con una sola semana no hay evolución que mostrar: la tabla repetiría el
  // total del resumen en otra fila.
  if (semanasDelInforme(datos).length >= 2) secciones.push('semanas');

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
