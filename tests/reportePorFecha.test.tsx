/**
 * El reporte por fecha.
 *
 * Existía como un tab más —"Personalizado"— y arrastraba fallas que solo se
 * ven usándolo: el PDF salía del mes en curso aunque en pantalla hubiera otro
 * rango, todos los CSV se llamaban igual, un rango invertido llegaba al
 * backend, y recargar la página perdía el reporte. Los cuatro periodos fijos
 * son ahora atajos del mismo mecanismo: un rango de fechas.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { rmSync } from 'node:fs';
import { apiClient } from '../src/api/client';
import Reports from '../src/pages/Reports';
import { DeviceContext } from '../src/context/DeviceContext';
import { RANGE_PRESETS, finDeRangoPedible } from '../src/domain/periods';
import { getCustomReport } from '../src/api/reports';
import { startOfLocalMonth } from '../src/utils/timezone';
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
  period_start: '2026-07-01T05:00:00Z',
  period_end: '2026-08-01T05:00:00Z',
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

const COSTOS: CostBreakdown = {
  period: 'custom',
  device_id: 'eq-1',
  period_start: '2026-07-01T05:00:00Z',
  period_end: '2026-08-01T05:00:00Z',
  consumption_kwh: 380,
  export_kwh: 55,
  consumption_cost_cop: 237500,
  export_credit_cop: 34000,
  export_tier1_kwh: 55,
  export_tier2_kwh: 0,
  export_tier1_credit_cop: 34000,
  export_tier2_credit_cop: 0,
  net_cost_cop: 203500,
  months_used: ['2026-07'],
  stale_months: [],
  series: [],
};

const REPORTE: ReportData = {
  report_type: 'custom',
  device_id: 'eq-1',
  period_start: '2026-07-01T05:00:00Z',
  period_end: '2026-08-01T05:00:00Z',
  consumption_kwh: 380,
  export_kwh: 55,
  net_balance_kwh: 325,
  consumption_series: [{ time: '2026-07-01T05:00:00Z', value: 12 }],
  export_series: [],
  kpis: KPIS,
  max_demand: {
    period_start: '2026-07-01T05:00:00Z',
    period_end: '2026-08-01T05:00:00Z',
    device_id: 'eq-1',
    peak_power_w: null,
    peak_at: null,
  },
  load_factor: {
    period_start: '2026-07-01T05:00:00Z',
    period_end: '2026-08-01T05:00:00Z',
    device_id: 'eq-1',
    average_import_w: null,
    peak_import_w: null,
    load_factor: null,
  },
  base_load: {
    period_start: '2026-07-01T05:00:00Z',
    period_end: '2026-08-01T05:00:00Z',
    device_id: 'eq-1',
    percentile: 10,
    base_load_w: null,
  },
  costs: COSTOS,
  generated_at: '2026-08-01T05:00:00Z',
};

describe('pedir un rango', () => {
  test('Generar consulta /reports/custom con las fechas elegidas', async () => {
    servir();

    montar('/reports?period=custom&from=2026-07-01T05:00:00.000Z&to=2026-08-01T05:00:00.000Z');

    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());
    const pedido = pedidos.find((p) => p.url === '/reports/custom');
    expect(pedido).toBeDefined();
    expect(pedido!.from).toBe('2026-07-01T05:00:00.000Z');
    // El fin sale corrido un milisegundo: ver el bloque de la medianoche.
    expect(pedido!.to).toBe('2026-08-01T04:59:59.999Z');
  });

  test('un rango en la URL se reconstruye al recargar, sin tocar los controles', async () => {
    servir();

    montar('/reports?period=custom&from=2026-07-01T05:00:00.000Z&to=2026-08-01T05:00:00.000Z');

    // Sin la URL, esto exigía volver a elegir las fechas y presionar Generar.
    await waitFor(() => expect(screen.getAllByText('380.00 kWh').length).toBeGreaterThan(0));
  });

  test('los periodos fijos siguen saliendo de su propia ruta', async () => {
    servir();

    montar('/reports');

    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());
    expect(pedidos.map((p) => p.url)).toContain('/reports/daily');
  });
});

describe('rangos que no se pueden pedir', () => {
  test('un rango invertido no llega al backend: se ataja acá', async () => {
    servir();

    montar('/reports?period=custom&from=2026-08-01T05:00:00.000Z&to=2026-07-01T05:00:00.000Z');

    await waitFor(() =>
      expect(screen.getByText('La fecha inicial es posterior a la final.')).toBeInTheDocument(),
    );
    expect(screen.getByText('Generar')).toBeDisabled();
  });

  test('un rango de duración cero tampoco', async () => {
    servir();

    montar('/reports?period=custom&from=2026-08-01T05:00:00.000Z&to=2026-08-01T05:00:00.000Z');

    await waitFor(() =>
      expect(screen.getByText('El rango no abarca ningún tiempo.')).toBeInTheDocument(),
    );
    expect(screen.getByText('Generar')).toBeDisabled();
  });
});

describe('los atajos de calendario', () => {
  test('"Mes pasado" arranca en la medianoche de Bogotá del día 1', () => {
    const preset = RANGE_PRESETS.find((p) => p.label === 'Mes pasado');
    const { from } = preset!.rango();

    expect(from).toBe(startOfLocalMonth(-1).toISOString());
    // Medianoche en Bogotá son las 05:00 UTC: cortar en UTC daría el mes
    // corrido cinco horas.
    expect(from.endsWith('T05:00:00.000Z')).toBe(true);
  });

  test('"Mes pasado" termina en el último instante del mes, no en el primero del siguiente', () => {
    const { to } = RANGE_PRESETS.find((p) => p.label === 'Mes pasado')!.rango();

    expect(new Date(to).getTime()).toBe(startOfLocalMonth(0).getTime() - 1);
  });

  test('"Este mes" arranca el día 1 y llega hasta ahora', () => {
    const { from, to } = RANGE_PRESETS.find((p) => p.label === 'Este mes')!.rango();

    expect(from).toBe(startOfLocalMonth(0).toISOString());
    expect(new Date(to).getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('siguen existiendo las ventanas móviles', () => {
    expect(RANGE_PRESETS.map((p) => p.label)).toEqual([
      'Últimas 24h',
      'Últimos 7 días',
      'Últimos 30 días',
      'Este mes',
      'Mes pasado',
      'Este año',
    ]);
  });
});

describe('el nombre del CSV', () => {
  test('lleva las fechas del rango, no el tipo de reporte', async () => {
    servir();

    montar('/reports?period=custom&from=2026-07-01T05:00:00.000Z&to=2026-08-01T05:00:00.000Z');

    await waitFor(() => expect(screen.getByText('Exportar CSV')).toBeInTheDocument());
    screen.getByText('Exportar CSV').click();

    // Antes: `reporte_custom.csv` para todos los rangos, que se pisaban entre sí.
    expect(nombres.at(-1)).toBe('reporte_2026-07-01_2026-08-01.csv');
  });
});

describe('el informe en PDF', () => {
  test('se arma con el rango en pantalla, no con el mes en curso', async () => {
    servir();

    montar('/reports?period=custom&from=2026-07-01T05:00:00.000Z&to=2026-08-01T05:00:00.000Z');

    await waitFor(() => expect(screen.getByText('Importado')).toBeInTheDocument());
    pedidos.length = 0;
    screen.getByText('Informe del periodo (PDF)').click();

    await waitFor(() => expect(pedidos.some((p) => p.url === '/analytics/coverage')).toBe(true));
    // El bug: el botón calculaba mesActual() e ignoraba lo que se estaba viendo.
    const cobertura = pedidos.find((p) => p.url === '/analytics/coverage');
    expect(cobertura!.from).toBe(REPORTE.period_start);
    expect(cobertura!.to).toBe(REPORTE.period_end);
    expect(cobertura!.from).not.toBe(startOfLocalMonth(0).toISOString());
  });
});

// --- andamiaje ---------------------------------------------------------

function montar(ruta: string): void {
  render(
    <MemoryRouter initialEntries={[ruta]}>
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

// La descarga real abre un link temporal: acá solo interesa cómo se llamó.
Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:test', configurable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });
const crearOriginal = document.createElement.bind(document);
document.createElement = ((tag: string) => {
  const nodo = crearOriginal(tag);
  if (tag === 'a') {
    nodo.click = () => nombres.push((nodo as HTMLAnchorElement).download);
  }
  return nodo;
}) as typeof document.createElement;

function servir(): void {
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    pedidos.push({ url, ...(config.params ?? {}) });
    return Promise.resolve({
      data: { success: true, message: '', data: url.startsWith('/reports/') ? REPORTE : null },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
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
  // jsPDF, corriendo fuera de un navegador, escribe el archivo en disco: el
  // test pide el informe de verdad para comprobar con qué rango se arma, y
  // deja un PDF en la raíz del repo si nadie lo recoge.
  rmSync('informe_energia_2026-07.pdf', { force: true });
});

describe('la medianoche que reventaba el backend', () => {
  // ApiEMS devuelve 500 cuando `to` cae exactamente en el primer instante de un
  // día local: arma internamente una subconsulta vacía y InfluxDB responde
  // `cannot query an empty range`. Le pasaba a TODOS los presets de calendario.
  test('un fin en medianoche local sale corrido un milisegundo', () => {
    expect(finDeRangoPedible('2026-08-01T05:00:00.000Z')).toBe('2026-08-01T04:59:59.999Z');
  });

  test('cualquier otra hora viaja intacta', () => {
    expect(finDeRangoPedible('2026-08-01T20:00:00.000Z')).toBe('2026-08-01T20:00:00.000Z');
    expect(finDeRangoPedible('2026-08-01T05:00:00.001Z')).toBe('2026-08-01T05:00:00.001Z');
  });

  test('la medianoche que importa es la de Bogotá, no la de UTC', () => {
    // 00:00 UTC son las 19:00 del día anterior en Bogotá: un rango que termina
    // ahí no dispara el bug y no hay por qué tocarlo.
    expect(finDeRangoPedible('2026-08-01T00:00:00.000Z')).toBe('2026-08-01T00:00:00.000Z');
  });

  test('el ajuste llega al endpoint aunque el rango venga de otra pantalla', async () => {
    servir();

    await getCustomReport({ from: '2026-07-01T05:00:00.000Z', to: '2026-08-01T05:00:00.000Z' });

    expect(pedidos.at(-1)!.to).toBe('2026-08-01T04:59:59.999Z');
  });
});
