/**
 * El recuadro de la frontera cuando no tiene la suscripción.
 *
 * El WebSocket sostiene **una sola variable a la vez**. Si la gráfica de abajo
 * se quedó con otra, este componente no recibe datos; y al volver de otra
 * página perdió también lo que tenía en memoria, así que quedaba en «—» para
 * siempre aunque el medidor estuviera publicando.
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
  unidad: 'kW',
  magnitud: 'potencia_activa',
  fase: 'total',
  acumulativa: false,
  equipos: ['eq-1'],
  con_datos: true,
};

/** Lo que ApiEMS guarda en memoria de la última lectura del equipo. */
const ULTIMA_LECTURA = {
  device_id: 'eq-1',
  device_name: 'Tablero',
  device_type: 'CT_Meter',
  identify_device: 'eq-1',
  timestamp: '2026-08-10T12:00:00Z',
  received_at: '2026-08-10T12:00:01Z',
  data: { TotW: 1.474 },
  equipment_uuid: 'eq-1',
  modbus_id: 10,
};

describe('sin la suscripción del socket', () => {
  test('muestra el último valor que ApiEMS tiene guardado', async () => {
    // El caso reportado: se entra al tablero, se cambia de página y se vuelve.
    // El componente se remonta sin nada en memoria y la gráfica de abajo ya
    // tiene la suscripción, así que por el socket no va a llegar nada.
    servir();

    montar();

    // 1.474 kW → 1474 W, con la conversión por unidad del catálogo.
    await waitFor(() => expect(screen.getByText(/1\.47 kW/)).toBeInTheDocument());
  });

  test('lo pide del medidor elegido', async () => {
    servir();

    montar();

    await waitFor(() =>
      expect(
        parametros.some(
          (p) => String(p.url).includes('/realtime/device') && p.device_id === 'eq-1',
        ),
      ).toBe(true),
    );
  });

  test('si no hay último valor, no inventa uno', async () => {
    // Un medidor recién instalado que nunca publicó. Mostrar un cero sería
    // afirmar que no está consumiendo, que es distinto de no saber.
    servir({ sinLectura: true });

    montar();

    await waitFor(() => expect(screen.getByText('—')).toBeInTheDocument());
  });
});

// --- andamiaje ---------------------------------------------------------

function montar(): void {
  render(
    <VariablesProvider>
      <DeviceProvider>
        <RealtimeProvider>
          <EnergyFlowHero />
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

function servir(options: { sinLectura?: boolean } = {}): void {
  globalThis.WebSocket = WebSocketMudo as unknown as typeof WebSocket;
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    parametros.push({ url, ...(config.params ?? {}) });

    const data =
      url === '/devices'
        ? [MEDIDOR]
        : url === '/variables'
          ? [TOT_W]
          : options.sinLectura
            ? { ...ULTIMA_LECTURA, data: {} }
            : ULTIMA_LECTURA;

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

describe('mientras la gráfica tiene la suscripción', () => {
  test('sigue actualizando en vez de quedarse congelado', async () => {
    // El recuadro existe para mostrar la potencia en la frontera. Que alguien
    // elija ver la tensión abajo no puede dejarlo mostrando un número viejo.
    servir();

    montar();

    await waitFor(() => expect(screen.getByText(/1\.47 kW/)).toBeInTheDocument());

    const consultas = () =>
      parametros.filter((p) => String(p.url).includes('/realtime/device')).length;
    const antes = consultas();

    await new Promise((listo) => setTimeout(listo, 5200));

    expect(consultas()).toBeGreaterThan(antes);
    // El límite por defecto son 5 s y este test espera a que pase un ciclo
    // completo de refresco, así que necesita más margen.
  }, 15000);

  test('lo dice, en vez de aparentar tiempo real', async () => {
    servir();

    montar();

    await waitFor(() => expect(screen.getByText(/cada 5 s/)).toBeInTheDocument());
  });
});
