/**
 * Los tres informes en PDF: que se dibujen, que tengan la anatomía completa y
 * que no se salgan de la hoja.
 *
 * No se puede "mirar" un PDF desde un test, pero sí se pueden verificar las
 * tres cosas que fallan de verdad: que falte una sección obligatoria, que el
 * contenido se pinte encima del pie —jsPDF no avisa, dibuja donde se le diga—
 * y que el texto quede ilegible por caracteres que la fuente no tiene.
 */

import { describe, expect, test } from '@rstest/core';
import { jsPDF } from 'jspdf';
import type {
  AnalyticsSummary,
  CostBreakdown,
  ReactiveQuadrantsResult,
  ReportData,
} from '../src/api/types';
import type { DatosInformeMensual } from '../src/domain/informeMensual';
import { renderAnalyticsSummary } from '../src/utils/analyticsSummaryPdf';
import { renderMonthlyReport } from '../src/utils/monthlyReportPdf';
import { renderReactiveQuadrants } from '../src/utils/reactiveQuadrantsPdf';
import { BOTTOM_LIMIT, PAGE_H, PAGE_W, t } from '../src/utils/pdfKit';

function nuevoPdf(): jsPDF {
  return new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
}

const RESUMEN: AnalyticsSummary = {
  period_start: '2026-07-11T05:00:00Z',
  period_end: '2026-08-10T05:00:00Z',
  device_id: 'eq-1',
  consumption_daily_kwh: 12.4,
  consumption_weekly_kwh: 88,
  consumption_monthly_kwh: 380,
  export_daily_kwh: 1.8,
  export_monthly_kwh: 55,
  hourly_profile: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    power_avg_w: hour >= 9 && hour <= 15 ? -1200 : 800,
    power_max_w: 4200,
    power_min_w: -3000,
    sample_count: 30,
  })),
  peak_consumption_hour: 19,
  peak_export_hour: 12,
  efficiency: {
    tariff_month: '2026-08',
    stale: true,
    cu_cop_kwh: 859.19,
    excedente_cop_kwh: 114.34,
    export_kwh: 55,
    potential_savings_cop: 41000,
  },
};

const REACTIVA: ReactiveQuadrantsResult = {
  period_start: '2026-08-10T05:00:00Z',
  period_end: '2026-08-11T05:00:00Z',
  device_id: 'eq-1',
  q1_kvarh: 120,
  q2_kvarh: 12,
  q3_kvarh: 4,
  q4_kvarh: 1,
  total_import_kvarh: 132,
  total_export_kvarh: 5,
  balance_kvarh: 127,
  dominant: 'q1',
  dominant_kvarh: 120,
  trend: Array.from({ length: 48 }, (_, i) => ({
    time: `2026-08-10T${String(i % 24).padStart(2, '0')}:00:00Z`,
    q1_kvarh: 2 + (i % 5),
    q2_kvarh: 0.2,
    q3_kvarh: 0.1,
    q4_kvarh: 0,
  })),
};

const COSTO_MES: CostBreakdown = {
  period: 'custom',
  device_id: 'eq-1',
  period_start: '2026-08-01T05:00:00Z',
  period_end: '2026-08-31T05:00:00Z',
  consumption_kwh: 380,
  export_kwh: 55,
  consumption_cost_cop: 326492,
  export_credit_cop: 47255,
  net_cost_cop: 279237,
  export_tier1_kwh: 55,
  export_tier2_kwh: 0,
  export_tier1_credit_cop: 47255,
  export_tier2_credit_cop: 0,
  months_used: ['2026-08'],
  stale_months: ['2026-08'],
  series: [],
};

const REPORTE_MES: ReportData = {
  report_type: 'custom',
  device_id: 'eq-1',
  period_start: '2026-08-01T05:00:00Z',
  period_end: '2026-08-31T05:00:00Z',
  consumption_kwh: 380,
  export_kwh: 55,
  net_balance_kwh: 325,
  consumption_series: [],
  export_series: [],
  kpis: {
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    device_id: 'eq-1',
    power_avg_w: 520,
    power_max_w: 10000,
    voltage_avg_v: 121,
    voltage_min_v: 118,
    voltage_max_v: 124,
    current_avg_a: 4.3,
    power_factor_avg: 0.94,
    consumption_daily_kwh: 12,
    consumption_weekly_kwh: 84,
    consumption_monthly_kwh: 380,
    export_daily_kwh: 2,
    export_monthly_kwh: 55,
  },
  max_demand: {
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    device_id: 'eq-1',
    peak_power_w: 10000,
    peak_at: '2026-08-12T23:00:00Z',
  },
  load_factor: {
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    device_id: 'eq-1',
    average_import_w: 520,
    peak_import_w: 10000,
    load_factor: 0.052,
  },
  base_load: {
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    device_id: 'eq-1',
    percentile: 0.05,
    base_load_w: 180,
  },
  costs: COSTO_MES,
  generated_at: '2026-08-31T05:00:00Z',
};

