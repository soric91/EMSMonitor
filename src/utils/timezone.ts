import { fromZonedTime, toZonedTime } from 'date-fns-tz';
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
