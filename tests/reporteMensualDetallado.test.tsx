/**
 * El detalle de un reporte largo, en pantalla.
 *
 * Un mes mostraba lo mismo que un día: tres totales y una barra por bucket.
 * Estas secciones responden lo que se le pregunta a un mes —qué semana, qué
 * día, a qué hora— y por eso mismo no deben aparecer donde no aplican: en un
 * reporte diario no hay semanas, y en uno anual los buckets son mensuales.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '../src/api/client';
import Reports from '../src/pages/Reports';
import { DeviceContext } from '../src/context/DeviceContext';
import type { CostBreakdown, HeatmapResult, KpiSummary, ReportData } from '../src/api/types';

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
  period_end: '2026-09-01T05:00:00Z',
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

function costos(inicio: string, fin: string): CostBreakdown {
  return {
    period: 'month',
    device_id: 'eq-1',
    period_start: inicio,
    period_end: fin,
    consumption_kwh: 380,
    export_kwh: 0,
    consumption_cost_cop: 237500,
    export_credit_cop: 0,
    export_tier1_kwh: 0,
    export_tier2_kwh: 0,
    export_tier1_credit_cop: 0,
    export_tier2_credit_cop: 0,
    net_cost_cop: 237500,
    months_used: ['2026-08'],
    stale_months: [],
    series: [],
  };
}

/** Un mes con buckets diarios: el 12 de agosto es el día pico. */
function mes(): ReportData {
  const series = Array.from({ length: 31 }, (_, i) => ({
    time: `2026-08-${String(i + 1).padStart(2, '0')}T05:00:00.000Z`,
    value: i + 1 === 12 ? 42 : 10,
  }));
  return reporte('2026-08-01T05:00:00Z', '2026-09-01T05:00:00Z', series);
}

/** Un día con buckets horarios. */
function dia(): ReportData {
  const series = Array.from({ length: 24 }, (_, h) => ({
    time: `2026-08-20T${String(h).padStart(2, '0')}:00:00.000Z`,
    value: 1,
  }));
  return reporte('2026-08-20T05:00:00Z', '2026-08-21T05:00:00Z', series);
}

/** Un año con buckets mensuales. */
function anio(): ReportData {
  const series = Array.from({ length: 12 }, (_, m) => ({
    time: new Date(Date.UTC(2026, m, 1, 5)).toISOString(),
    value: 300,
  }));
  return reporte('2026-01-01T05:00:00Z', '2027-01-01T05:00:00Z', series);
}

function reporte(
  inicio: string,
  fin: string,
  series: { time: string; value: number }[],
): ReportData {
  return {
    report_type: 'monthly',
    device_id: 'eq-1',
    period_start: inicio,
    period_end: fin,
    consumption_kwh: 380,
    export_kwh: 0,
    net_balance_kwh: 380,
    consumption_series: series,
    export_series: [],
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
    costs: costos(inicio, fin),
    generated_at: fin,
  };
}

/** Un mapa hora × día con el pico a las 19:00 del 12 de agosto. */
const HEATMAP: HeatmapResult = {
  device_id: 'eq-1',
  period_start: '2026-08-01T05:00:00Z',
  period_end: '2026-09-01T05:00:00Z',
  metric: 'import',
  unit: 'kWh',
  dates: ['2026-08-11', '2026-08-12'],
  values: [
    Array.from({ length: 24 }, (_, h) => (h === 8 ? 2.1 : null)),
    Array.from({ length: 24 }, (_, h) => (h === 19 ? 6.4 : null)),
  ],
};

