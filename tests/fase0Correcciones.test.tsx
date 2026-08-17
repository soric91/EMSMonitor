/**
 * Fase 0 del plan de analítica: las correcciones de lo que se mostraba mal.
 *
 * Cada bloque fija una de ellas para que no vuelva:
 *  - 0.2 los estadísticos del Histórico salen de reducciones sobre datos
 *    crudos (`/history/stats`), no de reducir los puntos ya agregados;
 *  - 0.3 los KPIs del resumen general no se rotulan como promedios (son el
 *    acumulado del día/semana/mes en curso);
 *  - 0.4 la comparación de periodos termina en la medianoche local, sin
 *    arrastrar el día en curso a medio consumir;
 *  - 0.5 los indicadores de carga dicen que solo cuentan la importación.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import History from '../src/pages/History';
import { AnalyticsSummary } from '../src/components/dashboard/AnalyticsSummary';
import { PeriodComparisonCard } from '../src/components/dashboard/PeriodComparisonCard';
import { MetricsGrid } from '../src/components/ui/MetricsGrid';
import { DeviceContext } from '../src/context/DeviceContext';
import { VariablesProvider } from '../src/context/VariablesContext';
import type {
  AnalyticsSummary as AnalyticsSummaryData,
  BaseLoadResult,
  CompareResult,
  HistoryResponse,
  HistoryStats,
  LoadFactorResult,
  MaxDemandResult,
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

const POTENCIA: VariableDisponible = {
  nombre: 'TotW',
  etiqueta: 'Potencia activa total',
  unidad: 'W',
  magnitud: 'potencia_activa',
  fase: 'total',
  acumulativa: false,
  equipos: ['eq-elegido'],
  con_datos: true,
};

const CONTADOR: VariableDisponible = {
  nombre: 'TotWh_import',
  etiqueta: 'Energía importada',
  unidad: 'kWh',
  magnitud: 'energia_importada',
  fase: 'total',
  acumulativa: true,
  equipos: ['eq-elegido'],
  con_datos: true,
};

/** Tres ventanas que promedian 520 W: reducirlas daría un "máximo" de 520 W. */
const SERIE_PROMEDIADA: HistoryResponse = {
  variable: 'TotW',
  device_id: 'eq-elegido',
  aggregation: 'mean',
  period_start: '2026-08-09T12:00:00Z',
  period_end: '2026-08-10T12:00:00Z',
  interval_seconds: 86_400,
  points: [
    { time: '2026-08-09T12:00:00Z', value: 520 },
    { time: '2026-08-10T00:00:00Z', value: 520 },
    { time: '2026-08-10T12:00:00Z', value: 520 },
  ],
};

/** El pico REAL del mismo rango, que el promedio por ventana escondía. */
const ESTADISTICOS: HistoryStats = {
  variable: 'TotW',
  device_id: 'eq-elegido',
  period_start: '2026-08-09T12:00:00Z',
  period_end: '2026-08-10T12:00:00Z',
  min: 12,
  max: 10_000,
  mean: 520,
  last: 480,
};

const RESUMEN_GENERAL: AnalyticsSummaryData = {
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

const COMPARACION: CompareResult = {
  device_id: 'eq-elegido',
  period_a: {
    period_start: '2026-07-27T05:00:00Z',
    period_end: '2026-08-03T05:00:00Z',
    consumption_kwh: 100,
    export_kwh: 10,
  },
  period_b: {
    period_start: '2026-08-03T05:00:00Z',
    period_end: '2026-08-10T05:00:00Z',
    consumption_kwh: 90,
    export_kwh: 12,
  },
  consumption_delta_pct: -10,
  export_delta_pct: 20,
};

describe('0.2 · los estadísticos del Histórico', () => {
  test('una variable instantánea muestra el pico real, no el mayor promedio', async () => {
    servir({ variables: [POTENCIA] });

    montarHistorico();

    // 10 kW sale de /history/stats; reducir la serie habría dado 520 W.
    await waitFor(() => expect(screen.getByText('10.00 kW')).toBeInTheDocument());
    expect(screen.getByText('Máximo')).toBeInTheDocument();
    expect(pedidos('/history/stats')).toHaveLength(1);
  });

  test('un contador acumulativo no pide la reducción y rotula "por ventana"', async () => {
    servir({ variables: [CONTADOR] });

    montarHistorico();

    await waitFor(() => expect(screen.getByText('Máximo por ventana')).toBeInTheDocument());
    // Un contador monótono no admite mean/max/min: el backend responde 400 y
    // acá directamente no se pregunta.
    expect(pedidos('/history/stats')).toHaveLength(0);
    expect(screen.getByText('Promedio por ventana')).toBeInTheDocument();
  });
});

describe('0.3 · los KPIs del resumen general', () => {
  test('no se rotulan como promedios: son lo que va del día, la semana y el mes', async () => {
    servir({ variables: [POTENCIA] });

    render(<AnalyticsSummary />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('Consumo de hoy')).toBeInTheDocument());
    expect(screen.getByText('Consumo de esta semana')).toBeInTheDocument();
    expect(screen.getByText('Consumo de este mes')).toBeInTheDocument();
    expect(screen.queryByText(/prom\./)).not.toBeInTheDocument();
  });
});

