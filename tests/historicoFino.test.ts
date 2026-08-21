/**
 * El histórico al detalle: troceado en cascada y vacíos de datos.
 *
 * Las dos cosas salen del mismo hecho — el medidor no siempre reporta, y a un
 * segundo un día no cabe en una consulta— y las dos se ven en pantalla como si
 * fueran errores de medición cuando no se explican.
 */

import { describe, expect, test } from '@rstest/core';
import { PUNTOS_POR_TRAMO, duracionLegible, marcarVacios, trocear } from '../src/domain/historico';
import type { TimeSeriesPoint } from '../src/api/types';

const punto = (time: string, value: number): TimeSeriesPoint => ({ time, value });

describe('trocear el rango', () => {
  test('un día a 15 min cabe en una sola consulta', () => {
    // 96 puntos: pedirlo en pedazos sería gastar viajes de más.
    const tramos = trocear('2026-08-09T05:00:00.000Z', '2026-08-10T05:00:00.000Z', 900);

    expect(tramos.length).toBe(1);
    expect(tramos[0]!.desde).toBe('2026-08-09T05:00:00.000Z');
    expect(tramos[0]!.hasta).toBe('2026-08-10T05:00:00.000Z');
  });

  test('un día segundo a segundo se parte en tramos que el backend acepta', () => {
    // 86 400 puntos contra un techo de 5 000: sin trocear era un 400 en la cara.
    const tramos = trocear('2026-08-09T05:00:00.000Z', '2026-08-10T05:00:00.000Z', 1);

    expect(tramos.length).toBe(Math.ceil(86400 / PUNTOS_POR_TRAMO));
    for (const t of tramos) {
      const puntos = (Date.parse(t.hasta) - Date.parse(t.desde)) / 1000;
      expect(puntos).toBeLessThanOrEqual(PUNTOS_POR_TRAMO);
    }
  });

  test('los tramos van en orden y sin huecos ni solapes', () => {
    const tramos = trocear('2026-08-09T05:00:00.000Z', '2026-08-09T09:00:00.000Z', 1);

    expect(tramos[0]!.desde).toBe('2026-08-09T05:00:00.000Z');
    expect(tramos.at(-1)!.hasta).toBe('2026-08-09T09:00:00.000Z');
    for (let i = 1; i < tramos.length; i++) {
      // El fin de uno es el principio del siguiente: ni se repite un punto ni
      // se pierde un segundo entre tramos.
      expect(tramos[i]!.desde).toBe(tramos[i - 1]!.hasta);
    }
  });

  test('el último tramo se recorta al fin pedido, no lo pasa', () => {
    const tramos = trocear('2026-08-09T05:00:00.000Z', '2026-08-09T06:00:00.000Z', 1);

    expect(Date.parse(tramos.at(-1)!.hasta)).toBe(Date.parse('2026-08-09T06:00:00.000Z'));
  });

  test('un rango invertido o vacío no produce tramos', () => {
    expect(trocear('2026-08-10T05:00:00Z', '2026-08-09T05:00:00Z', 60)).toEqual([]);
    expect(trocear('2026-08-09T05:00:00Z', '2026-08-09T05:00:00Z', 60)).toEqual([]);
  });
});

describe('los vacíos de datos', () => {
  test('una serie continua no marca nada', () => {
    const puntos = marcarVacios(
      [
        punto('2026-08-09T23:00:00Z', 0.13),
        punto('2026-08-09T23:15:00Z', 0.13),
        punto('2026-08-09T23:30:00Z', 0.14),
      ],
      900,
    );

    expect(puntos.every((p) => p.vacioSegundos === null)).toBe(true);
  });

  test('el pico imposible queda marcado con lo que duró el vacío', () => {
    // El caso real: la serie salta de las 19:00 a las 02:30 del día siguiente y
    // el backend le apunta a esa ventana de 15 min las 7 h 30 de energía que el
    // contador acumuló mientras el medidor estuvo mudo.
    const puntos = marcarVacios(
      [punto('2026-08-10T00:00:00Z', 0.14), punto('2026-08-10T07:30:00Z', 5.14)],
      900,
    );

    expect(puntos[0]!.vacioSegundos).toBeNull();
    expect(puntos[1]!.vacioSegundos).toBe(7.5 * 3600);
  });

  test('el valor no se toca: la energía es real, lo que falla es a qué hora se le apunta', () => {
    const puntos = marcarVacios(
      [punto('2026-08-10T00:00:00Z', 0.14), punto('2026-08-10T07:30:00Z', 5.14)],
      900,
    );

    // Repartirlo entre las ventanas ausentes sería inventar una curva que nadie
    // midió; borrarlo dejaría el total del día por debajo del contador.
    expect(puntos[1]!.value).toBe(5.14);
  });

  test('un desfase de segundos entre ventanas no es un vacío', () => {
    // Las ventanas no caen al milisegundo y no se trata de marcar cada redondeo.
    const puntos = marcarVacios(
      [punto('2026-08-10T00:00:00Z', 0.14), punto('2026-08-10T00:15:07Z', 0.15)],
      900,
    );

    expect(puntos[1]!.vacioSegundos).toBeNull();
  });

  test('el umbral escala con el intervalo elegido', () => {
    const dosMinutos = [punto('2026-08-10T00:00:00Z', 1), punto('2026-08-10T00:02:00Z', 1)];

    // A un segundo, dos minutos sin lecturas son un vacío enorme.
    expect(marcarVacios(dosMinutos, 1)[1]!.vacioSegundos).toBe(120);
    // A 15 minutos, es un punto que llegó antes de tiempo.
    expect(marcarVacios(dosMinutos, 900)[1]!.vacioSegundos).toBeNull();
  });

  test('una serie vacía o de un solo punto no revienta', () => {
    expect(marcarVacios([], 900)).toEqual([]);
    expect(marcarVacios([punto('2026-08-10T00:00:00Z', 1)], 900)[0]!.vacioSegundos).toBeNull();
  });
});

describe('cómo se dice la duración', () => {
  test('los vacíos se leen en horas y minutos, no en segundos', () => {
    expect(duracionLegible(7.5 * 3600)).toBe('7 h 30 min');
    expect(duracionLegible(3600)).toBe('1 h');
    expect(duracionLegible(900)).toBe('15 min');
  });
});
