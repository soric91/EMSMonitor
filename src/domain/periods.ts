/**
 * La única convención de periodos del panel.
 *
 * Antes había dos por culpa del backend: las tabs usaban "day"/"week"/…
 * (Period) y la ruta /reports pedía "daily"/"weekly"/… (ReportType), bridgadas
 * con un mapeo manual PERIOD_TO_REPORT_TYPE que se copiaba. Todo lo que calcula
 * el backend sale de esta enum: /reports/{daily|…|yearly|custom} y /costs/{day|…}.
 */

import type { EnergyBucket } from '../api/types';
import { startOfLocalDay, startOfLocalMonth, startOfLocalYear } from '../utils/timezone';

export type Period = 'day' | 'week' | 'month' | 'year' | 'custom';

/** Si un string cualquiera (una query string, por ejemplo) nombra un periodo. */
export function esPeriodo(valor: string | null): valor is Period {
  return (
    valor === 'day' ||
    valor === 'week' ||
    valor === 'month' ||
    valor === 'year' ||
    valor === 'custom'
  );
}

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

/**
 * Las agrupaciones que tiene sentido ofrecer para un rango.
 *
 * No es una lista fija: agrupar por semana un reporte de un día daría una sola
 * barra, y por hora uno de dos años daría diecisiete mil. Se ofrece solo lo que
 * deja entre un puñado y unas pocas centenas de barras.
 */
export function agrupacionesDisponibles(
  inicio: string,
  fin: string,
): { key: EnergyBucket; label: string }[] {
  const horas = (new Date(fin).getTime() - new Date(inicio).getTime()) / 3_600_000;
  const opciones: { key: EnergyBucket; label: string }[] = [];
  if (horas <= 24 * 31) opciones.push({ key: 'hour', label: 'Hora' });
  if (horas >= 24 * 2) opciones.push({ key: 'day', label: 'Día' });
  if (horas >= 24 * 21) opciones.push({ key: 'week', label: 'Semana' });
  return opciones;
}

/**
 * La agrupación que se muestra si nadie eligió: la misma escalera que aplica
 * el backend, para que la pestaña abra mostrando lo que ya venía.
 */
export function agrupacionPorDefecto(inicio: string, fin: string): EnergyBucket {
  const horas = (new Date(fin).getTime() - new Date(inicio).getTime()) / 3_600_000;
  if (horas < 48) return 'hour';
  if (horas < 24 * 400) return 'day';
  return 'week';
}

export interface RangoIso {
  from: string;
  to: string;
}

/**
 * Los atajos del selector de fechas.
 *
 * Antes eran tres ventanas móviles ("las últimas N horas") y nada más. Nadie
 * pide un informe de las últimas 720 horas: pide **julio**. Los rangos de
 * calendario se cortan a medianoche de Bogotá, que es donde el cliente cree
 * que empieza su mes — no en la medianoche UTC, que cae a las 7 de la tarde
 * del día anterior.
 */
export const RANGE_PRESETS: { label: string; rango: () => RangoIso }[] = [
  { label: 'Últimas 24h', rango: () => ultimasHoras(24) },
  { label: 'Últimos 7 días', rango: () => ultimasHoras(24 * 7) },
  { label: 'Últimos 30 días', rango: () => ultimasHoras(24 * 30) },
  {
    label: 'Este mes',
    rango: () => ({ from: startOfLocalMonth(0).toISOString(), to: new Date().toISOString() }),
  },
  {
    // Un mes cerrado: el que se archiva y el que se compara contra la factura.
    // Termina en el ÚLTIMO instante del mes, no en el primero del siguiente —
    // que además es un bucket que ya pertenece al mes que viene.
    label: 'Mes pasado',
    rango: () => ({
      from: startOfLocalMonth(-1).toISOString(),
      to: finDeRangoPedible(startOfLocalMonth(0).toISOString()),
    }),
  },
  {
    label: 'Este año',
    rango: () => ({ from: startOfLocalYear().toISOString(), to: new Date().toISOString() }),
  },
];

