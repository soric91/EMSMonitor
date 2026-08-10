import { describe, expect, it } from '@rstest/core';
import { toChartPoints } from '../src/components/charts/LiveLineChart';

describe('toChartPoints — puntos que alimentan la gráfica en vivo', () => {
  it('agrupa por segundo y ordena por tiempo', () => {
    const points = [
      { time: 3000, value: 30 },
      { time: 1000, value: 10 },
      { time: 1000, value: 11 }, // el último del mismo segundo gana
    ];
    expect(toChartPoints(points)).toEqual([
      { time: 1, value: 11 },
      { time: 3, value: 30 },
    ]);
  });

  it('descarta valores no finitos sin tumbar la serie', () => {
    const points = [
      { time: 1000, value: 10 },
      { time: 2000, value: Number.NaN },
      { time: 3000, value: Number.POSITIVE_INFINITY },
      { time: 4000, value: null as unknown as number },
      { time: 5000, value: 50 },
    ];
    expect(toChartPoints(points)).toEqual([
      { time: 1, value: 10 },
      { time: 5, value: 50 },
    ]);
  });

  it('descarta puntos con tiempo inválido', () => {
    const points = [
      { time: Number.NaN, value: 10 },
      { time: 7000, value: 70 },
    ];
    expect(toChartPoints(points)).toEqual([{ time: 7, value: 70 }]);
  });

  it('devuelve vacío si todo es basura', () => {
    expect(toChartPoints([{ time: Number.NaN, value: Number.NaN }])).toEqual([]);
  });
});
