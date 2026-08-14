/**
 * El estado de los dispositivos (OPERACIÓN): lee el inventario que
 * DeviceProvider ya trajo — no agrega peticiones.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { DeviceProvider } from '../src/context/DeviceContext';
import { DeviceStatus } from '../src/components/dashboard/DeviceStatus';

const MEDIDOR = {
  device_id: 'eq-1',
  nombre: 'Tablero',
  modbus_id: 10,
  sede_id: 's1',
  sede: 'Planta Norte',
  gateway_id: 'g1',
  gateway: 'GW-0001',
  gateway_en_linea: true,
};

const adapterOriginal = apiClient.defaults.adapter;

function servir(devices: unknown): void {
  apiClient.defaults.adapter = (config) =>
    Promise.resolve({
      data: { success: true, message: '', data: devices },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
}

function montar(): void {
  render(
    <DeviceProvider>
      <DeviceStatus />
    </DeviceProvider>,
  );
}

afterEach(() => {
  cleanup();
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});

describe('DeviceStatus', () => {
  test('muestra el gateway, su estado y sus medidores', async () => {
    servir([MEDIDOR]);
    montar();

    await waitFor(() => expect(screen.getByText('GW-0001')).toBeInTheDocument());
    expect(screen.getByText('Planta Norte')).toBeInTheDocument();
    expect(screen.getByText('en línea')).toBeInTheDocument();
    expect(screen.getByText('Tablero')).toBeInTheDocument();
  });

  test('marca un gateway caído', async () => {
    servir([{ ...MEDIDOR, gateway_en_linea: false }]);
    montar();

    await waitFor(() => expect(screen.getByText('sin conexión')).toBeInTheDocument());
  });

  test('sin dispositivos muestra un empty state honesto', async () => {
    servir([]);
    montar();

    await waitFor(() => expect(screen.getByText('Sin dispositivos.')).toBeInTheDocument());
  });
});
