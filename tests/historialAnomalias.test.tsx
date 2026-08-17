/**
 * F2.4 — la línea de tiempo de "qué pasó".
 *
 * Dos cosas separadas a propósito: un día atípico ya pasó y no pide nada; un
 * cambio de nivel sigue costando plata todos los días hasta que alguien lo
 * revise, así que va arriba y con más peso.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { InsightsTimeline } from '../src/components/dashboard/InsightsTimeline';
import { DeviceContext } from '../src/context/DeviceContext';
import type { Alert, AlertsHistory } from '../src/api/types';

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

function anomalia(dia: string, valor: number, severity: Alert['severity'] = 'moderate'): Alert {
  return {
    kind: 'daily_total',
    severity,
    device_id: 'eq-elegido',
    variable: 'TotWh_import',
    value: valor,
    expected_low: 8,
    expected_high: 14,
    bucket: 1,
    timestamp: `${dia}T05:00:00Z`,
    message: `Consumo del martes inusual: ${valor.toFixed(2)} kWh (lo típico es entre 8.00 y 14.00 kWh)`,
  };
}

const VACIO: AlertsHistory = {
  device_id: 'eq-elegido',
  period_start: '2026-07-11T05:00:00Z',
  period_end: '2026-08-10T05:00:00Z',
  days_analyzed: 30,
  anomalies: [],
  level_shift: null,
};

describe('la línea de tiempo', () => {
  test('el cambio de nivel se cuenta con su frase, no como un día más', async () => {
    servir({
      ...VACIO,
      level_shift: {
        detected_at: '2026-08-03T05:00:00Z',
        before_kwh: 12.4,
        after_kwh: 19.8,
        delta_pct: 59.7,
        direction: 'up',
        message:
          'Desde el 3 de agosto tu consumo diario subió de 12.4 a 19.8 kWh en un día típico, y se mantuvo ahí.',
      },
    });

    render(<InsightsTimeline />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText(/Desde el 3 de agosto/)).toBeInTheDocument());
    expect(screen.getByText(/\+59\.7% respecto de antes/)).toBeInTheDocument();
  });

  test('sin nada raro lo dice, en vez de dejar un hueco', async () => {
    servir(VACIO);

    render(<InsightsTimeline />, { wrapper: ConDispositivo });

    await waitFor(() =>
      expect(
        screen.getByText('Ningún día se salió de lo normal en 30 días analizados.'),
      ).toBeInTheDocument(),
    );
  });

  test('sin días completos no dice que todo estuvo bien', async () => {
    // "Ningún día se salió de lo normal" con cero días analizados sería una
    // afirmación sobre datos que no se miraron.
    servir({ ...VACIO, days_analyzed: 0 });

    render(<InsightsTimeline />, { wrapper: ConDispositivo });

    await waitFor(() =>
      expect(screen.getByText('Todavía no hay días completos para analizar.')).toBeInTheDocument(),
    );
  });

  test('lista las anomalías y resume el resto', async () => {
    const dias = Array.from({ length: 10 }, (_, i) =>
      anomalia(`2026-08-${String(i + 1).padStart(2, '0')}`, 30 + i),
    );
    servir({ ...VACIO, anomalies: dias });

    render(<InsightsTimeline />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getAllByText(/Consumo del martes inusual/)).toHaveLength(8));
    expect(screen.getByText(/y 2 días atípicos más en el periodo/)).toBeInTheDocument();
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

function servir(historial: AlertsHistory): void {
  apiClient.defaults.adapter = (config) => {
    const data: unknown = config.url === '/alerts/history' ? historial : null;
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
