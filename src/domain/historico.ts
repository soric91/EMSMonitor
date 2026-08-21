import type { TimeSeriesPoint } from '../api/types';

/**
 * El troceado del histórico y la detección de vacíos de datos.
 *
 * Las dos cosas viven juntas porque salen del mismo hecho: el medidor no
 * siempre reporta. Cuando deja de hacerlo, el backend no inventa ventanas
 * vacías (`createEmpty: false`), y para un contador acumulativo eso tiene una
 * consecuencia que se ve en pantalla como un error de medición.
 */

/**
 * Cuántos puntos se piden por tramo.
 *
 * El backend rechaza con 400 cualquier consulta que pase de 5000 puntos. Se
 * pide por debajo de ese techo para que el troceo nunca dependa de acertarle
 * al límite exacto.
 */
export const PUNTOS_POR_TRAMO = 4000;

export interface Tramo {
  desde: string;
  hasta: string;
}

/**
 * Parte un rango en tramos que el backend sí acepta.
 *
 * Un día entero segundo a segundo son 86 400 puntos: diecisiete veces el techo
 * del servidor. En vez de negarle al usuario el detalle fino, se pide de a
 * pedazos y se va dibujando lo que llega — la pantalla responde desde el primer
 * tramo en vez de quedarse en blanco hasta que termine todo.
 *
 * Los tramos salen en orden cronológico: quien busca a qué hora pasó algo lee
 * de izquierda a derecha.
 */
export function trocear(desde: string, hasta: string, intervaloSegundos: number): Tramo[] {
  const inicio = new Date(desde).getTime();
  const fin = new Date(hasta).getTime();
  if (!(fin > inicio)) return [];

  const pasoMs = PUNTOS_POR_TRAMO * intervaloSegundos * 1000;
  const tramos: Tramo[] = [];
  for (let t = inicio; t < fin; t += pasoMs) {
    tramos.push({
      desde: new Date(t).toISOString(),
      hasta: new Date(Math.min(t + pasoMs, fin)).toISOString(),
    });
  }
  return tramos;
}

export interface PuntoConVacio extends TimeSeriesPoint {
  /**
   * Segundos sin lecturas justo antes de este punto, o `null` si viene pegado
   * al anterior. En un contador acumulativo, el valor de este punto NO es lo
   * consumido en su ventana: es todo lo acumulado durante el vacío.
   */
  vacioSegundos: number | null;
  /**
   * Si ese vacío es lo bastante grande como para avisar en pantalla.
   *
   * Un medidor que reporta cada segundo se salta uno de vez en cuando: en 80
   * minutos de datos reales hubo 475 saltos de 2 segundos y uno solo de 12
   * minutos. Marcar los 475 sería gritar por el ruido de siempre y que nadie
   * mire cuando el aviso importa.
   */
  vacioNotable: boolean;
}

/**
 * A partir de cuánto un vacío deja de ser el hipo normal del medidor.
 *
 * Diez ventanas —el punto pasa a valer diez veces lo que dice su etiqueta— y
 * nunca menos de un minuto, que es el piso por debajo del cual el desvío no
 * cambia ninguna lectura del panel.
 */
export function umbralDeAviso(intervaloSegundos: number): number {
  return Math.max(intervaloSegundos * 10, 60);
}

/**
 * Marca los puntos que vienen después de un hueco en los datos.
 *
 * Es la explicación del "pico imposible". El backend calcula la energía de una
 * ventana restando el contador al principio y al final; si el medidor estuvo
 * mudo siete horas, esa resta abarca las siete horas pero el resultado se
 * apunta en una sola ventana de quince minutos. La energía es REAL —se consumió
 * de verdad—, lo que está mal es el instante al que se le atribuye.
 *
 * No se corrige el número ni se esconde el punto: repartirlo entre las ventanas
 * ausentes sería inventar una curva que nadie midió, y borrarlo dejaría el
 * total del día por debajo de lo que marcó el medidor. Se señala, que es lo
 * único honesto que se puede hacer con él.
 */
export function marcarVacios(
  puntos: TimeSeriesPoint[],
  intervaloSegundos: number,
): PuntoConVacio[] {
  // Medio intervalo de tolerancia: las ventanas no caen al milisegundo y no se
  // trata de marcar cada redondeo.
  const umbralMs = intervaloSegundos * 1500;

  return puntos.map((punto, i) => {
    const previo = puntos[i - 1];
    if (!previo) return { ...punto, vacioSegundos: null, vacioNotable: false };

    const separacionMs = new Date(punto.time).getTime() - new Date(previo.time).getTime();
    const vacioSegundos = separacionMs > umbralMs ? Math.round(separacionMs / 1000) : null;
    return {
      ...punto,
      vacioSegundos,
      vacioNotable: vacioSegundos !== null && vacioSegundos >= umbralDeAviso(intervaloSegundos),
    };
  });
}

/** "7 h 30 min" a partir de los segundos del vacío. */
export function duracionLegible(segundos: number): string {
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.round((segundos % 3600) / 60);
  if (horas === 0) return `${minutos} min`;
  if (minutos === 0) return `${horas} h`;
  return `${horas} h ${minutos} min`;
}
