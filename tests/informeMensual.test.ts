/**
 * F3.4 — qué entra en el informe mensual y qué no.
 *
 * La regla es la misma de todo el panel: no se dibuja lo que el dato no
 * sostiene. En un informe que alguien archiva, una sección vacía es peor que
 * su ausencia — parece que el mes no tuvo consumo, no que faltaba historia.
 */

import { describe, expect, test } from '@rstest/core';
import { seccionesDelInforme } from '../src/domain/informeMensual';
import type { DatosInformeMensual } from '../src/domain/informeMensual';
import type { CostBreakdown, ReportData } from '../src/api/types';

const COSTO: CostBreakdown = {
  period: 'custom',
  device_id: 'eq-1',
  period_start: '2026-08-01T05:00:00Z',
  period_end: '2026-08-31T05:00:00Z',
  consumption_kwh: 120,
  export_kwh: 30,
  consumption_cost_cop: 103102,
  export_credit_cop: 25776,
  net_cost_cop: 77326,
  export_tier1_kwh: 30,
  export_tier2_kwh: 0,
  export_tier1_credit_cop: 25776,
  export_tier2_credit_cop: 0,
  months_used: ['2026-08'],
  stale_months: [],
  series: [],
};

const REPORTE: ReportData = {
  report_type: 'custom',
  device_id: 'eq-1',
  period_start: '2026-08-01T05:00:00Z',
  period_end: '2026-08-31T05:00:00Z',
  consumption_kwh: 120,
  export_kwh: 30,
  net_balance_kwh: 90,
  consumption_series: [],
  export_series: [],
  kpis: {
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    device_id: 'eq-1',
    power_avg_w: 500,
    power_max_w: 4200,
    voltage_avg_v: null,
    voltage_min_v: null,
    voltage_max_v: null,
    current_avg_a: null,
    power_factor_avg: null,
    consumption_daily_kwh: 4,
    consumption_weekly_kwh: 28,
    consumption_monthly_kwh: 120,
    export_daily_kwh: 1,
    export_monthly_kwh: 30,
  },
  max_demand: {
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    device_id: 'eq-1',
    peak_power_w: 4200,
    peak_at: '2026-08-10T23:00:00Z',
  },
  load_factor: {
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    device_id: 'eq-1',
    average_import_w: 500,
    peak_import_w: 4200,
    load_factor: 0.119,
  },
  base_load: {
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-31T05:00:00Z',
    device_id: 'eq-1',
    percentile: 0.1,
    base_load_w: 180,
  },
  costs: COSTO,
  generated_at: '2026-08-31T05:00:00Z',
};

/** Un mes sin ninguna sección opcional disponible. */
const MINIMO: DatosInformeMensual = {
  mes: '2026-08',
  sede: 'Planta · Tablero',
  reporte: REPORTE,
  proyeccion: null,
  cobertura: null,
  cargaBase: null,
  heatmap: null,
  historial: null,
  arquetipos: null,
  comparacion: null,
};

