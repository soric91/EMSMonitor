import { formatInTimeZone } from 'date-fns-tz';
import { es } from 'date-fns/locale';

const TIME_ZONE = 'America/Bogota';

/**
 * Un valor con su unidad.
 *
 * Recibe la unidad y no el nombre de la variable: antes la buscaba en una
 * tabla local, que devolvía `undefined` —y reventaba— para cualquier variable
 * que el cliente tuviera cargada y la tabla no conociera. La unidad llega del
 * backend junto al valor, así que no hay nada que buscar.
 */
export function formatVariableValue(unidad: string, value: number): string {
  if (unidad === 'W') return formatWatts(value);
  if (unidad === 'kW') return `${value.toFixed(2)} kW`;
  if (unidad === 'kWh') return formatEnergia(value);
  if (unidad === '') return value.toFixed(2);
  return `${value.toFixed(2)} ${unidad}`;
}

/**
 * Energía con la unidad que le queda bien a su tamaño.
 *
 * En el histórico al segundo, un consumo normal son 0,00019 kWh por ventana:
 * dos decimales lo muestran como cero y la gráfica queda plana justo cuando se
 * la está mirando para encontrar algo. Por debajo de 0,01 kWh se pasa a Wh, que
 * es la misma medida dicha en la escala en que se lee.
 */
export function formatEnergia(value: number): string {
  const abs = Math.abs(value);
  if (abs > 0 && abs < 0.01) return `${(value * 1000).toFixed(2)} Wh`;
  return `${value.toFixed(2)} kWh`;
}

export function formatWatts(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${(value / 1000).toFixed(2)} kW`;
  }
  return `${value.toFixed(0)} W`;
}

/**
 * Una potencia llevada a vatios, según la unidad que declara el catálogo.
 *
 * `formatWatts` y los umbrales del panel razonan en vatios, pero el medidor
 * puede reportar en kW —`TotW` lo hace— y entonces el número crudo está mil
 * veces desfasado. Pasarlo sin convertir mostraba 80 W como `0 W` y dejaba el
 * flujo en "neutro" para siempre, porque `> 1` comparaba vatios contra kW.
 *
 * La unidad viene del backend, no de una tabla local: la que no se reconoce se
 * devuelve tal cual en vez de adivinar un factor.
 */
export function enWatts(value: number, unidad: string): number {
  if (unidad === 'kW') return value * 1000;
  if (unidad === 'MW') return value * 1_000_000;
  return value;
}

export function formatKwh(value: number): string {
  return `${value.toFixed(2)} kWh`;
}

/**
 * Una fecha del backend en hora de Bogotá y en español.
 *
 * El locale va explícito: sin él date-fns cae en inglés y el panel mezclaba
 * "1 Aug 2026" en la franja del reporte con "ago. 2026" en las tarjetas de
 * costo, que salen de `Intl` con locale es-CO.
 */
export function formatLocalDateTime(iso: string, formatStr = 'd MMM, HH:mm:ss'): string {
  return formatInTimeZone(new Date(iso), TIME_ZONE, formatStr, { locale: es });
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const COP_FORMAT = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export function formatCop(value: number): string {
  return COP_FORMAT.format(value);
}
