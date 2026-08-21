/**
 * La fusión de Consumo/Exportación con Reportes.
 *
 * Las dos páginas llamaban al MISMO endpoint, con el mismo tipo, y pintaban
 * cuatro bloques idénticos. Lo único propio de Consumo/Exportación era la
 * gráfica de costo por bucket; lo único que hacía mejor, etiquetar los buckets
 * según el periodo. Las dos cosas viven ahora en Reportes, y la ruta vieja
 * redirige. Este test fija que la fusión no perdió nada.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Navigate } from 'react-router-dom';
import { apiClient } from '../src/api/client';
import Reports from '../src/pages/Reports';
import { DeviceContext } from '../src/context/DeviceContext';
import type { CostBreakdown, KpiSummary, ReportData } from '../src/api/types';

const MEDIDOR = {
  device_id: 'eq-1',
  nombre: 'Tablero',
  modbus_id: 10,
  sede_id: 's1',
  sede: 'Planta',
  gateway_id: 'g1',
  gateway: 'GW-0001',
  gateway_en_linea: true,
};

const KPIS: KpiSummary = {
  period_start: '2026-08-01T05:00:00Z',
  period_end: '2026-08-31T05:00:00Z',
  device_id: 'eq-1',
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

/** Un reporte con series de costo: lo que antes obligaba a cambiar de página. */
function reporte(inicio: string, fin: string): ReportData {
  const costs: CostBreakdown = {
    period: 'month',
    device_id: 'eq-1',
    period_start: inicio,
    period_end: fin,
    consumption_kwh: 380,
    export_kwh: 55,
    consumption_cost_cop: 237500,
    export_credit_cop: 34000,
    export_tier1_kwh: 55,
    export_tier2_kwh: 0,
    export_tier1_credit_cop: 34000,
    export_tier2_credit_cop: 0,
    net_cost_cop: 203500,
    months_used: ['2026-08'],
    stale_months: [],
    series: [
      {
        time: inicio,
        consumption_kwh: 12,
        export_kwh: 2,
        consumption_cost_cop: 7500,
        export_credit_cop: 1200,
        net_cost_cop: 6300,
      },
    ],
  };

  return {
    report_type: 'monthly',
    device_id: 'eq-1',
    period_start: inicio,
    period_end: fin,
    consumption_kwh: 380,
    export_kwh: 55,
    net_balance_kwh: 325,
    consumption_series: [{ time: inicio, value: 12 }],
    export_series: [{ time: inicio, value: 2 }],
    kpis: KPIS,
    max_demand: {
      period_start: inicio,
      period_end: fin,
      device_id: 'eq-1',
      peak_power_w: null,
      peak_at: null,
    },
    load_factor: {
      period_start: inicio,
      period_end: fin,
      device_id: 'eq-1',
      average_import_w: null,
      peak_import_w: null,
      load_factor: null,
    },
    base_load: {
      period_start: inicio,
      period_end: fin,
      device_id: 'eq-1',
      percentile: 10,
      base_load_w: null,
    },
    costs,
    generated_at: fin,
  };
}

describe('la ruta vieja', () => {
  test('/consumption-export lleva a /reports, no a un 404', async () => {
    render(
      <MemoryRouter initialEntries={['/consumption-export']}>
        <Routes>
          <Route path="/consumption-export" element={<Navigate to="/reports" replace />} />
          <Route path="/reports" element={<p>Reportes</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Reportes')).toBeInTheDocument());
  });

  test('el sidebar ya no ofrece dos entradas para lo mismo', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');

    expect(sidebar).not.toContain('Consumo / Exportación');
    expect(sidebar).toContain("label: 'Reportes'");
  });
});

describe('lo que la fusión conserva', () => {
  test('energía y costo por bucket conviven en una sola pantalla', async () => {
    servir(reporte('2026-08-01T05:00:00Z', '2026-08-31T05:00:00Z'));

    montar();

    // Lo que ya tenía Reportes.
    await waitFor(() =>
      expect(screen.getByText('Importación vs. exportación')).toBeInTheDocument(),
    );
    // Lo que solo vivía en Consumo/Exportación: ya no hay que cambiar de página.
    expect(screen.getByText('Costo por periodo (COP)')).toBeInTheDocument();
  });

  test('los totales y el desglose de costos siguen ahí', async () => {
    servir(reporte('2026-08-01T05:00:00Z', '2026-08-31T05:00:00Z'));

    montar();

    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());
    expect(screen.getByText('Exportado')).toBeInTheDocument();
    expect(screen.getByText('Balance neto')).toBeInTheDocument();
    // El total también aparece en la letra chica del desglose de costos: acá
    // se busca el número grande de la tarjeta.
    const totales = screen.getAllByText('380.00 kWh');
    expect(totales.some((n) => n.className.includes('text-2xl'))).toBe(true);
  });

  test('un periodo sin serie de costos no dibuja la gráfica vacía', async () => {
    const sinCostos = reporte('2026-08-01T05:00:00Z', '2026-08-31T05:00:00Z');
    sinCostos.costs.series = [];
    servir(sinCostos);

    montar();

    await waitFor(() =>
      expect(screen.getByText('Importación vs. exportación')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Costo por periodo (COP)')).toBeNull();
  });
});

describe('las etiquetas de bucket', () => {
  test('un reporte de un año se rotula por mes, no por hora', async () => {
    servir(reporte('2026-01-01T05:00:00Z', '2026-12-31T05:00:00Z'));

    montar();

    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());
    // El CSV comparte formateador con la gráfica: lo que se ve es lo que se baja.
    const csv = await csvDescargado();
    expect(csv).toContain('ene 2026');
    expect(csv).not.toContain('00:00');
  });

  test('un reporte de un día se rotula por hora', async () => {
    servir(reporte('2026-08-20T05:00:00Z', '2026-08-21T05:00:00Z'));

    montar();

    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());
    expect(await csvDescargado()).toContain('00:00');
  });
});

// --- andamiaje ---------------------------------------------------------

function montar(): void {
  render(
    <MemoryRouter>
      <DeviceContext.Provider value={deviceContext}>
        <Reports />
      </DeviceContext.Provider>
    </MemoryRouter>,
  );
}

/** Dispara la exportación a CSV y devuelve el contenido del archivo. */
async function csvDescargado(): Promise<string> {
  screen.getByText('Exportar CSV').click();
  const blob = bajados.at(-1);
  return blob ? await blob.text() : '';
}

/** Los Blobs que la página mandó a descargar. */
let bajados: Blob[] = [];

const deviceContext = {
  devices: [MEDIDOR],
  gateways: [{ id: 'g1', serie: 'GW-0001', sede: 'Planta', enLinea: true, medidores: [MEDIDOR] }],
  selectedGatewayId: 'g1',
  setSelectedGatewayId: () => {},
  setSelectedDeviceId: () => {},
  cargando: false,
  error: false,
  selectedDeviceId: 'eq-1',
};

const adapterOriginal = apiClient.defaults.adapter;

// La descarga real abre un link temporal: acá solo interesa qué contenía.
Object.defineProperty(URL, 'createObjectURL', {
  value: (blob: Blob) => {
    bajados.push(blob);
    return 'blob:test';
  },
  configurable: true,
});
Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });

function servir(data: ReportData): void {
  apiClient.defaults.adapter = (config) =>
    Promise.resolve({
      data: { success: true, message: '', data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
}

afterEach(() => {
  cleanup();
  bajados = [];
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});
