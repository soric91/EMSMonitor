/**
 * El histórico fino, en la página.
 *
 * Pedir un día segundo a segundo son 86 400 puntos contra un techo de 5 000:
 * sin trocear era un 400 en la cara del usuario. Y el "pico imposible" que
 * alguien encuentra en el CSV no es del medidor — es energía real apuntada a la
 * ventana equivocada, y hasta ahora nada en pantalla lo decía.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import History from '../src/pages/History';
import { DeviceContext } from '../src/context/DeviceContext';
import { useHistorialEnCascada } from '../src/hooks/useHistorialEnCascada';
import { VariablesProvider } from '../src/context/VariablesContext';
import type { HistoryResponse, VariableDisponible } from '../src/api/types';

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

const VARIABLE: VariableDisponible = {
  nombre: 'TotWh_import',
  etiqueta: 'Energía importada',
  unidad: 'kWh',
  magnitud: 'energia_activa_importada',
  fase: 'total',
  acumulativa: true,
  equipos: ['eq-1'],
  con_datos: true,
};

/** La serie del caso real: un salto de 7 h 30 y el pico que lo acumula todo. */
const CON_VACIO: HistoryResponse = {
  variable: 'TotWh_import',
  device_id: 'eq-1',
  aggregation: 'last',
  period_start: '2026-08-09T22:00:00Z',
  period_end: '2026-08-10T08:00:00Z',
  interval_seconds: 900,
  points: [
    { time: '2026-08-09T23:45:00Z', value: 0.13 },
    { time: '2026-08-10T00:00:00Z', value: 0.14 },
    { time: '2026-08-10T07:30:00Z', value: 5.14 },
    { time: '2026-08-10T07:45:00Z', value: 0.14 },
  ],
};

