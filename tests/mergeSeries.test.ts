/**
 * Junta las series de importado/exportado para el gráfico de barras dobles.
 */

import { describe, expect, test } from '@rstest/core';
import { mergeSeries } from '../src/utils/mergeSeries';
import type { EnergyPoint } from '../src/api/types';

const P = (time: string, value: number): EnergyPoint => ({ time, value });

describe('mergeSeries', () => {
  test('mezcla importado y exportado en el mismo bucket', () => {
    const resultado = mergeSeries([P('t1', 10), P('t2', 5)], [P('t1', 20), P('t2', 15)], (t) => t);

    expect(resultado).toEqual([
      { time: 't1', label: 't1', a: 10, b: 20 },
      { time: 't2', label: 't2', a: 5, b: 15 },
    ]);
  });

  test('un point que solo aparece en un lado completa el otro con cero', () => {
    // La exportación no publica en cada bucket: falta t3.
    const resultado = mergeSeries([P('t1', 10), P('t3', 7)], [P('t1', 4)], (t) => t);

    expect(resultado).toEqual([
      { time: 't1', label: 't1', a: 10, b: 4 },
      { time: 't3', label: 't3', a: 7, b: 0 },
    ]);
  });

  test('ignora puntos duplicados del mismo lado (ultimo gana)', () => {
    const resultado = mergeSeries([P('t1', 1), P('t1', 2)], [P('t1', 5)], (t) => t);

    expect(resultado).toEqual([{ time: 't1', label: 't1', a: 2, b: 5 }]);
  });

  test('ordena por tiempo sin importar el orden de llegada', () => {
    const resultado = mergeSeries([P('t3', 3), P('t1', 1)], [P('t2', 2)], (t) => t);

    expect(resultado.map((p) => p.label)).toEqual(['t1', 't2', 't3']);
  });

  test('etiqueta con el formateador recibido', () => {
    const resultado = mergeSeries([P('t1', 1)], [P('t1', 2)], (t) => `[${t}]`);

    expect(resultado[0]?.label).toBe('[t1]');
  });
});
