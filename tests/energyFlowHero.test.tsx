/**
 * El recuadro de la frontera, ahora alimentado por el payload consolidado.
 *
 * Desde F5.3 el hero no pregunta por su cuenta: `/dashboard/summary` ya trae la
 * potencia activa total (`power_active_total_w`), y el WebSocket sostiene una
 * sola variable a la vez —si la gráfica de abajo se quedó con otra, el hero usa
 * la última instantánea que le llegó a él. Sin ninguna de las dos fuentes no
 * inventa un valor: un medidor recién instalado que nunca publicó no está
 * consumiendo ni dejó de consumir, no sabemos.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { DeviceProvider } from '../src/context/DeviceContext';
import { RealtimeProvider } from '../src/context/RealtimeContext';
import { VariablesProvider } from '../src/context/VariablesContext';
import { EnergyFlowHero } from '../src/components/dashboard/EnergyFlowHero';

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

const TOT_W = {
  nombre: 'TotW',
  etiqueta: 'Potencia activa total',
  unidad: 'W',
  magnitud: 'potencia_activa',
  fase: 'total',
  acumulativa: false,
  equipos: ['eq-1'],
  con_datos: true,
};

describe('con la potencia del resumen', () => {
  test('muestra lo que trajo /dashboard/summary', async () => {
    servir();

    montar({ seedWatts: 520.8 });

    await waitFor(() => expect(screen.getByText('521 W')).toBeInTheDocument());
  });

  test('escala solo al cruzar el kilovatio', async () => {
    servir();

    montar({ seedWatts: 1500 });

    await waitFor(() => expect(screen.getByText('1.50 kW')).toBeInTheDocument());
  });
});

describe('sin el resumen y sin el socket', () => {
  test('no inventa un valor', async () => {
    // Sin `seedWatts` (resumen todavía cargando o fallido) y sin una última
    // lectura por el socket, mostrar un cero afirmaría que no está consumiendo,
    // que es distinto de no saber.
    servir();

    montar({ seedWatts: null });

    await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument());
  });
});

describe('el resumen no vuelve a preguntar', () => {
  test('el hero no hace peticiones propias', async () => {
    servir();

    montar({ seedWatts: 520.8 });

    await waitFor(() => expect(screen.getByText('521 W')).toBeInTheDocument());

    // El payload consolidado reemplazó la consulta puntual a /realtime/device.
    // Pedirla de nuevo sería traer la misma potencia por duplicado.
    const pedidos = parametros.filter((p) => String(p.url).includes('/realtime/device'));
    expect(pedidos).toHaveLength(0);
  });
});

// --- andamiaje ---------------------------------------------------------

function montar({ seedWatts }: { seedWatts?: number | null }): void {
  render(
    <VariablesProvider>
      <DeviceProvider>
        <RealtimeProvider>
          <EnergyFlowHero seedWatts={seedWatts ?? null} />
        </RealtimeProvider>
      </DeviceProvider>
    </VariablesProvider>,
  );
}

const adapterOriginal = apiClient.defaults.adapter;
const WebSocketOriginal = globalThis.WebSocket;
let parametros: Record<string, unknown>[] = [];

class WebSocketMudo {
  static readonly CONNECTING = 0;
  readyState = WebSocketMudo.CONNECTING;
  close(): void {}
  addEventListener(): void {}
  send(): void {}
}

function servir(): void {
  globalThis.WebSocket = WebSocketMudo as unknown as typeof WebSocket;
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    parametros.push({ url, ...(config.params ?? {}) });

    const data = url === '/devices' ? [MEDIDOR] : url === '/variables' ? [TOT_W] : [];

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
  globalThis.WebSocket = WebSocketOriginal;
});
