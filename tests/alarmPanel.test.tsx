/**
 * El panel de alarmas (OPERACIÓN): lee las alertas que AlertsProvider ya trajo
 * de /alerts y mantiene por WS — no agrega peticiones.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { DeviceProvider } from '../src/context/DeviceContext';
import { RealtimeProvider } from '../src/context/RealtimeContext';
import { VariablesProvider } from '../src/context/VariablesContext';
import { AlertsProvider } from '../src/context/AlertsContext';
import { AlarmPanel } from '../src/components/dashboard/AlarmPanel';
import type { AlertsData } from '../src/api/types';

const ALERTA_ALTA = {
  kind: 'hourly_power',
  severity: 'high',
  device_id: 'eq-1',
  variable: 'TotW',
  value: 999,
  expected_low: 10,
  expected_high: 50,
  bucket: 10,
  timestamp: '2026-08-13T20:30:00Z',
  message: 'Potencia importada inusual a las 10:00',
};

const adapterOriginal = apiClient.defaults.adapter;
const WebSocketOriginal = globalThis.WebSocket;

class WebSocketMudo {
  static readonly CONNECTING = 0;
  readyState = WebSocketMudo.CONNECTING;
  close(): void {}
  addEventListener(): void {}
  send(): void {}
}

function servir(alerts: AlertsData): void {
  globalThis.WebSocket = WebSocketMudo as unknown as typeof WebSocket;
  apiClient.defaults.adapter = (config) => {
    const data: unknown =
      config.url === '/devices' ? [] : config.url === '/variables' ? [] : alerts;
    return Promise.resolve({
      data: { success: true, message: '', data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
}

function montar(): void {
  render(
    <VariablesProvider>
      <DeviceProvider>
        <RealtimeProvider>
          <AlertsProvider>
            <AlarmPanel />
          </AlertsProvider>
        </RealtimeProvider>
      </DeviceProvider>
    </VariablesProvider>,
  );
}

afterEach(() => {
  cleanup();
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
  globalThis.WebSocket = WebSocketOriginal;
});

describe('AlarmPanel', () => {
  test('muestra las alertas recientes con su severidad', async () => {
    servir({ recent: [ALERTA_ALTA], daily_total: null });
    montar();

    await waitFor(() => expect(screen.getByText('Alta')).toBeInTheDocument());
    expect(screen.getByText('Potencia importada inusual a las 10:00')).toBeInTheDocument();
    expect(screen.getByText('1 alerta')).toBeInTheDocument();
  });

  test('sin alertas muestra el empty state', async () => {
    servir({ recent: [], daily_total: null });
    montar();

    await waitFor(() =>
      expect(screen.getByText('Sin alertas — consumo dentro de lo normal')).toBeInTheDocument(),
    );
  });
});
