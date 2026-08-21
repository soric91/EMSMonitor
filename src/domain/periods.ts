/**
 * La única convención de periodos del panel.
 *
 * Antes había dos por culpa del backend: las tabs usaban "day"/"week"/…
 * (Period) y la ruta /reports pedía "daily"/"weekly"/… (ReportType), bridgadas
 * con un mapeo manual PERIOD_TO_REPORT_TYPE que se copiaba. Todo lo que calcula
 * el backend sale de esta enum: /reports/{daily|…|yearly|custom} y /costs/{day|…}.
 */

import { startOfLocalMonth, startOfLocalYear } from '../utils/timezone';

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
    // Termina donde empieza este mes: un mes cerrado, que es el que se archiva
    // y el que se compara contra la factura.
    label: 'Mes pasado',
    rango: () => ({
      from: startOfLocalMonth(-1).toISOString(),
      to: startOfLocalMonth(0).toISOString(),
    }),
  },
  {
    label: 'Este año',
    rango: () => ({ from: startOfLocalYear().toISOString(), to: new Date().toISOString() }),
  },
];

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
 */
export function formatoDeBucket(inicio: string, fin: string): string {
  const horas = duracionEnHoras(inicio, fin);
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
