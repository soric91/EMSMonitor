/**
 * Guard de unicidad de helpers (F5.2).
 *
 * Los helpers/componentes base viven en `src/utils` y `src/components/ui`.
 * Si una página vuelve a definir su propia versión (mergeSeries, monthLabel,
 * NOT_APPLICABLE, downloadCsv, ORDEN_FASE) o el efecto de "cerrar al hacer
 * click fuera", el helper compartido deja de ser la única fuente y la
 * divergencia silenciosa regresa. Este test es un grep sobre el fuente: no
 * tiene que ejecutar nada de esos archivos, solo comprobar que no definen
 * lo que ya no les toca.
 */

import { describe, expect, test } from '@rstest/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

function fuente(dir: string, archivo: string): string {
  return readFileSync(join(SRC, dir, archivo), 'utf8');
}

describe('cada helper vive una sola vez', () => {
  test('nadie redefine monthLabel fuera de utils/labels', () => {
    const redefined = ['CostoDelPeriodo', 'CostBreakdownSummary', 'AnalyticsSummary']
      .map((c) => `components/dashboard/${c}.tsx`)
      .filter((ruta) => /function monthLabel\(/.test(fuente('', ruta)));
    const pdf = fuente('utils', 'analyticsSummaryPdf.ts');
    if (/function monthLabel\(/.test(pdf)) redefined.push('utils/analyticsSummaryPdf.ts');

    expect(redefined).toEqual([]);
  });

  test('mergeSeries y downloadCsv no se reescriben en las páginas', () => {
    const conMerge = ['pages/Reports.tsx', 'pages/ConsumptionExport.tsx'].filter((ruta) =>
      /function mergeSeries\(/.test(fuente('', ruta)),
    );
    const conCsv = ['pages/Reports.tsx', 'pages/History.tsx'].filter((ruta) =>
      /function downloadCsv\(/.test(fuente('', ruta)),
    );

    expect(conMerge).toEqual([]);
    expect(conCsv).toEqual([]);
  });

  test('NOT_APPLICABLE es el de utils/labels, no un const local', () => {
    const locales = ['pages/Reports.tsx', 'pages/Analytics.tsx'].filter((ruta) =>
      /const NOT_APPLICABLE/.test(fuente('', ruta)),
    );

    expect(locales).toEqual([]);
  });

  test('el agrupado por magnitud sale solo de types/variable', () => {
    const redefined = ['context/VariablesContext.tsx', 'hooks/useVariablesDelMedidor.ts'].filter(
      (ruta) => /const ORDEN_FASE[=\s]/.test(fuente('', ruta)),
    );

    expect(redefined).toEqual([]);
  });

  test('cerrar al click fuera es el hook, no el efecto copiado', () => {
    const conEfecto = [
      'components/layout/NoticeBell.tsx',
      'components/layout/AlertsBell.tsx',
      'components/layout/SelectorDeMedidor.tsx',
    ].filter((ruta) => /document\.addEventListener\('mousedown'/.test(fuente('', ruta)));

    expect(conEfecto).toEqual([]);
  });

  test('la píldora animada (layoutId) solo existe en TabPills', () => {
    const conLayout = [
      'pages/Reports.tsx',
      'pages/ConsumptionExport.tsx',
      'components/dashboard/LiveVariableChart.tsx',
    ].filter((ruta) => /motion\.span[^>]*layoutId=/.test(fuente('', ruta)));

    expect(conLayout).toEqual([]);
  });

  test('la onda pulsante (animate scale) solo existe en OnlineDot', () => {
    const conOnda = [
      'components/layout/Topbar.tsx',
      'components/layout/NoticeBell.tsx',
      'components/dashboard/LiveVariableChart.tsx',
    ].filter((ruta) => /animate=\{\{\s*scale: \[1, 2/.test(fuente('', ruta)));

    expect(conOnda).toEqual([]);
  });

  test('las tarjetas de dinero importan el MISMO CostBreakdownSummary', () => {
    const re = /import \{[^}]*CostBreakdownSummary[^}]*\} from '([^']+)'/;
    const modulos = ['pages/Reports.tsx', 'pages/ConsumptionExport.tsx'].map((ruta) => {
      const m = fuente('', ruta).match(re);
      return m?.[1] ?? null;
    });

    // Un solo módulo, y una página que definiera la suya dejaría de importarlo.
    expect(modulos).toEqual([
      '../components/dashboard/CostBreakdownSummary',
      '../components/dashboard/CostBreakdownSummary',
    ]);
    const copias = ['pages/Reports.tsx', 'pages/ConsumptionExport.tsx'].filter((ruta) =>
      /function CostBreakdownSummary\(/.test(fuente('', ruta)),
    );
    expect(copias).toEqual([]);
  });

  test('MetricsGrid sale de components/ui y no se reescribe en las páginas', () => {
    const importados = ['pages/Reports.tsx', 'pages/ConsumptionExport.tsx', 'pages/Analytics.tsx']
      .map((ruta) => {
        const m = fuente('', ruta).match(/import \{[^}]*MetricsGrid[^}]*\} from '([^']+)'/);
        return m?.[1] ?? null;
      })
      .filter((mod): mod is string => mod !== null);

    // Quien usa la grid la importa del módulo compartido (ConsumptionExport no
    // la usa: ahí las tarjetas de dinero son CostBreakdownSummary).
    expect(importados).toEqual(['../components/ui/MetricsGrid', '../components/ui/MetricsGrid']);
    const copias = [
      'pages/Reports.tsx',
      'pages/ConsumptionExport.tsx',
      'pages/Analytics.tsx',
    ].filter((ruta) => /function MetricsGrid\(/.test(fuente('', ruta)));
    expect(copias).toEqual([]);
  });
});