describe('el vacío de datos', () => {
  test('el CSV dice cuánto silencio hay detrás de cada punto', async () => {
    // En pantalla no se avisa: la gráfica ya muestra el salto. El detalle vive
    // en el CSV, que es donde alguien se encuentra un valor imposible y
    // necesita saber que acumula un tramo sin lecturas.
    servir();

    montar();
    await waitFor(() => expect(screen.getByText(/Exportar CSV/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Exportar CSV/));

    const csv = await bajados.at(-1)!.text();
    expect(csv.split('\n')[0]).toBe('hora_bogota,valor,segundos_sin_lecturas_antes');
    expect(csv).toContain(',5.14,27000');
  });

  test('un punto pegado al anterior no lleva marca', async () => {
    servir();

    montar();
    await waitFor(() => expect(screen.getByText(/Exportar CSV/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Exportar CSV/));

    const csv = await bajados.at(-1)!.text();
    expect(csv).toMatch(/,0\.14,\n/);
  });
});

describe('la cascada', () => {
  test('a 15 min el rango va en una sola consulta', async () => {
    servir();

    montar();

    await waitFor(() => expect(pedidos('/history').length).toBe(1));
    expect(pedidos('/history')[0]!.interval_seconds).toBe(900);
  });

  test('el intervalo elegido llega al backend', async () => {
    servir();

    montar();
    await waitFor(() => expect(pedidos('/history').length).toBe(1));
    parametros.length = 0;

    elegirIntervalo('1 min');

    // El pedido de 900 que quedó en vuelo puede aterrizar después del cambio;
    // lo que importa es que el intervalo nuevo salga.
    await waitFor(() =>
      expect(pedidos('/history').some((p) => p.interval_seconds === 60)).toBe(true),
    );
  });

  test('un rango que no cabe se pide por tramos, ninguno sobre el techo del backend', async () => {
    servir();

    // Dos horas a un segundo son 7 200 puntos contra un techo de 5 000: sin
    // trocear, esto era un 400.
    renderHook(() =>
      useHistorialEnCascada({
        variable: 'TotWh_import' as never,
        desde: '2026-08-10T00:00:00.000Z',
        hasta: '2026-08-10T02:00:00.000Z',
        intervaloSegundos: 1,
        activo: true,
      }),
    );

    // Se filtra por intervalo porque una consulta del test anterior puede
    // seguir en vuelo cuando este arranca.
    const finos = () => pedidos('/history').filter((p) => p.interval_seconds === 1);
    await waitFor(() => expect(finos().length).toBeGreaterThanOrEqual(2));
    for (const p of finos()) {
      const puntos = (Date.parse(String(p.to)) - Date.parse(String(p.from))) / 1000;
      expect(puntos).toBeLessThanOrEqual(4000);
    }
  });

  test('los tramos van de a uno: el backend no recibe veinte consultas a la vez', async () => {
    // Es lo que separa "tarda un poco" de "se cae el panel para todos": cada
    // tramo fino es una barrida grande sobre InfluxDB.
    let enVuelo = 0;
    let maximoSimultaneo = 0;
    servir(undefined, () => {
      enVuelo += 1;
      maximoSimultaneo = Math.max(maximoSimultaneo, enVuelo);
      return () => {
        enVuelo -= 1;
      };
    });

    renderHook(() =>
      useHistorialEnCascada({
        variable: 'TotWh_import' as never,
        desde: '2026-08-10T00:00:00.000Z',
        hasta: '2026-08-10T04:00:00.000Z',
        intervaloSegundos: 1,
        activo: true,
      }),
    );

    await waitFor(() => expect(pedidos('/history').length).toBeGreaterThan(2));
    expect(maximoSimultaneo).toBe(1);
  });

  test('lo que ya llegó se conserva si un tramo falla', async () => {
    let llamadas = 0;
    servir(undefined, () => {
      llamadas += 1;
      return () => {};
    });
    const original = apiClient.defaults.adapter;
    apiClient.defaults.adapter = (config) => {
      if ((config.url ?? '') === '/history' && llamadas >= 1 && parametros.length > 1) {
        parametros.push({ url: config.url ?? '' });
        return Promise.reject(new Error('sin respuesta'));
      }
      return original!(config);
    };

    const { result } = renderHook(() =>
      useHistorialEnCascada({
        variable: 'TotWh_import' as never,
        desde: '2026-08-10T00:00:00.000Z',
        hasta: '2026-08-10T04:00:00.000Z',
        intervaloSegundos: 1,
        activo: true,
      }),
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());
    // Un tramo caído no borra la gráfica: se muestra lo traído y se avisa.
    expect(result.current.puntos.length).toBeGreaterThan(0);
  });
});

describe('los techos de rango', () => {
  test('un segundo sobre 24 h se rechaza acá y se dice por qué', async () => {
    servir();

    montar();
    await waitFor(() => expect(pedidos('/history').length).toBe(1));
    parametros.length = 0;

    elegirIntervalo('1 segundo');

    // El rango por defecto del panel son 24 h y el techo a un segundo son 2 h.
    // Que no se pida NADA es justamente lo que protege al backend.
    await waitFor(() => expect(screen.getByText(/no puede pasar de/)).toBeInTheDocument());
  });
});

// --- andamiaje ---------------------------------------------------------

function montar(): void {
  render(
    <VariablesProvider>
      <DeviceContext.Provider value={deviceContext}>
        <History />
      </DeviceContext.Provider>
    </VariablesProvider>,
  );
}

function elegirIntervalo(etiqueta: string): void {
  const select = screen.getByTitle('Agrupar cada') as HTMLSelectElement;
  const opcion = Array.from(select.options).find((o) => o.text.includes(etiqueta))!;
  fireEvent.change(select, { target: { value: opcion.value } });
}

const deviceContext = {
  devices: [MEDIDOR],
  gateways: [{ id: 'g1', serie: 'GW-0001', sede: 'Planta', enLinea: true, medidores: [MEDIDOR] }],
  selectedGatewayId: 'g1',
  setSelectedGatewayId: () => {},
  setSelectedDeviceId: () => {},
  cargando: false,
  error: false,
  selectedDeviceId: 'eq-1',
};

let parametros: Record<string, unknown>[] = [];
/** Los CSV que la página mandó a descargar. */
let bajados: Blob[] = [];

Object.defineProperty(URL, 'createObjectURL', {
  value: (blob: Blob) => {
    bajados.push(blob);
    return 'blob:test';
  },
  configurable: true,
});
Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, configurable: true });

function pedidos(url: string): Record<string, unknown>[] {
  return parametros.filter((p) => String(p.url) === url);
}

const adapterOriginal = apiClient.defaults.adapter;

function servir(serie: HistoryResponse = CON_VACIO, alPedir?: () => () => void): void {
  apiClient.defaults.adapter = async (config) => {
    const url = config.url ?? '';
    parametros.push({ url, ...(config.params ?? {}) });
    const terminar = url === '/history' ? alPedir?.() : undefined;
    // Un tick de espera: sin él todas las respuestas se resuelven juntas y no
    // se podría distinguir secuencial de paralelo.
    await new Promise((r) => setTimeout(r, 0));
    terminar?.();

    const data: unknown =
      url === '/devices'
        ? [MEDIDOR]
        : url === '/variables'
          ? [VARIABLE]
          : url === '/history'
            ? serie
            : null;

    return {
      data: { success: true, message: '', data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
}

afterEach(() => {
  cleanup();
  parametros = [];
  bajados = [];
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});
