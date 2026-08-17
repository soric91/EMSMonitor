/**
 * F1.4 y F1.6 — la curva de duración de carga y las miniseries de los KPIs.
 *
 * La curva sola no se lee sin práctica: lo que se protege acá es la frase que
 * la resume. Y la miniserie tiene que aparecer solo cuando hay serie: un
 * número con una línea plana inventada miente más que el número solo.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { Sparkline } from '../src/components/charts/Sparkline';
import { KpiCard } from '../src/components/dashboard/KpiCard';
import { LoadDurationCard } from '../src/components/dashboard/LoadDurationCard';
import { DeviceContext } from '../src/context/DeviceContext';
import type { LoadDurationResult } from '../src/api/types';

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

const DESDE = '2026-08-01T00:00:00Z';
const HASTA = '2026-08-15T00:00:00Z';

const DURACION: LoadDurationResult = {
  device_id: 'eq-elegido',
  period_start: DESDE,
  period_end: HASTA,
  sample_seconds: 900,
  points: [
    { time_fraction: 0, power_w: 6000 },
    { time_fraction: 0.5, power_w: 900 },
    { time_fraction: 1, power_w: 120 },
  ],
  p1_w: 5800,
  p5_w: 4200,
  p50_w: 900,
  p95_w: 130,
  top_fraction: 0.05,
  top_energy_share: 0.22,
  sample_count: 1344,
};

describe('1.4 · la curva de duración', () => {
  test('la resume en una frase que se lee sin saber leer la curva', async () => {
    servir(DURACION);

    render(<LoadDurationCard fromIso={DESDE} toIso={HASTA} />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('4.20 kW')).toBeInTheDocument());
    expect(screen.getByText('22%')).toBeInTheDocument();
    expect(screen.getByText(/del tiempo consumes por encima de/)).toBeInTheDocument();
    expect(screen.getByText(/solo horas de importación/)).toBeInTheDocument();
  });

  test('sin datos no dibuja una curva vacía', async () => {
    servir({
      ...DURACION,
      points: [],
      p1_w: null,
      p5_w: null,
      p50_w: null,
      p95_w: null,
      top_energy_share: null,
      sample_count: 0,
    });

    render(<LoadDurationCard fromIso={DESDE} toIso={HASTA} />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('Sin datos suficientes.')).toBeInTheDocument());
  });
});

describe('1.6 · las miniseries', () => {
  test('un solo punto no es una tendencia', () => {
    const { container } = render(<Sparkline values={[5]} />);

    expect(container).toBeEmptyDOMElement();
  });

  test('valores iguales no revientan la escala', () => {
    // Sin protección, el rango cero dividiría por cero y la línea saldría NaN.
    render(<Sparkline values={[3, 3, 3]} label="constante" />);

    const puntos = screen.getByLabelText('constante').querySelector('polyline');
    expect(puntos?.getAttribute('points')).not.toContain('NaN');
  });

  test('la tarjeta KPI la dibuja solo cuando hay serie', () => {
    const { rerender } = render(<KpiCard label="Consumido hoy" value="7.45 kWh" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerender(<KpiCard label="Consumido hoy" value="7.45 kWh" sparkline={[1, 2, 3]} />);
    expect(screen.getByLabelText('Consumido hoy: últimos 3 días')).toBeInTheDocument();
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

function servir(duracion: LoadDurationResult): void {
  apiClient.defaults.adapter = (config) => {
    const data: unknown = config.url === '/analytics/load-duration' ? duracion : null;
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