describe('cuándo aparece el detalle', () => {
  test('un mes trae las semanas y los picos', async () => {
    servir(mes());

    montar();

    await waitFor(() => expect(screen.getByText('Consumo por semana')).toBeInTheDocument());
    expect(screen.getByText('Día de mayor consumo')).toBeInTheDocument();
    expect(screen.getByText('Semana de mayor consumo')).toBeInTheDocument();
  });

  test('un reporte diario no: no hay semanas que comparar', async () => {
    servir(dia());

    montar();

    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());
    expect(screen.queryByText('Consumo por semana')).toBeNull();
    expect(screen.queryByText('Día de mayor consumo')).toBeNull();
  });

  test('un reporte anual tampoco: sus buckets son meses, no días', async () => {
    servir(anio());

    montar();

    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());
    // Agrupar doce puntos mensuales "por semana" daría doce semanas de un
    // bucket cada una: un desglose que no dice nada.
    expect(screen.queryByText('Consumo por semana')).toBeNull();
  });
});

describe('qué dicen los picos', () => {
  test('el día pico sale del bucket más alto, con su energía', async () => {
    servir(mes());

    montar();

    await waitFor(() => expect(screen.getByText('Día de mayor consumo')).toBeInTheDocument());
    expect(screen.getByText('12 ago')).toBeInTheDocument();
    expect(screen.getByText('42.00 kWh')).toBeInTheDocument();
  });

  test('la hora pico se dice como hora local, no como índice', async () => {
    servir(mes());

    montar();

    await waitFor(() => expect(screen.getByText('Hora pico')).toBeInTheDocument());
    expect(screen.getByText('19:00')).toBeInTheDocument();
  });

  test('la semana pico se compara contra el promedio del periodo', async () => {
    servir(mes());

    montar();

    await waitFor(() => expect(screen.getByText('Semana de mayor consumo')).toBeInTheDocument());
    // La semana del 12 lleva el pico: por encima de la media de las demás.
    expect(screen.getByText(/sobre el promedio/)).toBeInTheDocument();
  });
});

describe('cuando el detalle falla', () => {
  test('si el mapa de calor no responde, el reporte se muestra igual', async () => {
    servir(mes(), { heatmap: false });

    montar();

    // Lo que no depende del mapa sigue en pie.
    await waitFor(() => expect(screen.getByText('Consumo por semana')).toBeInTheDocument());
    expect(screen.getByText('Día de mayor consumo')).toBeInTheDocument();
    expect(screen.getByText('Importación vs. exportación')).toBeInTheDocument();
    // Y no hay un error global por una sección accesoria.
    expect(screen.queryByText('No se pudo generar el reporte.')).toBeNull();
    // Solo falta lo que salía de ahí.
    expect(screen.queryByText('Hora pico')).toBeNull();
    expect(screen.queryByText('Reparto hora × día')).toBeNull();
  });
});

describe('la regla del dinero', () => {
  test('ninguna tarjeta del detalle muestra pesos', async () => {
    servir(mes());

    montar();

    await waitFor(() => expect(screen.getByText('Consumo por semana')).toBeInTheDocument());
    const detalle = screen.getByText('Día de mayor consumo').closest('.grid');
    // El crédito por exportar se reparte contra el mes: un total semanal en
    // pesos armado en el cliente no cuadraría con la factura.
    expect(detalle!.textContent).not.toContain('$');
  });
});

// --- andamiaje ---------------------------------------------------------

function montar(): void {
  render(
    <MemoryRouter initialEntries={['/reports?period=month']}>
      <DeviceContext.Provider value={deviceContext}>
        <Reports />
      </DeviceContext.Provider>
    </MemoryRouter>,
  );
}

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

function servir(data: ReportData, opciones: { heatmap?: boolean } = {}): void {
  const conHeatmap = opciones.heatmap ?? true;
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    if (url === '/analytics/heatmap' && !conHeatmap) {
      return Promise.reject(new Error('sin mapa'));
    }
    const cuerpo: unknown = url.startsWith('/reports/')
      ? data
      : url === '/analytics/heatmap'
        ? HEATMAP
        : url === '/analytics/daily-profile'
          ? []
          : null;
    return Promise.resolve({
      data: { success: true, message: '', data: cuerpo },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
}

afterEach(cleanup);

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});
