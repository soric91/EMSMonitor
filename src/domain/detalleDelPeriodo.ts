import type { HeatmapResult, ReportData } from '../api/types';
import type { MergedEnergyPoint } from '../utils/mergeSeries';
import { formatLocalDateTime } from '../utils/format';
import { startOfLocalWeek } from '../utils/timezone';

/**
 * El detalle que un reporte largo debe contar y hoy no cuenta.
 *
 * Un reporte mensual dibuja lo mismo que uno diario: tres totales y una barra
 * por bucket. Nada responde lo que se le pregunta a un mes —cómo se movió
 * semana a semana, qué día fue el peor, a qué hora se concentra el pico—.
 * Todo eso se calcula con lo que el backend ya entrega.
 *
 * Acá no se suma NINGÚN peso, y no es un olvido: el crédito por exportar se
 * reparte en dos tramos contra lo importado del MES, así que sumar los costos
 * de una semana daría un número que no cuadra con la factura. La energía sí es
 * aditiva; el dinero no.
 */

export interface SemanaDelPeriodo {
  /** El lunes de la semana, en ISO UTC. */
  inicio: string;
  /** El lunes siguiente: el fin es exclusivo. */
  fin: string;
  /** Cómo se lee la semana: "1 – 7 sep". */
  etiqueta: string;
  consumoKwh: number;
  exportacionKwh: number;
  /** Cuántos buckets del reporte cayeron adentro. */
  buckets: number;
}

export interface PicoDiario {
  /** El bucket, en ISO UTC. */
  time: string;
  etiqueta: string;
  kwh: number;
}

export interface PicoHorario {
  /** Hora local 0–23. */
  hora: number;
  /** El promedio de esa hora en el rango considerado. */
  kwh: number;
  /** El día en que se dio el máximo, o `null` si se promedió. */
  fecha: string | null;
}

/** Cuánto separa a dos buckets consecutivos, en milisegundos. `null` si no hay dos. */
export function espaciadoDeBuckets(puntos: { time: string }[]): number | null {
  if (puntos.length < 2) return null;
  const saltos = puntos
    .slice(1)
    .map((p, i) => new Date(p.time).getTime() - new Date(puntos[i]!.time).getTime())
    .sort((a, b) => a - b);
  return saltos[Math.floor(saltos.length / 2)] ?? null;
}

const DIA_MS = 24 * 3_600_000;

/**
 * Si al reporte le cabe un desglose por semanas.
 *
 * Dos condiciones, y las dos importan. Dura al menos dos semanas —en un
 * reporte diario no hay semanas que comparar— y sus buckets son de un día o
 * menos: el reporte anual llega con un punto por mes, y agrupar doce puntos
 * mensuales "por semana" daría doce semanas de un bucket cada una.
 *
 * Mira la DURACIÓN, no el `report_type`: un rango personalizado de dos meses
 * merece el mismo detalle que el tab Mensual.
 */
export function admiteDetalleSemanal(report: ReportData): boolean {
  const duracion = new Date(report.period_end).getTime() - new Date(report.period_start).getTime();
  if (duracion < 14 * DIA_MS) return false;

  const espaciado = espaciadoDeBuckets(report.consumption_series);
  // 26 h de tolerancia: un bucket diario puede venir con minutos de más.
  return espaciado !== null && espaciado <= 26 * 3_600_000;
}

/**
 * Agrupa los buckets del reporte en semanas de lunes a domingo.
 *
 * Las semanas parciales —la primera y la última de un mes casi siempre lo
 * son— entran igual, pero con su etiqueta real de fechas: quien lee "1 – 3
 * sep" ya sabe que son tres días, y no confunde una semana corta con una
 * semana floja.
 */