/** Un mes con todas las secciones llenas: es el que puede desbordar la hoja. */
const MENSUAL_CARGADO: DatosInformeMensual = {
  mes: '2026-08',
  sede: 'Planta Norte · Tablero principal',
  reporte: REPORTE_MES,
  proyeccion: {
    month: '2026-08',
    device_id: 'eq-1',
    kwh_mtd: 380,
    export_mtd_kwh: 55,
    days_elapsed: 30,
    days_total: 31,
    kwh_projected: 392,
    kwh_p10: 380,
    kwh_p90: 405,
    export_projected_kwh: 57,
    cost_projected_cop: 288000,
    cost_p10_cop: 271000,
    cost_p90_cop: 302000,
    method: 'ewma_por_tipo_de_dia',
  },
  cobertura: {
    device_id: 'eq-1',
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    bucket_seconds: 3600,
    expected_per_bucket: 60,
    expected_source: 'declarado',
    overall_ratio: 0.93,
    incomplete_buckets: 21,
    points: [],
  },
  cargaBase: {
    device_id: 'eq-1',
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    percentile: 0.05,
    window: 'noche',
    points: [],
    current_w: 180,
    trend_delta_w: 45,
    monthly_kwh: 129.6,
    monthly_cost_cop: 116640,
    share_of_import: 0.34,
  },
  heatmap: {
    device_id: 'eq-1',
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    metric: 'import',
    unit: 'kWh',
    dates: Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`),
    values: Array.from({ length: 31 }, () => Array.from({ length: 24 }, (_, h) => h % 4)),
  },
  historial: {
    device_id: 'eq-1',
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    days_analyzed: 30,
    anomalies: Array.from({ length: 9 }, (_, i) => ({
      kind: 'daily_total' as const,
      severity: 'moderate' as const,
      device_id: 'eq-1',
      variable: 'TotWh_import',
      value: 40 + i,
      expected_low: 8,
      expected_high: 14,
      bucket: 1,
      timestamp: `2026-08-${String(i + 2).padStart(2, '0')}T05:00:00Z`,
      message: `Consumo del martes inusual: ${40 + i}.00 kWh (lo típico es entre 8.00 y 14.00 kWh)`,
    })),
    level_shift: {
      detected_at: '2026-08-03T05:00:00Z',
      before_kwh: 12.4,
      after_kwh: 19.8,
      delta_pct: 59.7,
      direction: 'up' as const,
      message:
        'Desde el 3 de agosto tu consumo diario subió de 12.4 a 19.8 kWh en un día típico, y se mantuvo ahí.',
    },
  },
  arquetipos: {
    device_id: 'eq-1',
    period_start: '2026-05-12T05:00:00Z',
    period_end: '2026-08-10T05:00:00Z',
    days_analyzed: 90,
    silhouette: 0.58,
    archetypes: [
      {
        label: 'Laboral',
        day_count: 64,
        avg_kwh: 18.2,
        hourly_share: Array.from({ length: 24 }, () => 1 / 24),
        weekdays: ['lunes', 'martes'],
      },
      {
        label: 'Fin de semana',
        day_count: 26,
        avg_kwh: 11.4,
        hourly_share: Array.from({ length: 24 }, () => 1 / 24),
        weekdays: ['sábado', 'domingo'],
      },
    ],
    assignments: [],
  },
  comparacion: {
    device_id: 'eq-1',
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    days: 30,
    own_kwh_per_day: 12.6,
    median_kwh_per_day: 10,
    percentile: 66.7,
    peers: Array.from({ length: 6 }, (_, i) => ({
      device_id: `eq-${i}`,
      name: `Sede ${i + 1}`,
      site: 'Norte',
      kwh_per_day: 5 + i * 2,
      is_self: i === 3,
    })),
    enough_peers: true,
  },
};

/** La banda donde vive el pie: ahí solo puede haber pie. */
const PIE_DESDE = PAGE_H - 44;

/**
 * Las posiciones verticales de todo el texto de cada página, medidas desde
 * arriba (como las usa el código; el PDF las guarda desde abajo).
 *
 * Se leen del flujo de contenido del propio documento: cada operador `Td`
 * lleva las coordenadas donde jsPDF puso ese texto. Es la forma de comprobar
 * sin abrir el archivo que nada quedó pisando el pie o fuera de la hoja —
 * jsPDF no avisa, dibuja donde se le diga.
 */
function alturasDeTexto(pdf: jsPDF): number[][] {
  const paginas = pdf.getNumberOfPages();
  const porPagina: number[][] = [];
  for (let page = 1; page <= paginas; page += 1) {
    const contenido =
      (pdf.internal as unknown as { pages: string[][] }).pages[page]?.join('\n') ?? '';
    const alturas: number[] = [];
    for (const match of contenido.matchAll(/([\d.]+) ([\d.]+) Td/g)) {
      alturas.push(PAGE_H - Number(match[2]));
    }
    porPagina.push(alturas);
  }
  return porPagina;
}

/** Cuánto texto de contenido invadió la banda del pie. */
function invasionesDelPie(pdf: jsPDF): number[] {
  return alturasDeTexto(pdf)
    .flat()
    .filter((altura) => altura > BOTTOM_LIMIT && altura < PIE_DESDE);
}

describe('el informe ejecutivo', () => {
  test('trae la anatomía completa de un informe de energía', () => {
    const secciones = renderAnalyticsSummary(nuevoPdf(), RESUMEN);

    // Alcance y metodología no son adornos: sin ellos, un tercero no sabe qué
    // se midió ni cómo se calculó lo que está leyendo.
    expect(secciones).toContain('energia');
    expect(secciones).toContain('perfil');
    expect(secciones).toContain('acciones');
    expect(secciones).toContain('metodologia');
  });

  test('ningún texto invade la banda del pie ni se sale de la hoja', () => {
    const pdf = nuevoPdf();
    renderAnalyticsSummary(pdf, RESUMEN);

    expect(invasionesDelPie(pdf)).toEqual([]);
    for (const altura of alturasDeTexto(pdf).flat()) {
      expect(altura).toBeLessThan(PAGE_H);
      expect(altura).toBeGreaterThan(0);
    }
  });

  test('el pie numera todas las páginas, no solo la última', () => {
    const pdf = nuevoPdf();
    renderAnalyticsSummary(pdf, RESUMEN);
    const paginas = pdf.getNumberOfPages();

    const contenido = (pdf.internal as unknown as { pages: string[][] }).pages;
    for (let page = 1; page <= paginas; page += 1) {
      expect(contenido[page]?.join('\n')).toContain('gina');
    }
  });
});

describe('el informe de reactiva', () => {
  test('trae resumen, lectura, acciones y metodología', () => {
    const secciones = renderReactiveQuadrants(nuevoPdf(), REACTIVA);

    expect(secciones).toEqual(['resumen', 'cuadrantes', 'lectura', 'acciones', 'metodologia']);
  });

  test('no deja contenido sobre el pie aunque el periodo traiga muchas ventanas', () => {
    const pdf = nuevoPdf();
    renderReactiveQuadrants(pdf, REACTIVA);

    expect(invasionesDelPie(pdf)).toEqual([]);
  });

  test('un periodo sin reactiva no rompe el informe', () => {
    const vacio: ReactiveQuadrantsResult = {
      ...REACTIVA,
      q1_kvarh: 0,
      q2_kvarh: 0,
      q3_kvarh: 0,
      q4_kvarh: 0,
      total_import_kvarh: 0,
      total_export_kvarh: 0,
      balance_kvarh: 0,
      dominant: null,
      dominant_kvarh: 0,
      trend: [],
    };

    expect(() => renderReactiveQuadrants(nuevoPdf(), vacio)).not.toThrow();
  });
});

describe('el informe mensual', () => {
  test('pagina cuando el mes trae muchas anomalías, en vez de pisar el pie', () => {
    const pdf = nuevoPdf();
    renderMonthlyReport(pdf, MENSUAL_CARGADO);

    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(invasionesDelPie(pdf)).toEqual([]);
  });

  test('el mapa de calor de un mes completo cabe', () => {
    const pdf = nuevoPdf();
    renderMonthlyReport(pdf, MENSUAL_CARGADO);

    for (const altura of alturasDeTexto(pdf).flat()) {
      expect(altura).toBeLessThan(PAGE_H);
    }
  });
});

describe('el texto de los informes', () => {
  test('los espacios que la fuente no tiene se reemplazan', () => {
    // Las fuentes estándar de jsPDF son WinAnsi: un espacio duro o angosto
    // —que el formateo es-CO mete en "$ 1.234"— sale como un carácter raro.
    expect(t('$ 1.234')).toBe('$ 1.234');
    expect(t('12 %')).toBe('12 %');
  });

  test('el límite inferior deja sitio para el pie', () => {
    expect(BOTTOM_LIMIT).toBeLessThan(PAGE_H - 40);
    expect(PAGE_W).toBeGreaterThan(0);
  });
});
