/**
 * La página de analíticas tras la consolidación (F5.3) y el retiro de la
 * comparación A vs B (2026-08).
 *
 * El resumen general de rango dejó de pedirse al deprecated `/analytics`: el
 * mismo cálculo ahora sale de `/reports/custom` (los perfiles se quedan).
 * Este test fija el recuento por sección para que la página no vuelva a crecer
 * una llamada sin que alguien lo decida.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { clearSiteModeCache } from '../src/hooks/useSiteMode';
import Analytics from '../src/pages/Analytics';
import { DeviceContext } from '../src/context/DeviceContext';
import { RealtimeProvider } from '../src/context/RealtimeContext';
import { VariablesProvider } from '../src/context/VariablesContext';
import type {
  AlertsHistory,
  AnalyticsSummary,
  BenchmarkResult,
  BaseLoadTrendResult,
  LoadDurationResult,
  CostBreakdown,
  CoverageResult,
  DayArchetypesResult,
  HeatmapResult,
  KpiSummary,
  ReportData,
  SiteModeResult,
  VariableDisponible,
} from '../src/api/types';

const MEDIDOR = {
  device_id: 'eq-elegido',
  nombre: 'Tablero',
  modbus_id: 10,
  sede_id: 's1',
  sede: 'Planta',
  gateway_id: 'g1',
  gateway: 'GW-0001',
  gateway_en_linea: true,
};

const VARIABLE: VariableDisponible = {
  nombre: 'TotW',
  etiqueta: 'Potencia activa total',
  unidad: 'W',
  magnitud: 'potencia_activa',
  fase: 'total',
  acumulativa: false,
  equipos: ['eq-elegido'],
  con_datos: true,
};

const KPIS: KpiSummary = {
  period_start: '2026-08-10T00:00:00Z',
  period_end: '2026-08-10T23:59:59Z',
  device_id: 'eq-elegido',
  power_avg_w: 3000,
  power_max_w: 6400,
  voltage_avg_v: null,
  voltage_min_v: null,
  voltage_max_v: null,
  current_avg_a: null,
  power_factor_avg: null,
  consumption_daily_kwh: 12.4,
  consumption_weekly_kwh: 88,
  consumption_monthly_kwh: 380,
  export_daily_kwh: 1.8,
  export_monthly_kwh: 55,
};

const COSTO: CostBreakdown = {
  period: 'day',
  device_id: 'eq-elegido',
  period_start: '2026-08-09T12:00:00Z',
  period_end: '2026-08-10T12:00:00Z',
  consumption_kwh: 12.4,
  export_kwh: 1.8,
  consumption_cost_cop: 7751,
  export_credit_cop: 1142,
  export_tier1_kwh: 0,
  export_tier2_kwh: 0,
  export_tier1_credit_cop: 0,
  export_tier2_credit_cop: 1142,
  net_cost_cop: 6608,
  months_used: ['2026-08'],
  stale_months: [],
  series: [],
};

const REPORTE: ReportData = {
  report_type: 'custom',
  device_id: 'eq-elegido',
  period_start: '2026-08-09T12:00:00Z',
  period_end: '2026-08-10T12:00:00Z',
  consumption_kwh: 12.4,
  export_kwh: 1.8,
  net_balance_kwh: 10.6,
  consumption_series: [],
  export_series: [],
  kpis: KPIS,
  max_demand: {
    period_start: '2026-08-09T12:00:00Z',
    period_end: '2026-08-10T12:00:00Z',
    device_id: 'eq-elegido',
    peak_power_w: null,
    peak_at: null,
  },
  load_factor: {
    period_start: '2026-08-09T12:00:00Z',
    period_end: '2026-08-10T12:00:00Z',
    device_id: 'eq-elegido',
    average_import_w: null,
    peak_import_w: null,
    load_factor: null,
  },
  base_load: {
    period_start: '2026-08-09T12:00:00Z',
    period_end: '2026-08-10T12:00:00Z',
    device_id: 'eq-elegido',
    percentile: 10,
    base_load_w: null,
  },
  costs: COSTO,
  generated_at: '2026-08-10T12:00:05Z',
};

const RESUMEN_GENERAL: AnalyticsSummary = {
  period_start: '2026-08-10T00:00:00Z',
  period_end: '2026-08-10T23:59:59Z',
  device_id: 'eq-elegido',
  consumption_daily_kwh: 3.2,
  consumption_weekly_kwh: 22,
  consumption_monthly_kwh: 380,
  export_daily_kwh: 0.5,
  export_monthly_kwh: 55,
  hourly_profile: [],
  peak_consumption_hour: null,
  peak_export_hour: null,
  efficiency: null,
};

const HEATMAP: HeatmapResult = {
  device_id: 'eq-elegido',
  period_start: '2026-08-09T12:00:00Z',
  period_end: '2026-08-10T12:00:00Z',
  metric: 'import',
  unit: 'kWh',
  dates: ['2026-08-10'],
  values: [Array.from({ length: 24 }, (_, hora) => (hora === 19 ? 4.2 : null))],
};

const COBERTURA: CoverageResult = {
  device_id: 'eq-elegido',
  period_start: '2026-08-09T12:00:00Z',
  period_end: '2026-08-10T12:00:00Z',
  bucket_seconds: 3600,
  expected_per_bucket: 60,
  expected_source: 'declarado',
  overall_ratio: 1,
  incomplete_buckets: 0,
  points: [],
};

const CARGA_BASE: BaseLoadTrendResult = {
  device_id: 'eq-elegido',
  period_start: '2026-08-09T12:00:00Z',
  period_end: '2026-08-10T12:00:00Z',
  percentile: 0.05,
  window: 'dia',
  points: [],
  current_w: 150,
  trend_delta_w: 0,
  monthly_kwh: 108,
  monthly_cost_cop: 97200,
  share_of_import: 0.2,
};

const DURACION: LoadDurationResult = {
  device_id: 'eq-elegido',
  period_start: '2026-08-09T12:00:00Z',
  period_end: '2026-08-10T12:00:00Z',
  sample_seconds: 900,
  points: [
    { time_fraction: 0, power_w: 4200 },
    { time_fraction: 1, power_w: 120 },
  ],
  p1_w: 4200,
  p5_w: 3800,
  p50_w: 900,
  p95_w: 130,
  top_fraction: 0.05,
  top_energy_share: 0.22,
  sample_count: 96,
};

const HISTORIAL: AlertsHistory = {
  device_id: 'eq-elegido',
  period_start: '2026-07-11T05:00:00Z',
  period_end: '2026-08-10T05:00:00Z',
  days_analyzed: 30,
  anomalies: [],
  level_shift: null,
};

const ARQUETIPOS: DayArchetypesResult = {
  device_id: 'eq-elegido',
  period_start: '2026-05-12T05:00:00Z',
  period_end: '2026-08-10T05:00:00Z',
  days_analyzed: 0,
  silhouette: null,
  archetypes: [],
  assignments: [],
};

const COMPARACION_SEDES: BenchmarkResult = {
  device_id: 'eq-elegido',
  period_start: '2026-07-11T05:00:00Z',
  period_end: '2026-08-10T05:00:00Z',
  days: 30,
  own_kwh_per_day: 12.4,
  median_kwh_per_day: null,
  percentile: null,
  peers: [
    {
      device_id: 'eq-elegido',
      name: 'Tablero',
      site: 'Planta',
      kwh_per_day: 12.4,
      is_self: true,
    },
  ],
  enough_peers: false,
};

const MODO: SiteModeResult = {
  device_id: 'eq-elegido',
  mode: 'generacion',
  source: 'crm',
};

describe('al montar', () => {
  test('el resumen de rango sale del reporte, no de /analytics', async () => {
    servir();

    montar();

    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());
    expect(screen.getByText('Exportado')).toBeInTheDocument();
  });
});

describe('cuánto pide al montar', () => {
  test('una llamada por sección y ninguna al endpoint deprecado', async () => {
    servir();

    montar();

    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());

    const pedidos = (url: string) => parametros.filter((p) => String(p.url) === url);

    // El inventario lo pide el provider de arriba (ya cargado acá): la página
    // no lo repite.
    expect(pedidos('/devices')).toHaveLength(0);
    expect(pedidos('/variables')).toHaveLength(1);
    // El resumen general de los 30 días que corona la página.
    expect(pedidos('/analytics/summary')).toHaveLength(1);
    // El overview de rango ahora es el reporte custom.
    expect(pedidos('/reports/custom')).toHaveLength(1);
    // Perfiles conservados.
    expect(pedidos('/analytics/daily-profile')).toHaveLength(1);
    expect(pedidos('/analytics/monthly-profile')).toHaveLength(1);
    // El costo del rango, aparte (no afecta al resto si falla).
    expect(pedidos('/costs/range')).toHaveLength(1);
    // F1.1 y F1.5: el mapa de calor y el aviso de cobertura, una vez cada uno.
    // El modo de sede lo pide el mapa para saber si ofrecer exportación.
    expect(pedidos('/analytics/heatmap')).toHaveLength(1);
    expect(pedidos('/analytics/coverage')).toHaveLength(1);
    expect(pedidos('/analytics/site-mode')).toHaveLength(1);
    // F1.3 y F1.4: el consumo de fondo y la curva de duración, una vez cada uno.
    expect(pedidos('/analytics/baseload-trend')).toHaveLength(1);
    expect(pedidos('/analytics/load-duration')).toHaveLength(1);
    // F2.4: el historial de anomalías, con su propio rango de 30 días.
    expect(pedidos('/alerts/history')).toHaveLength(1);
    // F2.3: los tipos de día, con su propia ventana de 90 días.
    expect(pedidos('/analytics/day-archetypes')).toHaveLength(1);
    // F3.2: la comparación contra las otras sedes del mismo cliente.
    expect(pedidos('/analytics/benchmark')).toHaveLength(1);

    // El compare ya no existe en la página (retirado 2026-08).
    expect(pedidos('/analytics/compare')).toHaveLength(0);
    // El endpoint deprecado y los reportes fijos no se tocan.
    expect(pedidos('/analytics')).toHaveLength(0);
    expect(
      parametros.filter((p) => String(p.url).startsWith('/reports/')).map((p) => p.url),
    ).toEqual(['/reports/custom']);
  });
});

// --- andamiaje ---------------------------------------------------------

function montar(): void {
  // El inventario ya cargó (en la app vive arriba en el árbol): fijarlo así
  // evita que el provider aislado vuelva a pedir /analytics/summary al elegir
  // el primer medidor, un refetch que no existe navegando normal.
  render(
    <VariablesProvider>
      <DeviceContext.Provider value={deviceContext}>
        <RealtimeProvider>
          <Analytics />
        </RealtimeProvider>
      </DeviceContext.Provider>
    </VariablesProvider>,
  );
}

const deviceContext = {
  devices: [MEDIDOR],
  gateways: [
    {
      id: 'g1',
      serie: 'GW-0001',
      sede: 'Planta',
      enLinea: true,
      medidores: [MEDIDOR],
    },
  ],
  selectedGatewayId: 'g1',
  setSelectedGatewayId: () => {},
  setSelectedDeviceId: () => {},
  cargando: false,
  error: false,
  selectedDeviceId: 'eq-elegido',
};

const adapterOriginal = apiClient.defaults.adapter;
const WebSocketOriginal = globalThis.WebSocket;
let parametros: Record<string, unknown>[] = [];

class WebSocketMudo {
  static readonly CONNECTING = 0;
  readyState = WebSocketMudo.CONNECTING;
  close(): void {}
  addEventListener(): void {}
  send(): void {}
}

function servir(): void {
  globalThis.WebSocket = WebSocketMudo as unknown as typeof WebSocket;
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    parametros.push({ url, ...(config.params ?? {}) });

    const data: unknown =
      url === '/devices'
        ? [MEDIDOR]
        : url === '/variables'
          ? [VARIABLE]
          : url === '/analytics/summary'
            ? RESUMEN_GENERAL
            : url === '/reports/custom'
              ? REPORTE
              : url === '/analytics/daily-profile'
                ? []
                : url === '/analytics/monthly-profile'
                  ? []
                  : url === '/costs/range'
                    ? COSTO
                    : url === '/analytics/heatmap'
                      ? HEATMAP
                      : url === '/analytics/coverage'
                        ? COBERTURA
                        : url === '/analytics/site-mode'
                          ? MODO
                          : url === '/analytics/baseload-trend'
                            ? CARGA_BASE
                            : url === '/analytics/load-duration'
                              ? DURACION
                              : url === '/alerts/history'
                                ? HISTORIAL
                                : url === '/analytics/day-archetypes'
                                  ? ARQUETIPOS
                                  : url === '/analytics/benchmark'
                                    ? COMPARACION_SEDES
                                    : null;

    return Promise.resolve({
      data: { success: true, message: '', data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
}

afterEach(() => {
  cleanup();
  clearSiteModeCache();
  parametros = [];
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
  globalThis.WebSocket = WebSocketOriginal;
});
