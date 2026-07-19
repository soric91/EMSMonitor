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

export function hoursAgoLocalInput(hours: number): string {
  return utcIsoToLocalInput(new Date(Date.now() - hours * 3_600_000).toISOString());
}
