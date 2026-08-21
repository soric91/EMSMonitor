import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

const TIME_ZONE = 'America/Bogota';

/** Convierte un valor de <input type="datetime-local"> (hora local Bogotá) a ISO UTC para la API. */
export function localInputToUtcIso(localValue: string): string {
  return fromZonedTime(localValue, TIME_ZONE).toISOString();
}

/** Convierte un ISO UTC de la API al valor esperado por <input type="datetime-local"> en hora Bogotá. */
export function utcIsoToLocalInput(iso: string): string {
  return format(toZonedTime(iso, TIME_ZONE), "yyyy-MM-dd'T'HH:mm");
}

export function nowLocalInput(): string {
  return utcIsoToLocalInput(new Date().toISOString());
}

/**
 * La medianoche de hoy en hora Bogotá, como instante UTC.
 *
 * Para comparar periodos entre sí: un rango que termina "ahora" arrastra un
 * día a medio consumir y ensucia cualquier delta contra un rango completo.
 */
export function startOfLocalDay(reference: Date = new Date()): Date {
  const localMidnight = format(toZonedTime(reference, TIME_ZONE), "yyyy-MM-dd'T'00:00");
  return fromZonedTime(localMidnight, TIME_ZONE);
}

export function hoursAgoLocalInput(hours: number): string {
  return utcIsoToLocalInput(new Date(Date.now() - hours * 3_600_000).toISOString());
}

/**
 * El primer instante de un mes en hora de Bogotá, como instante UTC.
 *
 * `offsetMeses` cuenta hacia atrás o adelante desde el mes de `reference`:
 * `0` es este mes, `-1` el pasado. El cálculo se hace sobre el año y el mes
 * LOCALES, no sobre los UTC: a las 20:00 del 31 de agosto en Bogotá ya es
 * primero de septiembre en UTC, y `new Date().getMonth()` daría el mes
 * equivocado justo los días en que más se consulta un informe.
 */
export function startOfLocalMonth(offsetMeses = 0, reference: Date = new Date()): Date {
  const [anio, mes] = formatInTimeZone(reference, TIME_ZONE, 'yyyy-MM').split('-').map(Number);
  const total = anio! * 12 + (mes! - 1) + offsetMeses;
  const anioDestino = Math.floor(total / 12);
  const mesDestino = (total % 12) + 1;
  return fromZonedTime(`${anioDestino}-${String(mesDestino).padStart(2, '0')}-01T00:00`, TIME_ZONE);
}

/** El primer instante del año en hora de Bogotá, como instante UTC. */
export function startOfLocalYear(reference: Date = new Date()): Date {
  const anio = formatInTimeZone(reference, TIME_ZONE, 'yyyy');
  return fromZonedTime(`${anio}-01-01T00:00`, TIME_ZONE);
}

/**
 * El lunes de la semana a la que pertenece un instante, en hora de Bogotá.
 *
 * La semana se corta en lunes a medianoche LOCAL. Cortarla en UTC mandaría los
 * domingos por la tarde —las 19:00 de Bogotá ya son las 00:00 del lunes UTC— a
 * la semana siguiente, que es justo el bucket con más consumo residencial.
 *
 * Colombia no tiene horario de verano, así que restar días sobre el calendario
 * local no arrastra corrimientos.
 */
export function startOfLocalWeek(iso: string): Date {
  const local = toZonedTime(new Date(iso), TIME_ZONE);
  // getDay() da 0 para domingo; acá la semana empieza en lunes.
  const diasDesdeLunes = (local.getDay() + 6) % 7;
  const lunes = new Date(local.getFullYear(), local.getMonth(), local.getDate() - diasDesdeLunes);
  return fromZonedTime(format(lunes, "yyyy-MM-dd'T'00:00"), TIME_ZONE);
}
