/**
 * El selector de agrupación de la gráfica de energía.
 *
 * Un rango de 30 días salía en ~500 barras de dos píxeles, con el eje
 * repitiendo la misma fecha porque varias ventanas caían dentro del mismo día.
 * Ahora el periodo abre agrupado como corresponde a su duración, y quien
 * quiera más detalle lo pide — y lo que elija vale también para el CSV.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '../src/api/client';
import Reports from '../src/pages/Reports';
import { DeviceContext } from '../src/context/DeviceContext';
import {
  agrupacionPorDefecto,
  agrupacionesDisponibles,
  formatoDeBucket,
} from '../src/domain/periods';
import type { CostBreakdown, KpiSummary, ReportData } from '../src/api/types';

const MES = ['2026-07-21T05:00:00.000Z', '2026-08-20T05:00:00.000Z'] as const;
const DIA = ['2026-08-19T05:00:00.000Z', '2026-08-20T05:00:00.000Z'] as const;

describe('qué agrupaciones se ofrecen', () => {
  test('un mes se puede ver por hora, por día o por semana', () => {
    expect(agrupacionesDisponibles(...MES).map((o) => o.key)).toEqual(['hour', 'day', 'week']);
  });

  test('un solo día no se ofrece por semana: sería una barra', () => {
    expect(agrupacionesDisponibles(...DIA).map((o) => o.key)).toEqual(['hour']);
  });

  test('dos años no se ofrecen por hora: serían diecisiete mil barras', () => {
    const claves = agrupacionesDisponibles(
      '2024-01-01T05:00:00.000Z',
      '2026-01-01T05:00:00.000Z',
    ).map((o) => o.key);

    expect(claves).toEqual(['day', 'week']);
  });
});

describe('cuál viene puesta', () => {
  test('un mes abre por día, que es lo que se pidió ver', () => {
    expect(agrupacionPorDefecto(...MES)).toBe('day');
  });

  test('un día abre por hora: agruparlo por día sería una sola barra', () => {
    expect(agrupacionPorDefecto(...DIA)).toBe('hour');
  });

  test('un rango de años abre por semana', () => {
    expect(agrupacionPorDefecto('2024-01-01T05:00:00.000Z', '2026-01-01T05:00:00.000Z')).toBe(
      'week',
    );
  });
});

describe('la etiqueta del eje sigue a la agrupación', () => {
  test('treinta días por hora llevan la hora, aunque el rango sea de un mes', () => {
    // Sin esto, 720 barras salían rotuladas solo con la fecha y la misma
    // etiqueta se repetía veinticuatro veces.
    expect(formatoDeBucket(...MES, 'hour')).toBe('d MMM HH:mm');
  });

  test('por día basta la fecha', () => {
    expect(formatoDeBucket(...MES, 'day')).toBe('d MMM');
  });

  test('sin agrupación elegida decide la duración, como antes', () => {
    expect(formatoDeBucket(...MES)).toBe('d MMM');
    expect(formatoDeBucket(...DIA)).toBe('HH:mm');
  });
});

describe('en la página', () => {
  test('elegir otra agrupación vuelve a pedir el reporte con ese paso', async () => {
    servir();

    montar();

    await waitFor(() =>
      expect(screen.getByText('Importación vs. exportación')).toBeInTheDocument(),
    );
    // Por defecto no se le impone nada al backend: aplica su propia escalera.
    expect(pedidos[0]!.bucket).toBeUndefined();

    fireEvent.click(screen.getByText('Hora'));

    await waitFor(() => expect(pedidos.at(-1)!.bucket).toBe('hour'));
  });

  test('el CSV se baja con la agrupación que se está viendo', async () => {
    servir();

    montar();

    await waitFor(() => expect(screen.getByText('Exportar CSV')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Hora'));
    await waitFor(() => expect(pedidos.at(-1)!.bucket).toBe('hour'));
    fireEvent.click(screen.getByText('Exportar CSV'));

    expect(nombres.at(-1)).toContain('_hour.csv');
  });

  test('cambiar la agrupación no borra la página: solo cambian las barras', async () => {
    servir();

    montar();

    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Hora'));

    // Mientras llega el reporte nuevo, los totales, el desglose de costos y
    // los KPIs siguen en pantalla: es el mismo periodo contado en otras barras.
    expect(screen.getByText('Importado')).toBeInTheDocument();
    expect(screen.getByText('Importación vs. exportación')).toBeInTheDocument();
    expect(screen.getByText('Potencia promedio')).toBeInTheDocument();

    await waitFor(() => expect(pedidos.at(-1)!.bucket).toBe('hour'));
  });

  test('si la recarga falla, se avisa y no se borra lo que ya estaba', async () => {
    servir();

    montar();
    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());

    fallar();
    fireEvent.click(screen.getByText('Hora'));

    await waitFor(() =>
      expect(screen.getByText(/No se pudo actualizar el reporte/)).toBeInTheDocument(),
    );
    // Los números viejos siguen, pero dichos como lo que son.
    expect(screen.getByText('Importado')).toBeInTheDocument();
  });

  test('un periodo sin alternativas no muestra un selector de una sola opción', async () => {
    servir(reporte(...DIA));

    montar();

    await waitFor(() =>
      expect(screen.getByText('Importación vs. exportación')).toBeInTheDocument(),
    );
    // Un día solo admite "Hora": ofrecerlo sería un botón que no hace nada.
    expect(screen.queryByText('Semana')).toBeNull();
  });
});

// --- andamiaje ---------------------------------------------------------

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
  period_start: MES[0],
  period_end: MES[1],
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

function reporte(inicio: string, fin: string): ReportData {
  const costs: CostBreakdown = {
    period: 'custom',
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
  return {
    report_type: 'custom',
    device_id: 'eq-1',
    period_start: inicio,
    period_end: fin,
    consumption_kwh: 380,
    export_kwh: 0,
    net_balance_kwh: 380,
    consumption_series: [{ time: inicio, value: 12 }],
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
    costs,
    generated_at: fin,
  };
}

function montar(): void {
  render(
    <MemoryRouter initialEntries={[`/reports?period=custom&from=${MES[0]}&to=${MES[1]}`]}>
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

let pedidos: Record<string, unknown>[] = [];
let nombres: string[] = [];

const adapterOriginal = apiClient.defaults.adapter;

Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:test', configurable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
const crearOriginal = document.createElement.bind(document);
document.createElement = ((tag: string) => {
  const nodo = crearOriginal(tag);
  if (tag === 'a') nodo.click = () => nombres.push((nodo as HTMLAnchorElement).download);
  return nodo;
}) as typeof document.createElement;

function servir(data: ReportData = reporte(...MES)): void {
  apiClient.defaults.adapter = (config) => {
    pedidos.push({ url: config.url ?? '', ...(config.params ?? {}) });
    return Promise.resolve({
      data: { success: true, message: '', data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
}

/** La siguiente consulta falla, como una recarga que no llega. */
function fallar(): void {
  apiClient.defaults.adapter = (config) => {
    pedidos.push({ url: config.url ?? '', ...(config.params ?? {}) });
    return Promise.reject(new Error('sin respuesta'));
  };
}

afterEach(() => {
  cleanup();
  pedidos = [];
  nombres = [];
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
  document.createElement = crearOriginal as typeof document.createElement;
});
