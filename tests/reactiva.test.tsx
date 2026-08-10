/**
 * La página de energía reactiva por cuadrante (GET /analytics/reactive-quadrants).
 *
 * El endpoint ya nace consolidado (cuadrantes + balance + tendencia en una sola
 * llamada); este test fija que la página no crezca más peticiones sin que alguien
 * lo decida y que la lectura de los cuadrantes Q1..Q4 se muestre.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import Reactiva from '../src/pages/Reactiva';
import { DeviceContext } from '../src/context/DeviceContext';
import type { ReactiveQuadrantsResult } from '../src/api/types';

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

const RESULT: ReactiveQuadrantsResult = {
  period_start: '2026-08-10T00:00:00Z',
  period_end: '2026-08-10T23:59:59Z',
  device_id: 'eq-elegido',
  q1_kvarh: 10,
  q2_kvarh: 20,
  q3_kvarh: 5,
  q4_kvarh: 3,
  total_import_kvarh: 30,
  total_export_kvarh: 8,
  balance_kvarh: 22,
  dominant: 'q2',
  dominant_kvarh: 20,
  trend: [
    { time: '2026-08-10T06:00:00Z', q1_kvarh: 2, q2_kvarh: 4, q3_kvarh: 1, q4_kvarh: 0 },
    { time: '2026-08-10T12:00:00Z', q1_kvarh: 1, q2_kvarh: 3, q3_kvarh: 0, q4_kvarh: 1 },
  ],
};

const SIN_REACTIVA: ReactiveQuadrantsResult = {
  ...RESULT,
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

describe('al montar', () => {
  test('pide los cuadrantes una sola vez, con el medidor elegido', async () => {
    servir(RESULT);

    montar();

    await waitFor(() => expect(screen.getByText('Reactiva importada')).toBeInTheDocument());

    const pedidos = parametros.filter((p) => String(p.url) === '/analytics/reactive-quadrants');
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ device_id: 'eq-elegido' });
  });

  test('muestra importada, exportada, balance y el cuadrante dominante', async () => {
    servir(RESULT);

    montar();

    await waitFor(() => expect(screen.getByText('Reactiva importada')).toBeInTheDocument());
    expect(screen.getByText('30.00 kvarh')).toBeInTheDocument(); // importada (Q1+Q2)
    expect(screen.getByText('8.00 kvarh')).toBeInTheDocument(); // exportada (Q3+Q4)
    expect(screen.getByText('+22.00 kvarh')).toBeInTheDocument(); // balance
    expect(
      screen.getByText('Cuadrante dominante: Q2 · Importada capacitiva (20.00 kvarh)'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Q1 · Importada inductiva').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Q4 · Exportada inductiva').length).toBeGreaterThan(0);
  });

  test('sin reactiva muestra el estado vacío y nada de cuadrantes', async () => {
    servir(SIN_REACTIVA);

    montar();

    await waitFor(() => expect(screen.getByText('Sin energía reactiva')).toBeInTheDocument());
    expect(screen.queryByText(/Cuadrante dominante/)).not.toBeInTheDocument();
    expect(screen.queryByText('Q1 · Importada inductiva')).not.toBeInTheDocument();
  });
});

// --- andamiaje ---------------------------------------------------------

function montar(): void {
  render(
    <DeviceContext.Provider value={deviceContext}>
      <Reactiva />
    </DeviceContext.Provider>,
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
let parametros: Record<string, unknown>[] = [];

function servir(resultado: ReactiveQuadrantsResult): void {
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    parametros.push({ url, ...(config.params ?? {}) });

    const data: unknown = url === '/analytics/reactive-quadrants' ? resultado : null;

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
