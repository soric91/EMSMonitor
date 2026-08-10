/**
 * Los recuadros de costo del tablero.
 *
 * Antes era uno por período con el neto grande y el desglose en letra chica.
 * El neto responde "cuánto pago" pero esconde lo que se pregunta quien tiene
 * paneles: cuánto entregué. Ahora son dos por período, al mismo tamaño.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { CostoDelPeriodo } from '../src/components/dashboard/CostoDelPeriodo';
import type { CostBreakdown } from '../src/api/types';

const COSTO: CostBreakdown = {
  period: 'day',
  device_id: null,
  period_start: '2026-08-09T00:00:00Z',
  period_end: '2026-08-09T23:59:59Z',
  consumption_kwh: 12.4,
  export_kwh: 1.8,
  consumption_cost_cop: 7751,
  export_credit_cop: 1142,
  net_cost_cop: 6608,
  months_used: ['2026-08'],
  stale_months: [],
  series: [],
};

describe('qué se muestra', () => {
  test('un período pinta dos recuadros: importado y exportado', async () => {
    servir(COSTO);

    render(<CostoDelPeriodo periodo="hoy" period="day" />);

    await waitFor(() => expect(screen.getByText('Importado hoy')).toBeInTheDocument());
    expect(screen.getByText('Exportado hoy')).toBeInTheDocument();
  });

  test('los dos importes salen al mismo nivel, no uno escondido', async () => {
    servir(COSTO);

    render(<CostoDelPeriodo periodo="hoy" period="day" />);

    await waitFor(() => expect(screen.getByText(/7\.751/)).toBeInTheDocument());
    expect(screen.getByText(/1\.142/)).toBeInTheDocument();
  });

  test('cada uno dice cuánta energía hay detrás', async () => {
    // Sin la energía, un costo que sube no distingue entre haber consumido más
    // y que subiera la tarifa.
    servir(COSTO);

    render(<CostoDelPeriodo periodo="hoy" period="day" />);

    await waitFor(() => expect(screen.getByText(/12\.40 kWh/)).toBeInTheDocument());
    expect(screen.getByText(/1\.80 kWh/)).toBeInTheDocument();
  });

  test('el neto sigue estando, ahora al pie', async () => {
    servir(COSTO);

    render(<CostoDelPeriodo periodo="hoy" period="day" />);

    await waitFor(() => expect(screen.getByText(/Neto: .*6\.608/)).toBeInTheDocument());
  });
});

describe('una sola petición', () => {
  test('los dos recuadros salen de la misma llamada', async () => {
    // El backend ya devuelve importado, exportado y neto juntos. Pedir dos
    // veces traería el mismo cálculo por duplicado, y contra una base a ~190 ms
    // eso se nota.
    servir(COSTO);

    render(<CostoDelPeriodo periodo="hoy" period="day" />);

    await waitFor(() => expect(screen.getByText('Exportado hoy')).toBeInTheDocument());
    expect(pedidos).toHaveLength(1);
  });
});

describe('saldo a favor', () => {
  test('cuando el crédito supera al costo, el neto lo dice', async () => {
    servir({ ...COSTO, net_cost_cop: -1200 });

    render(<CostoDelPeriodo periodo="hoy" period="day" />);

    await waitFor(() => expect(screen.getByText(/a tu favor/)).toBeInTheDocument());
  });
});

describe('el aviso de tarifa vieja', () => {
  test('aparece cuando el backend estimó con un mes anterior', async () => {
    servir({ ...COSTO, stale_months: ['2026-08'], months_used: ['2026-06'] });

    render(<CostoDelPeriodo periodo="hoy" period="day" />);

    await waitFor(() =>
      expect(screen.getByText(/Tarifa estimada/)).toBeInTheDocument(),
    );
  });

  test('se muestra una sola vez y no en los dos recuadros', async () => {
    // Es la misma advertencia sobre el mismo período. Repetirla la convierte en
    // ruido que se deja de leer.
    servir({ ...COSTO, stale_months: ['2026-08'], months_used: ['2026-06'] });

    render(<CostoDelPeriodo periodo="hoy" period="day" />);

    await waitFor(() => expect(screen.getByText(/Tarifa estimada/)).toBeInTheDocument());
    expect(screen.getAllByText(/Tarifa estimada/)).toHaveLength(1);
  });
});

// --- andamiaje ---------------------------------------------------------

const adapterOriginal = apiClient.defaults.adapter;
let pedidos: string[] = [];

function servir(cost: CostBreakdown): void {
  apiClient.defaults.adapter = (config) => {
    pedidos.push(config.url ?? '');
    return Promise.resolve({
      data: { success: true, message: '', data: cost },
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
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});