export function agruparPorSemana(puntos: MergedEnergyPoint[]): SemanaDelPeriodo[] {
  const semanas = new Map<string, SemanaDelPeriodo>();

  for (const punto of puntos) {
    const lunes = startOfLocalWeek(punto.time);
    const inicio = lunes.toISOString();
    const existente = semanas.get(inicio);
    if (existente) {
      existente.consumoKwh += punto.a;
      existente.exportacionKwh += punto.b;
      existente.buckets += 1;
      continue;
    }
    const fin = new Date(lunes.getTime() + 7 * DIA_MS).toISOString();
    semanas.set(inicio, {
      inicio,
      fin,
      etiqueta: etiquetaDeSemana(inicio, fin),
      consumoKwh: punto.a,
      exportacionKwh: punto.b,
      buckets: 1,
    });
  }

  return Array.from(semanas.values()).sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** "1 – 7 sep", o "29 sep – 5 oct" cuando la semana cruza de mes. */
function etiquetaDeSemana(inicio: string, fin: string): string {
  // El fin es exclusivo: el domingo es el día anterior.
  const domingo = new Date(new Date(fin).getTime() - DIA_MS).toISOString();
  const mismoMes = formatLocalDateTime(inicio, 'MM') === formatLocalDateTime(domingo, 'MM');
  const desde = formatLocalDateTime(inicio, mismoMes ? 'd' : 'd MMM');
  return `${desde} – ${formatLocalDateTime(domingo, 'd MMM')}`;
}

/**
 * El bucket que más consumió. `null` si no hubo consumo en ninguno.
 *
 * Con empate gana el más antiguo: los buckets llegan ordenados, y elegir el
 * último haría que el "día pico" saltara de fecha entre dos cargas iguales.
 */
export function diaDeMayorConsumo(puntos: MergedEnergyPoint[]): PicoDiario | null {
  let mejor: MergedEnergyPoint | null = null;
  for (const punto of puntos) {
    if (punto.a > 0 && (mejor === null || punto.a > mejor.a)) mejor = punto;
  }
  return mejor === null ? null : { time: mejor.time, etiqueta: mejor.label, kwh: mejor.a };
}

/** La semana que más consumió, con cuánto se apartó del promedio del periodo. */
export function semanaDeMayorConsumo(
  semanas: SemanaDelPeriodo[],
): { semana: SemanaDelPeriodo; deltaSobreMedia: number | null } | null {
  const conConsumo = semanas.filter((s) => s.consumoKwh > 0);
  if (conConsumo.length === 0) return null;

  const semana = conConsumo.reduce((a, b) => (b.consumoKwh > a.consumoKwh ? b : a));
  // Una sola semana no tiene contra qué compararse; decir "+0%" sería inventar
  // una referencia.
  if (conConsumo.length < 2) return { semana, deltaSobreMedia: null };

  const media = conConsumo.reduce((total, s) => total + s.consumoKwh, 0) / conConsumo.length;
  return { semana, deltaSobreMedia: media > 0 ? semana.consumoKwh / media - 1 : null };
}

/**
 * La hora del día que más consumo concentró, sobre el mapa hora × día.
 *
 * Las casillas nulas se saltan: son horas SIN LECTURA, y contarlas como cero
 * hundiría el promedio de una hora que quizá fue la más alta. Es la misma
 * distinción que cuenta el indicador de cobertura.
 */
export function horaDeMayorConsumo(heatmap: HeatmapResult): PicoHorario | null {
  let mejor: PicoHorario | null = null;

  heatmap.dates.forEach((fecha, fila) => {
    for (let hora = 0; hora < 24; hora++) {
      const valor = heatmap.values[fila]?.[hora];
      if (valor === null || valor === undefined) continue;
      if (mejor === null || valor > mejor.kwh) mejor = { hora, kwh: valor, fecha };
    }
  });

  return mejor;
}

/**
 * La hora pico de cada semana, indexada por el lunes de esa semana.
 *
 * Una semana sin ninguna lectura no aparece en el mapa: no es que su pico sea
 * cero, es que no se sabe.
 */
export function horaPicoPorSemana(heatmap: HeatmapResult): Map<string, PicoHorario> {
  const porSemana = new Map<string, PicoHorario>();

  heatmap.dates.forEach((fecha, fila) => {
    // Mediodía: el día del heatmap es una fecha local sin hora, y tomarla como
    // medianoche UTC la correría al día anterior en Bogotá.
    const inicio = startOfLocalWeek(`${fecha}T12:00:00Z`).toISOString();

    for (let hora = 0; hora < 24; hora++) {
      const valor = heatmap.values[fila]?.[hora];
      if (valor === null || valor === undefined) continue;
      const actual = porSemana.get(inicio);
      if (!actual || valor > actual.kwh) porSemana.set(inicio, { hora, kwh: valor, fecha });
    }
  });

  return porSemana;
}