/**
 * Corre un milisegundo hacia atrás un fin de rango que caiga justo en la
 * medianoche local.
 *
 * Es un rodeo a un bug de ApiEMS, no una preferencia: con `to` exactamente en
 * el primer instante de un día local, `/reports/*` arma internamente una
 * subconsulta del estilo "lo que va del día de `to`" que queda vacía, e InfluxDB
 * responde `cannot query an empty range` — que sale como un 500 sin más
 * explicación. Pasa con cualquier rango de calendario ("Mes pasado", "Este
 * año") y con cualquier fecha que alguien escriba a las 00:00.
 *
 * Un milisegundo no cambia ninguna cifra del informe: el último bucket es el
 * mismo. Cuando el backend lo arregle, esto se puede quitar entero.
 */
export function finDeRangoPedible(toIso: string): string {
  const fin = new Date(toIso);
  return startOfLocalDay(fin).getTime() === fin.getTime()
    ? new Date(fin.getTime() - 1).toISOString()
    : toIso;
}

function ultimasHoras(horas: number): RangoIso {
  return {
    from: new Date(Date.now() - horas * 3_600_000).toISOString(),
    to: new Date().toISOString(),
  };
}

/** Cuánto dura un reporte, en horas. */
function duracionEnHoras(inicio: string, fin: string): number {
  return (new Date(fin).getTime() - new Date(inicio).getTime()) / 3_600_000;
}

/**
 * Cómo se etiqueta un bucket en las gráficas y en el CSV.
 *
 * Va por la DURACIÓN del reporte, no por su nombre. Un "Personalizado" de seis
 * meses y uno de dos horas son el mismo `report_type` y necesitan etiquetas
 * opuestas: con una tabla por periodo, todo lo personalizado salía como
 * `d MMM HH:mm` —ilegible en medio año, redundante en dos horas—.
 *
 * Los periodos fijos caen solos donde les toca. Dos afinaciones respecto de lo
 * que había: la semana lleva el día del mes (`lun 8`, no `lun`), porque dos
 * semanas seguidas se veían idénticas; y el año lleva el año (`ene 2026`),
 * porque un rango de doce meses cruza diciembre y `ene` no decía cuál.
 *
 * `bucket` gana cuando el cliente eligió cómo agrupar: entonces lo que decide
 * la etiqueta es el tamaño de la barra, no el largo del rango.
 */
export function formatoDeBucket(inicio: string, fin: string, bucket?: EnergyBucket): string {
  const horas = duracionEnHoras(inicio, fin);

  // Con una agrupación elegida manda ella: treinta días vistos hora por hora
  // necesitan la hora en la etiqueta, aunque el rango sea de un mes.
  if (bucket === 'hour') return horas < 48 ? 'HH:mm' : 'd MMM HH:mm';
  if (bucket === 'day' || bucket === 'week') return horas < 24 * 300 ? 'd MMM' : 'd MMM yyyy';

  if (horas < 48) return 'HH:mm';
  if (horas < 24 * 10) return 'EEE d';
  if (horas < 24 * 90) return 'd MMM';
  return 'MMM yyyy';
}

/** Por qué un rango no se puede pedir. `null` = se puede. */
export type MotivoRangoInvalido = 'invertido' | 'vacio' | 'futuro';

/**
 * Si un rango de fechas es pedible.
 *
 * El backend no es quien debe rechazar un `from` posterior al `to`: para
 * cuando responde, el usuario ya esperó por un error que se veía desde antes
 * de salir. Un rango que termina en el futuro tampoco es un error del
 * servidor — simplemente no hay lecturas de mañana.
 */
export function validarRango(fromIso: string, toIso: string): MotivoRangoInvalido | null {
  const desde = new Date(fromIso).getTime();
  const hasta = new Date(toIso).getTime();
  if (desde > hasta) return 'invertido';
  if (desde === hasta) return 'vacio';
  if (desde > Date.now()) return 'futuro';
  return null;
}

export const MENSAJE_RANGO_INVALIDO: Record<MotivoRangoInvalido, string> = {
  invertido: 'La fecha inicial es posterior a la final.',
  vacio: 'El rango no abarca ningún tiempo.',
  futuro: 'El rango empieza en el futuro: todavía no hay lecturas.',
};
