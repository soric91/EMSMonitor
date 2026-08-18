/**
 * Cambiar de gateway tiene que cambiar TODO lo que se ve, no solo el rótulo.
 *
 * El bug que motiva este banco: se dio de alta una segunda sede con su gateway
 * y su medidor, se eligió en el selector, y el panel siguió mostrando lo del
 * primero — la gráfica en vivo dibujaba el historial del medidor viejo (un
 * equipo recién instalado no tiene doce horas de nada) y las comparaciones de
 * 7 y 30 días seguían clavadas en las cifras de la otra acometida.
 *
 * Eran dos fallas distintas con la misma forma:
 *
 *   * peticiones que salían SIN `device_id` — el backend, sin equipo, agrega
 *     todos los del cliente y devuelve la suma de la flota;
 *   * peticiones que sí lo llevaban pero no se repetían al cambiar de medidor,
 *     dejando en pantalla lo que ya había.
 *
 * Por eso las pruebas miran los parámetros reales de cada request, y no el
 * texto: un número correcto por casualidad no dice nada de la consulta que lo
 * trajo.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { DeviceProvider } from '../src/context/DeviceContext';
import { RealtimeProvider } from '../src/context/RealtimeContext';
import { VariablesProvider } from '../src/context/VariablesContext';
import { AlertsProvider } from '../src/context/AlertsContext';
import { LiveVariableChart } from '../src/components/dashboard/LiveVariableChart';
import { PeriodComparisonCard } from '../src/components/dashboard/PeriodComparisonCard';
import { SelectorDeMedidor } from '../src/components/layout/SelectorDeMedidor';
import type { CompareResult, DeviceDisponible, VariableDisponible } from '../src/api/types';

const VIEJO = 'eq-viejo';
const NUEVO = 'eq-nuevo';

const DOS_GATEWAYS: DeviceDisponible[] = [
  {
    device_id: VIEJO,
    nombre: 'Tablero general',
    modbus_id: 10,
    sede_id: 's1',
    sede: 'Sede uno',
    gateway_id: 'g1',
    gateway: 'GW-0001',
    gateway_en_linea: true,
  },
  {
    device_id: NUEVO,
    nombre: 'Medidor nuevo',
    modbus_id: 11,
    sede_id: 's2',
    sede: 'Sede dos',
    gateway_id: 'g2',
    gateway: 'GW-0002',
    gateway_en_linea: true,
  },
];

/**
 * La misma variable en los dos medidores. Es el caso que escondía el bug: si
 * cada equipo reportara variables distintas, cambiar de medidor cambiaba la
 * variable activa y el backfill volvía a pedir por ese camino. Con la misma
 * variable en ambos, nada cambiaba y la curva del anterior se quedaba.
 */
const POTENCIA: VariableDisponible = {
  nombre: 'TotW',
  etiqueta: 'Potencia activa total',
  unidad: 'kW',
  magnitud: 'potencia_activa',
  fase: 'total',
  acumulativa: false,
  equipos: [VIEJO, NUEVO],
  con_datos: true,
};

const COMPARADO: CompareResult = {
  device_id: VIEJO,
  period_a: {
    period_start: '2026-08-03T00:00:00Z',
    period_end: '2026-08-09T23:59:59Z',
    consumption_kwh: 58.52,
    export_kwh: 0,
    peak_import_w: null,
  },
  period_b: {
    period_start: '2026-08-10T00:00:00Z',
    period_end: '2026-08-16T23:59:59Z',
    consumption_kwh: 60.77,
    export_kwh: 0,
    peak_import_w: null,
  },
  consumption_delta_pct: 3.8,
  export_delta_pct: null,
};

/** Los endpoints que devuelven MEDICIONES: todos tienen que ir acotados. */
const CON_DATOS_DE_UN_MEDIDOR = ['/history/downsample', '/analytics/compare', '/alerts'];

describe('las peticiones van acotadas al medidor', () => {
  test('ninguna consulta de mediciones sale sin device_id', async () => {
    // Sin `device_id` el backend agrega todos los medidores del cliente: la
    // gráfica dibujaba la suma de dos acometidas distintas como si fuera una.
    servir();

    await montar();
    await waitFor(() => expect(deEndpoint('/history/downsample').length).toBeGreaterThan(0));

    const sinEquipo = parametros.filter(
      (p) =>
        CON_DATOS_DE_UN_MEDIDOR.some((url) => String(p.url).startsWith(url)) &&
        p.device_id === undefined,
    );
    expect(sinEquipo).toEqual([]);
  });

  test('al arrancar consulta el primer medidor', async () => {
    servir();

    await montar();
    await waitFor(() => expect(deEndpoint('/history/downsample').length).toBeGreaterThan(0));

    expect(equiposDe('/history/downsample')).toEqual([VIEJO]);
    expect(equiposDe('/analytics/compare')).toEqual([VIEJO]);
  });
});

