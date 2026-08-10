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
import { VariablesProvider } from '../src/context/VariablesContext';
import { DeviceProvider } from '../src/context/DeviceContext';
import type { CostBreakdown, VariableDisponible } from '../src/api/types';

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

    montar();

    await waitFor(() => expect(screen.getByText('Importado hoy')).toBeInTheDocument());
    expect(screen.getByText('Exportado hoy')).toBeInTheDocument();
  });

  test('los dos importes salen al mismo nivel, no uno escondido', async () => {
    servir(COSTO);

    montar();

    await waitFor(() => expect(screen.getByText(/7\.751/)).toBeInTheDocument());
    expect(screen.getByText(/1\.142/)).toBeInTheDocument();
  });

  test('cada uno dice cuánta energía hay detrás', async () => {
    // Sin la energía, un costo que sube no distingue entre haber consumido más
    // y que subiera la tarifa.
    servir(COSTO);

    montar();

    await waitFor(() => expect(screen.getByText(/12\.40 kWh/)).toBeInTheDocument());
    expect(screen.getByText(/1\.80 kWh/)).toBeInTheDocument();
  });

  test('el neto sigue estando, ahora al pie', async () => {
    servir(COSTO);

    montar();

    await waitFor(() => expect(screen.getByText(/Neto: .*6\.608/)).toBeInTheDocument());
  });
});

describe('una sola petición', () => {
  test('los dos recuadros salen de la misma llamada', async () => {
    // El backend ya devuelve importado, exportado y neto juntos. Pedir dos
    // veces traería el mismo cálculo por duplicado, y contra una base a ~190 ms
    // eso se nota.
    servir(COSTO);

    montar();

    await waitFor(() => expect(screen.getByText('Exportado hoy')).toBeInTheDocument());
    expect(pedidos.filter((url) => url.startsWith('/costs'))).toHaveLength(1);
  });
});

describe('saldo a favor', () => {
  test('cuando el crédito supera al costo, el neto lo dice', async () => {
    servir({ ...COSTO, net_cost_cop: -1200 });

    montar();

    await waitFor(() => expect(screen.getByText(/a tu favor/)).toBeInTheDocument());
  });
});

describe('el aviso de tarifa vieja', () => {
  test('aparece cuando el backend estimó con un mes anterior', async () => {
    servir({ ...COSTO, stale_months: ['2026-08'], months_used: ['2026-06'] });

    montar();

    await waitFor(() =>
      expect(screen.getByText(/Tarifa estimada/)).toBeInTheDocument(),
    );
  });

  test('se muestra una sola vez y no en los dos recuadros', async () => {
    // Es la misma advertencia sobre el mismo período. Repetirla la convierte en
    // ruido que se deja de leer.
    servir({ ...COSTO, stale_months: ['2026-08'], months_used: ['2026-06'] });

    montar();

    await waitFor(() => expect(screen.getByText(/Tarifa estimada/)).toBeInTheDocument());
    expect(screen.getAllByText(/Tarifa estimada/)).toHaveLength(1);
  });
});

// --- andamiaje ---------------------------------------------------------

function montar(): void {
  render(
    <VariablesProvider>
      <DeviceProvider>
        <CostoDelPeriodo periodo="hoy" period="day" />
      </DeviceProvider>
    </VariablesProvider>,
  );
}

/** Una variable de exportación: es lo que decide si la tarjeta verde existe. */
const EXPORTA: VariableDisponible = {
  nombre: 'TotWh_export',
  etiqueta: 'Energía exportada',
  unidad: 'kWh',
  magnitud: 'energia_exportada',
  fase: 'total',
  acumulativa: true,
  equipos: ['eq-elegido'],
  con_datos: true,
};

/** El medidor que el selector va a elegir solo al cargar el inventario. */
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

const adapterOriginal = apiClient.defaults.adapter;
let pedidos: string[] = [];
/** Los parámetros de cada petición, para comprobar qué se pidió y de quién. */
let parametros: Record<string, unknown>[] = [];
let variables: VariableDisponible[] = [EXPORTA];

function servir(cost: CostBreakdown): void {
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    pedidos.push(url);
    parametros.push({ url, ...(config.params ?? {}) });
    const data =
      url === '/variables' ? variables : url === '/devices' ? [MEDIDOR] : cost;
    return Promise.resolve({
      data: { success: true, message: '', data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
}

/** Un medidor sin paneles: no declara ninguna variable de exportación. */
function sinPaneles(): void {
  variables = [];
}

afterEach(() => {
  cleanup();
  pedidos = [];
  parametros = [];
  variables = [EXPORTA];
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});

describe('los datos son del medidor elegido', () => {
  test('la consulta lleva el equipo, no la empresa entera', async () => {
    // Sin `device_id` el backend agrega TODOS los medidores del cliente: el
    // importe mostrado no corresponde al medidor que dice el selector, y
    // además obliga a InfluxDB a recorrer las series de todos en vez de una.
    servir(COSTO);

    montar();

    await waitFor(() =>
      expect(
        parametros.some(
          (p) => String(p.url).startsWith('/costs') && p.device_id === 'eq-elegido',
        ),
      ).toBe(true),
    );
  });
});

describe('un cliente sin paneles', () => {
  test('no ve una tarjeta de exportado en cero permanente', async () => {
    // Nunca entrega nada. Media pantalla ocupada para decir que no pasa nada
    // es peor que no mostrarlo.
    sinPaneles();
    servir(COSTO);

    montar();

    await waitFor(() => expect(screen.getByText('Importado hoy')).toBeInTheDocument());
    expect(screen.queryByText('Exportado hoy')).toBeNull();
  });

  test('tampoco ve el neto, que sería el mismo importe repetido', async () => {
    sinPaneles();
    servir(COSTO);

    montar();

    await waitFor(() => expect(screen.getByText('Importado hoy')).toBeInTheDocument());
    expect(screen.queryByText(/Neto:/)).toBeNull();
  });
});