describe('las secciones del informe mensual', () => {
  test('el resumen y la cascada van siempre: salen del reporte mismo', () => {
    expect(seccionesDelInforme(MINIMO)).toEqual(['resumen', 'cascada']);
  });

  test('la cobertura entra solo si hay contra qué compararla', () => {
    const sinReferencia = {
      ...MINIMO,
      cobertura: {
        device_id: 'eq-1',
        period_start: '2026-08-01T05:00:00Z',
        period_end: '2026-08-31T05:00:00Z',
        bucket_seconds: 3600,
        expected_per_bucket: null,
        expected_source: 'desconocido' as const,
        overall_ratio: null,
        incomplete_buckets: 0,
        points: [],
      },
    };

    expect(seccionesDelInforme(sinReferencia)).not.toContain('cobertura');
    expect(
      seccionesDelInforme({
        ...sinReferencia,
        cobertura: {
          ...sinReferencia.cobertura,
          expected_per_bucket: 60,
          expected_source: 'declarado',
          overall_ratio: 0.97,
        },
      }),
    ).toContain('cobertura');
  });

  test('sin carga base medible no hay sección de consumo de fondo', () => {
    // Pasa en una sede con generación y sin lecturas nocturnas en el mes.
    const base = {
      device_id: 'eq-1',
      period_start: '2026-08-01T05:00:00Z',
      period_end: '2026-08-31T05:00:00Z',
      percentile: 0.05,
      window: 'noche' as const,
      points: [],
      current_w: null,
      trend_delta_w: null,
      monthly_kwh: null,
      monthly_cost_cop: null,
      share_of_import: null,
    };

    expect(seccionesDelInforme({ ...MINIMO, cargaBase: base })).not.toContain('carga_base');
    expect(seccionesDelInforme({ ...MINIMO, cargaBase: { ...base, current_w: 180 } })).toContain(
      'carga_base',
    );
  });

  test('cero días analizados no es "no hubo anomalías"', () => {
    // Es que no se miró nada: afirmar lo contrario en un informe archivado
    // sería una conclusión sobre datos inexistentes.
    const historial = {
      device_id: 'eq-1',
      period_start: '2026-08-01T05:00:00Z',
      period_end: '2026-08-31T05:00:00Z',
      days_analyzed: 0,
      anomalies: [],
      level_shift: null,
    };

    expect(seccionesDelInforme({ ...MINIMO, historial })).not.toContain('anomalias');
  });

  test('un mes sin anomalías tampoco ocupa una sección vacía', () => {
    const historial = {
      device_id: 'eq-1',
      period_start: '2026-08-01T05:00:00Z',
      period_end: '2026-08-31T05:00:00Z',
      days_analyzed: 30,
      anomalies: [],
      level_shift: null,
    };

    expect(seccionesDelInforme({ ...MINIMO, historial })).not.toContain('anomalias');
  });

  test('un cambio de nivel solo ya justifica la sección', () => {
    const historial = {
      device_id: 'eq-1',
      period_start: '2026-08-01T05:00:00Z',
      period_end: '2026-08-31T05:00:00Z',
      days_analyzed: 30,
      anomalies: [],
      level_shift: {
        detected_at: '2026-08-03T05:00:00Z',
        before_kwh: 12.4,
        after_kwh: 19.8,
        delta_pct: 59.7,
        direction: 'up' as const,
        message: 'Desde el 3 de agosto tu consumo diario subió…',
      },
    };

    expect(seccionesDelInforme({ ...MINIMO, historial })).toContain('anomalias');
  });

  test('el ranking de sedes entra solo cuando el grupo alcanza', () => {
    const comparacion = {
      device_id: 'eq-1',
      period_start: '2026-08-01T05:00:00Z',
      period_end: '2026-08-31T05:00:00Z',
      days: 30,
      own_kwh_per_day: 12,
      median_kwh_per_day: null,
      percentile: null,
      peers: [],
      enough_peers: false,
    };

    expect(seccionesDelInforme({ ...MINIMO, comparacion })).not.toContain('sedes');
    expect(
      seccionesDelInforme({ ...MINIMO, comparacion: { ...comparacion, enough_peers: true } }),
    ).toContain('sedes');
  });

  test('con todo disponible, el orden de lectura es estable', () => {
    const completo: DatosInformeMensual = {
      ...MINIMO,
      cobertura: {
        device_id: 'eq-1',
        period_start: '2026-08-01T05:00:00Z',
        period_end: '2026-08-31T05:00:00Z',
        bucket_seconds: 3600,
        expected_per_bucket: 60,
        expected_source: 'declarado',
        overall_ratio: 0.99,
        incomplete_buckets: 0,
        points: [],
      },
      heatmap: {
        device_id: 'eq-1',
        period_start: '2026-08-01T05:00:00Z',
        period_end: '2026-08-31T05:00:00Z',
        metric: 'import',
        unit: 'kWh',
        dates: ['2026-08-01'],
        values: [Array.from({ length: 24 }, () => 1)],
      },
      cargaBase: {
        device_id: 'eq-1',
        period_start: '2026-08-01T05:00:00Z',
        period_end: '2026-08-31T05:00:00Z',
        percentile: 0.05,
        window: 'dia',
        points: [],
        current_w: 180,
        trend_delta_w: 5,
        monthly_kwh: 129.6,
        monthly_cost_cop: 116640,
        share_of_import: 0.3,
      },
      historial: {
        device_id: 'eq-1',
        period_start: '2026-08-01T05:00:00Z',
        period_end: '2026-08-31T05:00:00Z',
        days_analyzed: 30,
        anomalies: [
          {
            kind: 'daily_total',
            severity: 'moderate',
            device_id: 'eq-1',
            variable: 'TotWh_import',
            value: 40,
            expected_low: 8,
            expected_high: 14,
            bucket: 1,
            timestamp: '2026-08-12T05:00:00Z',
            message: 'Consumo del martes inusual…',
          },
        ],
        level_shift: null,
      },
      arquetipos: {
        device_id: 'eq-1',
        period_start: '2026-05-12T05:00:00Z',
        period_end: '2026-08-10T05:00:00Z',
        days_analyzed: 90,
        silhouette: 0.6,
        archetypes: [
          {
            label: 'Laboral',
            day_count: 64,
            avg_kwh: 18,
            hourly_share: Array.from({ length: 24 }, () => 1 / 24),
            weekdays: ['lunes'],
          },
        ],
        assignments: [],
      },
      comparacion: {
        device_id: 'eq-1',
        period_start: '2026-08-01T05:00:00Z',
        period_end: '2026-08-31T05:00:00Z',
        days: 30,
        own_kwh_per_day: 12,
        median_kwh_per_day: 10,
        percentile: 66,
        peers: [],
        enough_peers: true,
      },
    };

    expect(seccionesDelInforme(completo)).toEqual([
      'resumen',
      'cascada',
      'cobertura',
      'heatmap',
      'carga_base',
      'anomalias',
      'tipos_de_dia',
      'sedes',
    ]);
  });
});
