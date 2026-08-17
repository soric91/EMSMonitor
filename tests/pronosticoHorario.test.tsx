/**
 * F3.1 — el pronóstico de consumo por hora.
 *
 * Es lo único de la pantalla que todavía no pasó, así que lo que se protege
 * acá es que no se pueda confundir con una medición: viene etiquetado como
 * pronóstico, con su banda, y con el error medido a la vista.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { PowerForecastCard } from '../src/components/dashboard/PowerForecastCard';
import { DeviceContext } from '../src/context/DeviceContext';
import type { PowerForecast } from '../src/api/types';

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

const PRONOSTICO: PowerForecast = {
  device_id: 'eq-elegido',
  target: 'import_kwh',
  horizon_hours: 48,
  method: 'ewma_por_tipo_de_dia_y_hora',
  points: [
    { time: '2026-08-15T00:00:00Z', kwh: 1.0, p10: 0.8, p90: 1.3 },
    { time: '2026-08-15T01:00:00Z', kwh: 4.0, p10: 3.2, p90: 4.9 },
    { time: '2026-08-15T02:00:00Z', kwh: 2.0, p10: 1.5, p90: 2.4 },
  ],
  backtest: { hours: 168, mae_kwh: 0.31, naive_mae_kwh: 0.47 },
};

describe('el pronóstico horario', () => {
  test('suma el total esperado y señala el pico', async () => {
    servir(PRONOSTICO);

    render(<PowerForecastCard />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('7.00 kWh')).toBeInTheDocument());
    expect(screen.getByText(/Pico esperado a las/)).toBeInTheDocument();
    expect(screen.getByText(/4\.00 kWh en esa hora/)).toBeInTheDocument();
  });

  test('dice que es un pronóstico, no una medición', async () => {
    servir(PRONOSTICO);

    render(<PowerForecastCard />, { wrapper: ConDispositivo });

    await waitFor(() =>
      expect(screen.getByText(/es un pronóstico, no una medición/)).toBeInTheDocument(),
    );
  });

  test('muestra cuánto suele fallar, contra repetir el día anterior', async () => {
    // Si el pronóstico va a guiar una decisión, quien lo lee merece saber su
    // error medido.
    servir(PRONOSTICO);

    render(<PowerForecastCard />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText(/falló 0\.31 kWh por hora/)).toBeInTheDocument());
    expect(screen.getByText(/contra 0\.47 kWh de repetir el día anterior/)).toBeInTheDocument();
  });

  test('sin historial suficiente no dibuja nada y explica por qué', async () => {
    servir({ ...PRONOSTICO, method: 'insufficient_history', points: [], backtest: null });

    render(<PowerForecastCard />, { wrapper: ConDispositivo });

    await waitFor(() =>
      expect(screen.getByText(/Hacen falta dos semanas de lecturas horarias/)).toBeInTheDocument(),
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

function servir(forecast: PowerForecast): void {
  apiClient.defaults.adapter = (config) => {
    const data: unknown = config.url === '/forecast/power' ? forecast : null;
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