describe('0.4 · la comparación de periodos', () => {
  test('ambos rangos terminan en medianoche local y duran lo mismo', async () => {
    servir({ variables: [POTENCIA] });

    render(<PeriodComparisonCard label="Últimos 7 días" days={7} />, { wrapper: ConDispositivo });

    await waitFor(() => expect(pedidos('/analytics/compare')).toHaveLength(1));
    const { from_a, to_a, from_b, to_b } = pedidos('/analytics/compare')[0] as Record<
      string,
      string
    >;

    // Medianoche de Bogotá = 05:00 UTC. Sin esto, `to_b` era "ahora" y el
    // último día del periodo B entraba a medio consumir.
    expect(to_b.endsWith('T05:00:00.000Z')).toBe(true);
    expect(to_a).toBe(from_b);
    const dias = (desde: string, hasta: string) =>
      (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
    expect(dias(from_b, to_b)).toBe(7);
    expect(dias(from_a, to_a)).toBe(7);
  });
});

describe('0.5 · los indicadores de carga', () => {
  test('dicen que solo cuentan las horas de importación', () => {
    render(<MetricsGrid max_demand={MAX_DEMAND} load_factor={LOAD_FACTOR} base_load={BASE_LOAD} />);

    for (const etiqueta of ['Demanda máxima', 'Factor de carga', 'Carga base']) {
      expect(screen.getByText(etiqueta).closest('div')).toHaveAttribute(
        'title',
        expect.stringContaining('importa de la red'),
      );
    }
  });
});

const MAX_DEMAND: MaxDemandResult = {
  period_start: '2026-08-09T12:00:00Z',
  period_end: '2026-08-10T12:00:00Z',
  device_id: 'eq-elegido',
  peak_power_w: 10_000,
  peak_at: '2026-08-10T01:00:00Z',
};

const LOAD_FACTOR: LoadFactorResult = {
  period_start: '2026-08-09T12:00:00Z',
  period_end: '2026-08-10T12:00:00Z',
  device_id: 'eq-elegido',
  average_import_w: 520,
  peak_import_w: 10_000,
  load_factor: 0.052,
};

const BASE_LOAD: BaseLoadResult = {
  period_start: '2026-08-09T12:00:00Z',
  period_end: '2026-08-10T12:00:00Z',
  device_id: 'eq-elegido',
  percentile: 0.1,
  base_load_w: 180,
};

// --- andamiaje ---------------------------------------------------------

const deviceContext = {
  devices: [MEDIDOR],
  gateways: [{ id: 'g1', serie: 'GW-0001', sede: 'Planta', enLinea: true, medidores: [MEDIDOR] }],
  selectedGatewayId: 'g1',
  setSelectedGatewayId: () => {},
  setSelectedDeviceId: () => {},
  cargando: false,
  error: false,
  selectedDeviceId: 'eq-elegido',
};

function ConDispositivo({ children }: { children: React.ReactNode }) {
  return <DeviceContext.Provider value={deviceContext}>{children}</DeviceContext.Provider>;
}

function montarHistorico(): void {
  render(
    <VariablesProvider>
      <DeviceContext.Provider value={deviceContext}>
        <History />
      </DeviceContext.Provider>
    </VariablesProvider>,
  );
}

const adapterOriginal = apiClient.defaults.adapter;
let parametros: Record<string, unknown>[] = [];

function pedidos(url: string): Record<string, unknown>[] {
  return parametros.filter((p) => String(p.url) === url);
}

function servir({ variables }: { variables: VariableDisponible[] }): void {
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    parametros.push({ url, ...(config.params ?? {}) });

    const data: unknown =
      url === '/devices'
        ? [MEDIDOR]
        : url === '/variables'
          ? variables
          : url === '/history'
            ? SERIE_PROMEDIADA
            : url === '/history/stats'
              ? ESTADISTICOS
              : url === '/analytics/summary'
                ? RESUMEN_GENERAL
                : url === '/analytics/compare'
                  ? COMPARACION
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
  parametros = [];
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});
