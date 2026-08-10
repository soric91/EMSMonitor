/**
 * El tablero consolidado (F5.3).
 *
 * Antes del refactor hacía 7 peticiones HTTP más el WebSocket. Ahora el
 * payload de `/dashboard/summary` trae potencia, costos del día/del mes y KPIs;
 * la conectividad se ve en el punto del hero (estado del socket) y las únicas
 * peticiones aparte son las dos comparaciones 7/30 días, que son un caso de
 * uso distinto de lo que consolidó el resumen.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import Dashboard from '../src/pages/Dashboard';
import { DeviceProvider } from '../src/context/DeviceContext';
import { RealtimeProvider } from '../src/context/RealtimeContext';
import { VariablesProvider } from '../src/context/VariablesContext';
import type {
  CompareResult,
  CostBreakdown,
  DashboardSummary,
  KpiSummary,
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

/** Energía exportada: acumulativa, así no entra en una pestaña en vivo (ni
 *  dispara el backfill de historial que dejaría el recuento de red con una
 *  petición más, la misma que hace la gráfica en producción). */
const EXPORTA: VariableDisponible = {
  nombre: 'TotWh_export',
  etiqueta: 'Energía exportada',
  unidad: 'kWh',
  magnitud: 'energia_exportada',
  fase: 'total',
  acumulativa: true,
  equipos: ['eq-elegido'],
  con_datos: true,
};

const KPIS: KpiSummary = {
  period_start: '2026-08-10T00:00:00Z',
  period_end: '2026-08-10T23:59:59Z',
  device_id: 'eq-elegido',
  power_avg_w: 5210,
  power_max_w: 8200,
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

const DIA: CostBreakdown = {
  period: 'day',
  device_id: 'eq-elegido',
  period_start: '2026-08-10T00:00:00Z',
  period_end: '2026-08-10T23:59:59Z',
  consumption_kwh: 12.4,
  export_kwh: 1.8,
  consumption_cost_cop: 7751,
  export_credit_cop: 1142,
  net_cost_cop: 6608,
  months_used: ['2026-08'],
  stale_months: [],
  series: [],
};

const MES: CostBreakdown = {
  ...DIA,
  period: 'month',
  period_start: '2026-08-01T00:00:00Z',
  period_end: '2026-08-31T23:59:59Z',
  consumption_kwh: 380,
  export_kwh: 55,
  consumption_cost_cop: 142_500,
  export_credit_cop: 22_300,
  net_cost_cop: 120_200,
};

const RESUMEN: DashboardSummary = {
  device_id: 'eq-elegido',
  last_update: '2026-08-10T12:00:00Z',
  power_active_total_w: 5210,
  voltage_a: 119.8,
  voltage_b: 119.9,
  current_a: 9.4,
  current_b: 9.1,
  power_factor: 0.95,
  consumption_today_kwh: 12.4,
  consumption_month_kwh: 380,
  export_today_kwh: 1.8,
  export_month_kwh: 55,
  costs_day: DIA,
  costs_month: MES,
  kpis: KPIS,
};

const COMPARADO: CompareResult = {
  device_id: 'eq-elegido',
  period_a: {
    period_start: '2026-08-03T00:00:00Z',
    period_end: '2026-08-09T23:59:59Z',
    consumption_kwh: 91,
    export_kwh: 6,
    peak_import_w: null,
  },
  period_b: {
    period_start: '2026-08-10T00:00:00Z',
    period_end: '2026-08-16T23:59:59Z',
    consumption_kwh: 120,
    export_kwh: 8,
    peak_import_w: null,
  },
  consumption_delta_pct: 4.2,
  export_delta_pct: 2.1,
};

describe('qué muestra el tablero', () => {
  test('la potencia del resumen, el costo del día y el del mes', async () => {
    servir();

    montar();

    await waitFor(() => expect(screen.getByText('Importado hoy')).toBeInTheDocument());
    // Potencia activa desde /dashboard/summary, no desde el socket.
    expect(screen.getByText('5.21 kW')).toBeInTheDocument();
    // Costo del día y del mes, cargados del mismo payload.
    expect(screen.getByText('Exportado hoy')).toBeInTheDocument();
    expect(screen.getByText('Importado del mes')).toBeInTheDocument();
  });

  test('arranca en esqueleto hasta que llega el resumen', async () => {
    servir();

    montar();

    // En el primer render el resumen todavía no resolvió: no hay costos aún.
    expect(screen.queryByText('Importado hoy')).toBeNull();
    await waitFor(() => expect(screen.getByText('Importado hoy')).toBeInTheDocument());
  });

  test('si el resumen falla avisa y no deja recuadros a medias', async () => {
    servir({ fallaResumen: true });

    montar();

    await waitFor(() =>
      expect(screen.getByText('No se pudo cargar el resumen del tablero.')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Importado/)).toBeNull();
  });
});

describe('cuánto pide la red', () => {
  test('una sola llamada consolidada y las dos comparaciones', async () => {
    servir();

    montar();

    await waitFor(() => expect(screen.getByText('Importado hoy')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Últimos 7 días')).toBeInTheDocument());

    const pedidos = (url: string) => parametros.filter((p) => String(p.url).startsWith(url));
    const todos = parametros.length;

    // El panel completo son 5 peticiones: inventario, variables, el resumen
    // consolidado y las dos comparaciones. Todo lo demás dejó de pedirse.
    expect(todos).toBe(5);
    expect(pedidos('/devices')).toHaveLength(1);
    expect(pedidos('/variables')).toHaveLength(1);
    expect(pedidos('/dashboard/summary')).toHaveLength(1);
    expect(pedidos('/analytics/compare')).toHaveLength(2);

    // Cero a los endpoints que /dashboard/summary consolidó.
    expect(pedidos('/costs')).toHaveLength(0);
    expect(pedidos('/dashboard/status')).toHaveLength(0);
    expect(pedidos('/realtime/device')).toHaveLength(0);
    expect(pedidos('/kpis')).toHaveLength(0);
    expect(pedidos('/consumption')).toHaveLength(0);
    expect(pedidos('/export')).toHaveLength(0);
    // `/analytics` a secas: el resumen general ya no se pide.
    expect(parametros.filter((p) => String(p.url) === '/analytics')).toHaveLength(0);
  });
});

// --- andamiaje ---------------------------------------------------------

function montar(): void {
  render(
    <VariablesProvider>
      <DeviceProvider>
        <RealtimeProvider>
          <Dashboard />
        </RealtimeProvider>
      </DeviceProvider>
    </VariablesProvider>,
  );
}

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

function servir(options: { fallaResumen?: boolean } = {}): void {
  globalThis.WebSocket = WebSocketMudo as unknown as typeof WebSocket;
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    parametros.push({ url, ...(config.params ?? {}) });

    if (options.fallaResumen && url === '/dashboard/summary') {
      return Promise.reject(new Error('boom'));
    }

    const data: unknown =
      url === '/devices'
        ? [MEDIDOR]
        : url === '/variables'
          ? [EXPORTA]
          : url === '/dashboard/summary'
            ? RESUMEN
            : url === '/analytics/compare'
              ? COMPARADO
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
  globalThis.WebSocket = WebSocketOriginal;
});
