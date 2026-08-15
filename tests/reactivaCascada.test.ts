/**
 * La cascada diaria de la página de reactiva: partir un rango largo en trozos
 * de un día (para que InfluxDB no reciba una consulta gigante que se queda sin
 * tiempo) y combinar los resultados sin perder datos.
 */

import { describe, expect, test } from '@rstest/core';
import { combinarResultados, dividirEnDias } from '../src/utils/reactivaCascada';
import type { ReactiveQuadrantsResult } from '../src/api/types';

describe('dividirEnDias', () => {
  test('un rango de hasta 24h queda en una sola pieza', () => {
    const trozos = dividirEnDias('2026-08-01T00:00:00Z', '2026-08-01T12:00:00Z');
    expect(trozos).toHaveLength(1);
  });

  test('un rango de varios días se parte por día, contiguo y sin huecos', () => {
    const trozos = dividirEnDias('2026-08-01T00:00:00Z', '2026-08-03T10:00:00Z');
    expect(trozos).toHaveLength(3);
    // El formato puede venir normalizado (.000Z): se compara por instante.
    expect(Date.parse(trozos[0]!.from)).toBe(Date.parse('2026-08-01T00:00:00Z'));
    expect(Date.parse(trozos[0]!.to)).toBe(Date.parse('2026-08-02T00:00:00Z'));
    expect(Date.parse(trozos[1]!.from)).toBe(Date.parse('2026-08-02T00:00:00Z'));
    expect(Date.parse(trozos[1]!.to)).toBe(Date.parse('2026-08-03T00:00:00Z'));
    // El último trozo termina exactamente en `to`.
    expect(Date.parse(trozos[2]!.to)).toBe(Date.parse('2026-08-03T10:00:00Z'));
  });
});

describe('combinarResultados', () => {
  const dia1: ReactiveQuadrantsResult = {
    period_start: '2026-08-01T00:00:00Z',
    period_end: '2026-08-02T00:00:00Z',
    device_id: 'eq-1',
    q1_kvarh: 10,
    q2_kvarh: 2,
    q3_kvarh: 1,
    q4_kvarh: 0,
    total_import_kvarh: 12,
    total_export_kvarh: 1,
    balance_kvarh: 11,
    dominant: 'q1',
    dominant_kvarh: 10,
    trend: [
      { time: '2026-08-01T01:00:00Z', q1_kvarh: 5, q2_kvarh: 0, q3_kvarh: 0, q4_kvarh: 0 },
      { time: '2026-08-01T02:00:00Z', q1_kvarh: 5, q2_kvarh: 2, q3_kvarh: 1, q4_kvarh: 0 },
    ],
  };

  const dia2: ReactiveQuadrantsResult = {
    period_start: '2026-08-02T00:00:00Z',
    period_end: '2026-08-03T00:00:00Z',
    device_id: 'eq-1',
    q1_kvarh: 4,
    q2_kvarh: 6,
    q3_kvarh: 2,
    q4_kvarh: 3,
    total_import_kvarh: 10,
    total_export_kvarh: 5,
    balance_kvarh: 5,
    dominant: 'q2',
    dominant_kvarh: 6,
    trend: [
      { time: '2026-08-02T01:00:00Z', q1_kvarh: 4, q2_kvarh: 6, q3_kvarh: 2, q4_kvarh: 3 },
    ],
  };

  test('suma los totales y vuelve a calcular el cuadrante dominante', () => {
    const resultado = combinarResultados([dia1, dia2]);

    expect(resultado.q1_kvarh).toBe(14);
    expect(resultado.q2_kvarh).toBe(8);
    expect(resultado.q3_kvarh).toBe(3);
    expect(resultado.q4_kvarh).toBe(3);
    expect(resultado.total_import_kvarh).toBe(22);
    expect(resultado.total_export_kvarh).toBe(6);
    expect(resultado.balance_kvarh).toBe(16);
    expect(resultado.dominant).toBe('q1');
    expect(resultado.dominant_kvarh).toBe(14);
  });

  test('concatena la tendencia ordenada por tiempo', () => {
    const resultado = combinarResultados([dia2, dia1]); // desordenado a propósito

    const tiempos = resultado.trend.map((p) => p.time);
    expect(tiempos).toEqual([
      '2026-08-01T01:00:00Z',
      '2026-08-01T02:00:00Z',
      '2026-08-02T01:00:00Z',
    ]);
  });
});
