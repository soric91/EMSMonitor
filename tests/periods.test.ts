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
import { toReportPath, type Period } from '../src/domain/periods';

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
    const consumoExport = readFileSync(
      join(process.cwd(), 'src/pages/ConsumptionExport.tsx'),
      'utf8',
    );

    expect(consumoExport).not.toContain('PERIOD_TO_REPORT_TYPE');
  });

  test('getReport delega en toReportPath (un solo origen de rutas)', () => {
    const reports = readFileSync(join(process.cwd(), 'src/api/reports.ts'), 'utf8');

    expect(reports).toContain('toReportPath');
    // Un literal de ruta `/reports/daily` dentro del cliente sería una segunda
    // copia del mapeo.
    expect(reports).not.toMatch(/\/reports\/[a-z]+/);
  });
});
