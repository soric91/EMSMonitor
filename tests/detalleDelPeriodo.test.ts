/**
 * El detalle de un periodo largo: semanas, día pico y hora pico.
 *
 * Todo se calcula sobre datos que el backend ya entrega, así que lo que hay
 * que probar son las decisiones: dónde se corta la semana, qué pasa con las
 * casillas sin lectura, cuándo el detalle no aplica — y que en ninguna función
 * se sume un peso.
 */

import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import {
  admiteDetalleSemanal,
  agruparPorSemana,
  diaDeMayorConsumo,
  espaciadoDeBuckets,
  horaDeMayorConsumo,
  horaPicoPorSemana,
  semanaDeMayorConsumo,
} from '../src/domain/detalleDelPeriodo';
import type { MergedEnergyPoint } from '../src/utils/mergeSeries';
import type { HeatmapResult, ReportData } from '../src/api/types';

/** Un bucket diario: medianoche de Bogotá es 05:00 UTC. */
function dia(fecha: string, consumo: number, exportado = 0): MergedEnergyPoint {
  return { time: `${fecha}T05:00:00.000Z`, label: fecha, a: consumo, b: exportado };
}

/** Los buckets diarios de todo agosto de 2026. */
function agosto(consumoPorDia = 10): MergedEnergyPoint[] {
  return Array.from({ length: 31 }, (_, i) =>
    dia(`2026-08-${String(i + 1).padStart(2, '0')}`, consumoPorDia),
  );
}

describe('agruparPorSemana', () => {
  test('un mes se parte en semanas de lunes a domingo, con las puntas parciales', () => {
    const semanas = agruparPorSemana(agosto());

    // Agosto de 2026 arranca sábado: la primera semana trae 2 días y la
    // última (lunes 31) uno solo.
    expect(semanas.length).toBe(6);
    expect(semanas[0]!.buckets).toBe(2);
    expect(semanas.at(-1)!.buckets).toBe(1);
  });

  test('la energía de cada semana es la suma de sus buckets', () => {
    const semanas = agruparPorSemana(agosto(10));

    expect(semanas[1]!.buckets).toBe(7);
    expect(semanas[1]!.consumoKwh).toBe(70);
  });

  test('una semana parcial se rotula con sus fechas, no como semana completa', () => {
    const semanas = agruparPorSemana(agosto());

    // 1 y 2 de agosto: sábado y domingo de la semana que empezó el 27 de julio.
    expect(semanas[0]!.etiqueta).toBe('27 jul – 2 ago');
  });

  test('el domingo por la noche de Bogotá NO cae en la semana siguiente', () => {
    // 2026-08-03 es lunes. Las 19:00 del domingo 2 en Bogotá son las 00:00 del
    // lunes 3 en UTC: cortar la semana en UTC lo mandaría a la semana que no es.
    const domingoTarde: MergedEnergyPoint = {
      time: '2026-08-03T00:00:00.000Z',
      label: 'dom 19:00',
      a: 5,
      b: 0,
    };

    const semanas = agruparPorSemana([domingoTarde, dia('2026-08-03', 1)]);

    expect(semanas.length).toBe(2);
    expect(semanas[0]!.consumoKwh).toBe(5);
    expect(semanas[1]!.consumoKwh).toBe(1);
  });

  test('sin buckets no hay semanas', () => {
    expect(agruparPorSemana([])).toEqual([]);
  });
});

describe('diaDeMayorConsumo', () => {
  test('encuentra el bucket más alto', () => {
    const pico = diaDeMayorConsumo([
      dia('2026-08-01', 10),
      dia('2026-08-02', 42),
      dia('2026-08-03', 8),
    ]);

    expect(pico!.kwh).toBe(42);
    expect(pico!.time).toBe('2026-08-02T05:00:00.000Z');
  });

  test('con empate gana el más antiguo: el día pico no debe saltar de fecha', () => {
    const pico = diaDeMayorConsumo([dia('2026-08-01', 10), dia('2026-08-02', 10)]);

    expect(pico!.time).toBe('2026-08-01T05:00:00.000Z');
  });

  test('sin consumo devuelve null, no un día de cero', () => {
    expect(diaDeMayorConsumo([dia('2026-08-01', 0), dia('2026-08-02', 0)])).toBeNull();
    expect(diaDeMayorConsumo([])).toBeNull();
  });
});

describe('semanaDeMayorConsumo', () => {
  test('dice cuánto se apartó del promedio del periodo', () => {
    const semanas = agruparPorSemana([
      dia('2026-08-03', 10),
      dia('2026-08-10', 30),
      dia('2026-08-17', 20),
    ]);

    const peor = semanaDeMayorConsumo(semanas)!;

    expect(peor.semana.consumoKwh).toBe(30);
    // 30 contra una media de 20: la mitad por encima.
    expect(peor.deltaSobreMedia).toBeCloseTo(0.5, 5);
  });

  test('una sola semana no tiene contra qué compararse', () => {
    const peor = semanaDeMayorConsumo(agruparPorSemana([dia('2026-08-03', 10)]))!;

    expect(peor.deltaSobreMedia).toBeNull();
  });

  test('un periodo sin consumo no tiene semana pico', () => {
    expect(semanaDeMayorConsumo(agruparPorSemana([dia('2026-08-03', 0)]))).toBeNull();
  });
});