describe('al cambiar de gateway', () => {
  test('el historial de la gráfica se vuelve a pedir para el medidor nuevo', async () => {
    // El corazón del bug: un medidor recién instalado mostraba doce horas de
    // curva que no eran suyas, porque el backfill ya se daba por hecho.
    servir();

    await montar();
    await waitFor(() => expect(deEndpoint('/history/downsample').length).toBeGreaterThan(0));
    await cambiarAlSegundoGateway();

    await waitFor(() => expect(equiposDe('/history/downsample')).toContain(NUEVO));
  });

  test('las comparaciones de 7 días se vuelven a pedir para el medidor nuevo', async () => {
    servir();

    await montar();
    await waitFor(() => expect(deEndpoint('/analytics/compare').length).toBe(1));
    await cambiarAlSegundoGateway();

    await waitFor(() => expect(equiposDe('/analytics/compare')).toEqual([VIEJO, NUEVO]));
  });

  test('las alertas se vuelven a pedir para el medidor nuevo', async () => {
    servir();

    await montar();
    await waitFor(() => expect(deEndpoint('/alerts').length).toBe(1));
    await cambiarAlSegundoGateway();

    await waitFor(() => expect(equiposDe('/alerts')).toEqual([VIEJO, NUEVO]));
  });

  test('mientras llega lo nuevo no se muestra la cifra del anterior', async () => {
    // Un número viejo con el selector diciendo otra cosa es peor que un
    // esqueleto: se lee como el consumo del medidor que se acaba de elegir.
    servir({ demorarCompare: true });

    await montar();
    await waitFor(() => expect(screen.getByText('60.77 kWh')).toBeInTheDocument());
    await cambiarAlSegundoGateway();

    await waitFor(() => expect(screen.queryByText('60.77 kWh')).toBeNull());
  });
});

// --- andamiaje ---------------------------------------------------------

const adapterOriginal = apiClient.defaults.adapter;
const WebSocketOriginal = globalThis.WebSocket;
let parametros: Record<string, unknown>[] = [];

function deEndpoint(url: string): Record<string, unknown>[] {
  return parametros.filter((p) => String(p.url).startsWith(url));
}

/** Los medidores consultados en ese endpoint, en orden y sin repetir. */
function equiposDe(url: string): string[] {
  return [...new Set(deEndpoint(url).map((p) => String(p.device_id)))];
}

class WebSocketMudo {
  static readonly CONNECTING = 0;
  readyState = WebSocketMudo.CONNECTING;
  close(): void {}
  addEventListener(): void {}
  send(): void {}
}

function servir(options: { demorarCompare?: boolean } = {}): void {
  globalThis.WebSocket = WebSocketMudo as unknown as typeof WebSocket;
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    parametros.push({ url, ...(config.params ?? {}) });

    const data: unknown =
      url === '/devices'
        ? DOS_GATEWAYS
        : url === '/variables'
          ? [POTENCIA]
          : url === '/alerts'
            ? { recent: [], daily_total: null }
            : url === '/history/downsample'
              ? { variable: 'TotW', device_id: config.params?.device_id ?? null, points: [] }
              : url === '/analytics/compare'
                ? COMPARADO
                : null;

    const respuesta = {
      data: { success: true, message: '', data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
    // La demora del segundo `compare` deja ver qué hay en pantalla mientras la
    // petición del medidor nuevo está en vuelo.
    if (options.demorarCompare && url === '/analytics/compare' && deEndpoint(url).length > 1) {
      return new Promise((resolve) => setTimeout(() => resolve(respuesta), 200));
    }
    return Promise.resolve(respuesta);
  };
}

async function montar(): Promise<void> {
  render(
    <VariablesProvider>
      <DeviceProvider>
        <RealtimeProvider>
          <AlertsProvider>
            <SelectorDeMedidor />
            <LiveVariableChart />
            <PeriodComparisonCard label="Últimos 7 días" days={7} />
          </AlertsProvider>
        </RealtimeProvider>
      </DeviceProvider>
    </VariablesProvider>,
  );
  await waitFor(() => expect(screen.getByText('GW-0001')).toBeInTheDocument());
}

async function cambiarAlSegundoGateway(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Gateway' }));
  const lista = await waitFor(() => screen.getByRole('listbox', { name: 'Gateway' }));
  fireEvent.click(within(lista).getByRole('option', { name: /GW-0002/ }));
  await waitFor(() => expect(screen.getByText('GW-0002')).toBeInTheDocument());
}

afterEach(() => {
  cleanup();
  parametros = [];
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
  globalThis.WebSocket = WebSocketOriginal;
});
