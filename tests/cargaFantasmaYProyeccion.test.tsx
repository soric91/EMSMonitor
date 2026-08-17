/**
 * F1.3 y F1.2 — el consumo de fondo y la proyección de la factura.
 *
 * Los dos insights que se traducen directo a dinero, y los dos con la misma
 * regla: no decir más de lo que el dato sostiene. Sin lecturas nocturnas no
 * hay carga base; sin historial suficiente no hay proyección.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { BillProjectionCard } from '../src/components/dashboard/BillProjectionCard';
import { PhantomLoadCard } from '../src/components/dashboard/PhantomLoadCard';
import { DeviceContext } from '../src/context/DeviceContext';
import type { BaseLoadTrendResult, BillForecast } from '../src/api/types';

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

const DESDE = '2026-08-01T00:00:00Z';
const HASTA = '2026-08-15T00:00:00Z';

const CARGA_BASE: BaseLoadTrendResult = {
  device_id: 'eq-elegido',
  period_start: DESDE,
  period_end: HASTA,
  percentile: 0.05,
  window: 'dia',
  points: [
    { date: '2026-08-10', base_load_w: 120, sample_count: 96 },
    { date: '2026-08-11', base_load_w: 122, sample_count: 96 },
    { date: '2026-08-12', base_load_w: 190, sample_count: 96 },
  ],
  current_w: 180,
  trend_delta_w: 60,
  monthly_kwh: 129.6,
  monthly_cost_cop: 116640,
  share_of_import: 0.31,
};

const PROYECCION: BillForecast = {
  month: '2026-08',
  device_id: 'eq-elegido',
  kwh_mtd: 142,
  export_mtd_kwh: 0,
  days_elapsed: 15.5,
  days_total: 31,
  kwh_projected: 290,
  kwh_p10: 260,
  kwh_p90: 320,
  export_projected_kwh: 0,
  cost_projected_cop: 248000,
  cost_p10_cop: 221000,
  cost_p90_cop: 276000,
  method: 'ewma_por_tipo_de_dia',
};

describe('1.3 · el consumo de fondo', () => {
  test('se muestra en vatios, en kWh y en pesos', async () => {
    servir({ baseload: CARGA_BASE });

    render(<PhantomLoadCard fromIso={DESDE} toIso={HASTA} />, { wrapper: ConDispositivo });

    // "180 W" no le dice nada a nadie; "$116.640 al mes" sí.
    await waitFor(() => expect(screen.getByText('180 W')).toBeInTheDocument());
    expect(screen.getByText(/129\.60 kWh al mes/)).toBeInTheDocument();
    expect(screen.getByText(/31% de lo importado/)).toBeInTheDocument();
  });

  test('avisa cuando el piso subió y no volvió a bajar', async () => {
    servir({ baseload: CARGA_BASE });

    render(<PhantomLoadCard fromIso={DESDE} toIso={HASTA} />, { wrapper: ConDispositivo });

    await waitFor(() =>
      expect(screen.getByText(/suele ser algo que quedó encendido/)).toBeInTheDocument(),
    );
  });

  test('un piso estable no inventa una alerta', async () => {
    servir({ baseload: { ...CARGA_BASE, trend_delta_w: 2 } });

    render(<PhantomLoadCard fromIso={DESDE} toIso={HASTA} />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('180 W')).toBeInTheDocument());
    expect(screen.queryByText(/quedó encendido/)).not.toBeInTheDocument();
  });

  test('sin lecturas nocturnas explica por qué no hay cifra', async () => {
    servir({
      baseload: {
        ...CARGA_BASE,
        window: 'noche',
        points: [],
        current_w: null,
        monthly_kwh: null,
        monthly_cost_cop: null,
        share_of_import: null,
      },
    });

    render(<PhantomLoadCard fromIso={DESDE} toIso={HASTA} />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText(/solo se mide de noche/)).toBeInTheDocument());
  });
});

describe('1.2 · la proyección de la factura', () => {
  test('muestra el cierre estimado con su rango', async () => {
    servir({ forecast: PROYECCION });

    render(<BillProjectionCard costoMesActualCop={118400} />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('$ 248.000')).toBeInTheDocument());
    expect(screen.getByText(/entre \$ 221\.000 y \$ 276\.000/)).toBeInTheDocument();
    expect(screen.getByText(/50% del mes transcurrido/)).toBeInTheDocument();
  });

  test('sin historial suficiente no proyecta nada', async () => {
    servir({
      forecast: {
        ...PROYECCION,
        kwh_projected: null,
        kwh_p10: null,
        kwh_p90: null,
        export_projected_kwh: null,
        cost_projected_cop: null,
        cost_p10_cop: null,
        cost_p90_cop: null,
        method: 'insufficient_history',
      },
    });

    render(<BillProjectionCard />, { wrapper: ConDispositivo });

    await waitFor(() =>
      expect(screen.getByText(/Todavía no hay suficiente historial/)).toBeInTheDocument(),
    );
    // Lo que va del mes SÍ se muestra: eso es un dato, no un pronóstico.
    expect(screen.getByText(/142\.00 kWh/)).toBeInTheDocument();
    expect(screen.queryByText('$ 248.000')).not.toBeInTheDocument();
  });
});

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

const adapterOriginal = apiClient.defaults.adapter;

function servir({
  baseload = CARGA_BASE,
  forecast = PROYECCION,
}: {
  baseload?: BaseLoadTrendResult;
  forecast?: BillForecast;
}): void {
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    const data: unknown =
      url === '/analytics/baseload-trend' ? baseload : url === '/forecast/bill' ? forecast : null;

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
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});
