/**
 * F3.2 — la comparación con las otras sedes del mismo cliente.
 *
 * Se muestra el ranking y no solo la posición: "estás en el percentil 60" no
 * le dice a nadie qué hacer, mientras que ver que la bodega consume el doble
 * que la oficina sí señala dónde mirar.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { BenchmarkCard } from '../src/components/dashboard/BenchmarkCard';
import { DeviceContext } from '../src/context/DeviceContext';
import type { BenchmarkResult } from '../src/api/types';

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

const CON_GRUPO: BenchmarkResult = {
  device_id: 'eq-elegido',
  period_start: '2026-07-11T05:00:00Z',
  period_end: '2026-08-10T05:00:00Z',
  days: 30,
  own_kwh_per_day: 20,
  median_kwh_per_day: 10,
  percentile: 66.7,
  peers: [
    { device_id: 'c', name: 'Oficina', site: 'Norte', kwh_per_day: 5, is_self: false },
    { device_id: 'b', name: 'Bodega', site: 'Sur', kwh_per_day: 10, is_self: false },
    { device_id: 'eq-elegido', name: 'Tablero', site: 'Planta', kwh_per_day: 20, is_self: true },
  ],
  enough_peers: true,
};

describe('la comparación entre sedes', () => {
  test('ubica la sede contra la mediana de las demás', async () => {
    servir(CON_GRUPO);

    render(<BenchmarkCard />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText(/por encima de/)).toBeInTheDocument());
    expect(screen.getByText('Oficina')).toBeInTheDocument();
    expect(screen.getByText('Bodega')).toBeInTheDocument();
  });

  test('con menos de tres sedes no habla de ranking', async () => {
    servir({
      ...CON_GRUPO,
      median_kwh_per_day: null,
      percentile: null,
      enough_peers: false,
      peers: CON_GRUPO.peers.slice(2),
    });

    render(<BenchmarkCard />, { wrapper: ConDispositivo });

    await waitFor(() =>
      expect(screen.getByText(/Hacen falta al menos tres sedes/)).toBeInTheDocument(),
    );
    // El dato propio sí se muestra: es una medición, no una comparación.
    expect(screen.getAllByText(/20\.00 kWh/).length).toBeGreaterThan(0);
  });

  test('sin consumo registrado lo dice', async () => {
    servir({ ...CON_GRUPO, own_kwh_per_day: null, peers: [], enough_peers: false });

    render(<BenchmarkCard />, { wrapper: ConDispositivo });

    await waitFor(() =>
      expect(screen.getByText(/Sin consumo registrado en los últimos 30 días/)).toBeInTheDocument(),
    );
  });

  test('aclara que solo compara sedes propias del mismo tipo', async () => {
    servir(CON_GRUPO);

    render(<BenchmarkCard />, { wrapper: ConDispositivo });

    await waitFor(() =>
      expect(
        screen.getByText(/Solo tus propias sedes, y solo las del mismo tipo/),
      ).toBeInTheDocument(),
    );
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

function servir(resultado: BenchmarkResult): void {
  apiClient.defaults.adapter = (config) => {
    const data: unknown = config.url === '/analytics/benchmark' ? resultado : null;
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
