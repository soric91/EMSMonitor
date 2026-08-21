/**
 * La convención de periodos vive en un solo lado.
 *
 * Antes "day" (tabs) y "daily" (ruta /reports) eran dos strings que cada página
 * bridgaba con su propio mapeo — PERIOD_TO_REPORT_TYPE. Aquí se garantiza que
 * el enum de domain es el único lugar y que el cliente de API resuelve las
 * rutas sin copias.
 */

import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatoDeBucket, toReportPath, validarRango, type Period } from '../src/domain/periods';

const PERIODOS: Period[] = ['day', 'week', 'month', 'year', 'custom'];

describe('toReportPath', () => {
  test('cada periodo produce la ruta exacta del backend', () => {
    const esperado: Record<Period, string> = {
      day: '/reports/daily',
      week: '/reports/weekly',
      month: '/reports/monthly',
      year: '/reports/yearly',
      custom: '/reports/custom',
    };

    for (const p of PERIODOS) {
      expect(toReportPath(p)).toBe(esperado[p]);
    }
  });

  test('la correspondencia es biyectiva (no dos periodos al mismo reporte)', () => {
    const rutas = PERIODOS.map(toReportPath);
    expect(new Set(rutas).size).toBe(PERIODOS.length);
  });
});

describe('donde se traduce', () => {
  test('el mapeo manual PERIOD_TO_REPORT_TYPE ya no existe', () => {
    const reportes = readFileSync(join(process.cwd(), 'src/pages/Reports.tsx'), 'utf8');

    expect(reportes).not.toContain('PERIOD_TO_REPORT_TYPE');
  });

  test('getReport delega en toReportPath (un solo origen de rutas)', () => {
    const reports = readFileSync(join(process.cwd(), 'src/api/reports.ts'), 'utf8');

    expect(reports).toContain('toReportPath');
    // Un literal de ruta `/reports/daily` dentro del cliente sería una segunda
    // copia del mapeo.
    expect(reports).not.toMatch(/\/reports\/[a-z]+/);
  });
});

describe('formatoDeBucket', () => {
  /** Un rango que empieza `horas` antes de un instante fijo y termina en él. */
  function rango(horas: number): [string, string] {
    const fin = new Date('2026-08-20T12:00:00Z');
    const inicio = new Date(fin.getTime() - horas * 3_600_000);
    return [inicio.toISOString(), fin.toISOString()];
  }

  test('cada periodo fijo cae en el formato que le corresponde', () => {
    expect(formatoDeBucket(...rango(24))).toBe('HH:mm'); // día
    expect(formatoDeBucket(...rango(24 * 7))).toBe('EEE d'); // semana
    expect(formatoDeBucket(...rango(24 * 30))).toBe('d MMM'); // mes
    expect(formatoDeBucket(...rango(24 * 365))).toBe('MMM yyyy'); // año
  });

  test('un rango personalizado corto se rotula por hora y uno largo por mes', () => {
    // El caso que la tabla por periodo no podía distinguir: los dos son
    // report_type "custom".
    expect(formatoDeBucket(...rango(3))).toBe('HH:mm');
    expect(formatoDeBucket(...rango(24 * 240))).toBe('MMM yyyy');
  });

  test('los cortes se deciden en su frontera exacta', () => {
    expect(formatoDeBucket(...rango(47.9))).toBe('HH:mm');
    expect(formatoDeBucket(...rango(48))).toBe('EEE d');
    expect(formatoDeBucket(...rango(24 * 10 - 0.1))).toBe('EEE d');
    expect(formatoDeBucket(...rango(24 * 10))).toBe('d MMM');
    expect(formatoDeBucket(...rango(24 * 90 - 0.1))).toBe('d MMM');
    expect(formatoDeBucket(...rango(24 * 90))).toBe('MMM yyyy');
  });
});

describe('validarRango', () => {
  const AYER = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const AHORA = new Date().toISOString();

  test('un rango normal pasa', () => {
    expect(validarRango(AYER, AHORA)).toBeNull();
  });

  test('el rango invertido se rechaza acá, no en el backend', () => {
    expect(validarRango(AHORA, AYER)).toBe('invertido');
  });

  test('un rango de duración cero no es un reporte', () => {
    expect(validarRango(AHORA, AHORA)).toBe('vacio');
  });

  test('un rango que empieza mañana no tiene lecturas que traer', () => {
    const manana = new Date(Date.now() + 24 * 3_600_000).toISOString();
    const pasado = new Date(Date.now() + 48 * 3_600_000).toISOString();

    expect(validarRango(manana, pasado)).toBe('futuro');
  });
});
