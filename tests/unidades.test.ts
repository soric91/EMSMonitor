/**
 * La conversión de potencia a vatios.
 *
 * El medidor reporta `TotW` en kW y el panel razona en vatios. Sin convertir,
 * 80 W se mostraban como `0 W` —`0.08.toFixed(0)`— y el flujo quedaba en
 * "Sin flujo neto" para siempre, porque el umbral `> 1` comparaba vatios
 * contra kW: hacían falta 1000 W para cruzarlo.
 */

import { describe, expect, test } from '@rstest/core';
import { enWatts, formatWatts } from '../src/utils/format';

describe('llevar una potencia a vatios', () => {
  test('el caso que se vio en pantalla: 0.08 kW son 80 W', () => {
    expect(enWatts(0.08, 'kW')).toBeCloseTo(80);
    expect(formatWatts(enWatts(0.08, 'kW'))).toBe('80 W');
  });

  test('sin convertir se perdía del todo', () => {
    // La regresión concreta, para que quede escrito qué se rompía.
    expect(formatWatts(0.08)).toBe('0 W');
  });

  test('en vatios no se toca', () => {
    expect(enWatts(80, 'W')).toBe(80);
  });

  test('el signo se conserva: exportar sigue siendo negativo', () => {
    // Si se perdiera, el panel diría "importando" mientras el cliente inyecta.
    expect(enWatts(-0.08, 'kW')).toBeCloseTo(-80);
  });

  test('cruza el umbral de flujo, que es 1 W', () => {
    expect(Math.abs(enWatts(0.08, 'kW'))).toBeGreaterThan(1);
    expect(Math.abs(0.08)).toBeLessThan(1); // antes no lo cruzaba
  });

  test('una unidad desconocida se devuelve tal cual en vez de adivinar', () => {
    // Inventar un factor sería peor que mostrar el número crudo: el error
    // quedaría escondido detrás de una cifra plausible.
    expect(enWatts(42, 'kVAr')).toBe(42);
    expect(enWatts(42, '')).toBe(42);
  });
});