describe('las horas pico', () => {
  const heatmap = (dates: string[], values: (number | null)[][]): HeatmapResult => ({
    device_id: 'eq-1',
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-09-01T05:00:00Z',
    metric: 'import',
    unit: 'kWh',
    dates,
    values,
  });

  /** 24 horas con un valor en la hora indicada y nada en el resto. */
  const fila = (hora: number, valor: number | null): (number | null)[] =>
    Array.from({ length: 24 }, (_, h) => (h === hora ? valor : null));

  test('la hora pico sale del máximo del mapa, con su fecha', () => {
    const pico = horaDeMayorConsumo(
      heatmap(['2026-08-10', '2026-08-11'], [fila(19, 4.2), fila(7, 9.1)]),
    );

    expect(pico!.hora).toBe(7);
    expect(pico!.kwh).toBe(9.1);
    expect(pico!.fecha).toBe('2026-08-11');
  });

  test('las casillas sin lectura no cuentan como cero', () => {
    // Una hora sin dato no es una hora de consumo nulo: si contara como 0,
    // hundiría el promedio y podría tapar el pico real.
    const soloNulos = heatmap(['2026-08-10'], [fila(0, null)]);

    expect(horaDeMayorConsumo(soloNulos)).toBeNull();
  });

  test('un mapa vacío no tiene hora pico', () => {
    expect(horaDeMayorConsumo(heatmap([], []))).toBeNull();
  });

  test('cada semana tiene la suya, indexada por su lunes', () => {
    // 10 y 11 de agosto son lunes y martes; el 17, el lunes siguiente.
    const mapa = horaPicoPorSemana(
      heatmap(['2026-08-10', '2026-08-11', '2026-08-17'], [fila(19, 4), fila(20, 6), fila(8, 3)]),
    );

    expect(mapa.size).toBe(2);
    expect(mapa.get('2026-08-10T05:00:00.000Z')!.hora).toBe(20);
    expect(mapa.get('2026-08-17T05:00:00.000Z')!.hora).toBe(8);
  });

  test('una semana sin ninguna lectura no aparece en el mapa', () => {
    const mapa = horaPicoPorSemana(
      heatmap(['2026-08-10', '2026-08-17'], [fila(19, 4), fila(19, null)]),
    );

    expect(mapa.size).toBe(1);
    expect(mapa.has('2026-08-17T05:00:00.000Z')).toBe(false);
  });
});

describe('cuándo aplica el detalle', () => {
  const reporte = (inicio: string, fin: string, buckets: string[]): ReportData =>
    ({
      period_start: inicio,
      period_end: fin,
      consumption_series: buckets.map((time) => ({ time, value: 1 })),
    }) as ReportData;

  const diarios = (desde: number, cuantos: number): string[] =>
    Array.from(
      { length: cuantos },
      (_, i) => `2026-08-${String(desde + i).padStart(2, '0')}T05:00:00.000Z`,
    );

  test('un reporte de un día no tiene semanas que comparar', () => {
    expect(
      admiteDetalleSemanal(
        reporte('2026-08-20T05:00:00Z', '2026-08-21T05:00:00Z', [
          '2026-08-20T05:00:00.000Z',
          '2026-08-20T06:00:00.000Z',
        ]),
      ),
    ).toBe(false);
  });

  test('un mes con buckets diarios sí', () => {
    expect(
      admiteDetalleSemanal(reporte('2026-08-01T05:00:00Z', '2026-09-01T05:00:00Z', diarios(1, 31))),
    ).toBe(true);
  });

  test('un rango personalizado de dos meses también: manda la duración, no el nombre', () => {
    const buckets = Array.from({ length: 60 }, (_, i) =>
      new Date(Date.UTC(2026, 6, 1, 5) + i * 86_400_000).toISOString(),
    );

    expect(
      admiteDetalleSemanal(reporte('2026-07-01T05:00:00Z', '2026-08-30T05:00:00Z', buckets)),
    ).toBe(true);
  });

  test('un reporte anual llega con buckets mensuales: agruparlos por semana no diría nada', () => {
    const mensuales = Array.from({ length: 12 }, (_, i) =>
      new Date(Date.UTC(2026, i, 1, 5)).toISOString(),
    );

    expect(
      admiteDetalleSemanal(reporte('2026-01-01T05:00:00Z', '2027-01-01T05:00:00Z', mensuales)),
    ).toBe(false);
  });

  test('sin series no se puede saber el bucketing, así que no se ofrece', () => {
    expect(admiteDetalleSemanal(reporte('2026-08-01T05:00:00Z', '2026-09-01T05:00:00Z', []))).toBe(
      false,
    );
  });
});

describe('espaciadoDeBuckets', () => {
  test('devuelve la mediana del salto entre buckets', () => {
    const puntos = diariosComoPuntos(['2026-08-01', '2026-08-02', '2026-08-03']);

    expect(espaciadoDeBuckets(puntos)).toBe(86_400_000);
  });

  test('un solo punto no define espaciado', () => {
    expect(espaciadoDeBuckets(diariosComoPuntos(['2026-08-01']))).toBeNull();
  });

  test('un hueco aislado no arrastra la mediana', () => {
    // Cuatro días seguidos y un salto de una semana: la mediana sigue diciendo
    // "un día", que es el bucketing real.
    const puntos = diariosComoPuntos(['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-10']);

    expect(espaciadoDeBuckets(puntos)).toBe(86_400_000);
  });
});

describe('la regla del dinero', () => {
  test('el módulo no suma pesos en ninguna parte', () => {
    // El crédito por exportar se reparte en tramos contra lo importado del MES:
    // un total semanal en pesos armado acá no cuadraría con la factura.
    const fuente = readFileSync('src/domain/detalleDelPeriodo.ts', 'utf8');

    expect(fuente).not.toContain('cop');
    expect(fuente).not.toContain('Cop');
  });
});

function diariosComoPuntos(fechas: string[]): { time: string }[] {
  return fechas.map((f) => ({ time: `${f}T05:00:00.000Z` }));
}
