/**
 * El recuadro de la frontera, alimentado por su propia conexión WebSocket.
 *
 * Desde el fix del "valor congelado" el hero ya no compite por la conexión
 * compartida del dashboard: como el backend sostiene una sola variable por
 * conexión y la gráfica de abajo ocupa la compartida con lo que esté mirando,
 * este recuadro abre la suya para `TotW`. Así el flujo de la frontera llega
 * siempre en vivo, y `seedWatts` (la instantánea del `/dashboard/summary`)
 * solo cubre la transición mientras la conexión abre. Sin ninguna de las dos
 * fuentes no inventa un valor: un medidor recién instalado que nunca publicó
 * no está consumiendo ni dejó de consumir, no sabemos.
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

describe('con su propia conexión WebSocket', () => {
  test('abre una conexión dedicada suscrita a TotW', async () => {
    servir();

    montar({ seedWatts: null });

    await socketDelHero();
    // La compartida del dashboard también abre (RealtimeProvider) — que el
    // hero tenga además la suya, aparte, es justo el punto del fix.
    await waitFor(() => expect(instancias.length).toBeGreaterThanOrEqual(2));
  });

  test('muestra en vivo el valor que llega por su conexión', async () => {
    servir();

    montar({ seedWatts: 520.8 });

    const ws = await socketDelHero();
    leer(ws, {
      type: 'data',
      variable: 'TotW',
      value: 750,
      timestamp: new Date().toISOString(),
    });

    await waitFor(() => expect(screen.getByText('750 W')).toBeInTheDocument());
  });

  test('marca Online cuando su conexión está lista', async () => {
    servir();

    montar({ seedWatts: null });

    await socketDelHero();

    await waitFor(() => expect(screen.getByText('Online')).toBeInTheDocument());
  });

  test('cierra su conexión al desmontar', async () => {
    servir();

    const vista = montar({ seedWatts: null });

    const ws = await socketDelHero();
    vista.unmount();

    expect(ws.cerrado).toBe(true);
  });
});

// --- andamiaje ---------------------------------------------------------

function montar({ seedWatts }: { seedWatts?: number | null }) {
  return render(
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
let instancias: WebSocketEspia[] = [];

class WebSocketEspia {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  readyState = WebSocketEspia.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];
  cerrado = false;
  constructor() {
    instancias.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.cerrado = true;
  }
  addEventListener(): void {}
}

function delHero(ws: WebSocketEspia): boolean {
  // El medidor se elige apenas carga el inventario (null → 'eq-1'), y ese
  // cambio re-abre la conexión del hero. El socket activo es el que suscribe
  // con el equipo ya elegido; el que usó null en el arranque queda cerrado.
  return ws.sent.some((m) => m.includes('TotW') && m.includes('eq-1'));
}

function abrir(ws: WebSocketEspia): void {
  ws.readyState = WebSocketEspia.OPEN;
  ws.onopen?.();
}

function leer(ws: WebSocketEspia, payload: unknown): void {
  ws.onmessage?.({ data: JSON.stringify(payload) });
}

/** La conexión del hero: la que, al abrir, suscribe `TotW` del equipo elegido. */
async function socketDelHero(): Promise<WebSocketEspia> {
  await waitFor(
    () => {
      for (const ws of instancias) abrir(ws);
      expect(instancias.some(delHero)).toBe(true);
    },
    { timeout: 3000 },
  );
  return instancias.find(delHero)!;
}

function servir(): void {
  globalThis.WebSocket = WebSocketEspia as unknown as typeof WebSocket;
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
  instancias = [];
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
  globalThis.WebSocket = WebSocketOriginal;
});
