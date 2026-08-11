/**
 * La página de energía reactiva por cuadrante (GET /analytics/reactive-quadrants).
 *
 * El endpoint ya nace consolidado (cuadrantes + balance + tendencia en una sola
 * llamada); este test fija que la página no crezca más peticiones sin que alguien
 * lo decida y que la lectura de los cuadrantes Q1..Q4 se muestre.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from '@rstest/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import Reactiva from '../src/pages/Reactiva';
import { DeviceContext } from '../src/context/DeviceContext';
import type { ReactiveQuadrantsResult } from '../src/api/types';

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

const RESULT: ReactiveQuadrantsResult = {
  period_start: '2026-08-10T00:00:00Z',
  period_end: '2026-08-10T23:59:59Z',
  device_id: 'eq-elegido',
  q1_kvarh: 10,
  q2_kvarh: 20,
  q3_kvarh: 5,
  q4_kvarh: 3,
  total_import_kvarh: 30,
  total_export_kvarh: 8,
  balance_kvarh: 22,
  dominant: 'q2',
  dominant_kvarh: 20,
  trend: [
    { time: '2026-08-10T06:00:00Z', q1_kvarh: 2, q2_kvarh: 4, q3_kvarh: 1, q4_kvarh: 0 },
    { time: '2026-08-10T12:00:00Z', q1_kvarh: 1, q2_kvarh: 3, q3_kvarh: 0, q4_kvarh: 1 },
  ],
};

const SIN_REACTIVA: ReactiveQuadrantsResult = {
  ...RESULT,
  q1_kvarh: 0,
  q2_kvarh: 0,
  q3_kvarh: 0,
  q4_kvarh: 0,
  total_import_kvarh: 0,
  total_export_kvarh: 0,
  balance_kvarh: 0,
  dominant: null,
  dominant_kvarh: 0,
  trend: [],
};

describe('al montar', () => {
  test('pide los cuadrantes una sola vez, con el medidor elegido', async () => {
    servir(RESULT);

    montar();

    await waitFor(() => expect(screen.getByText('Reactiva importada')).toBeInTheDocument());

    const pedidos = parametros.filter((p) => String(p.url) === '/analytics/reactive-quadrants');
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ device_id: 'eq-elegido' });
  });

  test('muestra importada, exportada, balance y el cuadrante dominante', async () => {
    servir(RESULT);

    montar();

    await waitFor(() => expect(screen.getByText('Reactiva importada')).toBeInTheDocument());
    expect(screen.getByText('30.00 kvarh')).toBeInTheDocument(); // importada (Q1+Q2)
    expect(screen.getByText('8.00 kvarh')).toBeInTheDocument(); // exportada (Q3+Q4)
    expect(screen.getByText('+22.00 kvarh')).toBeInTheDocument(); // balance
    expect(
      screen.getByText('Cuadrante dominante: Q2 · Importada capacitiva (20.00 kvarh)'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Q1 · Importada inductiva').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Q4 · Exportada inductiva').length).toBeGreaterThan(0);
  });

  test('sin reactiva muestra el estado vacío y nada de cuadrantes', async () => {
    servir(SIN_REACTIVA);

    montar();

    await waitFor(() => expect(screen.getByText('Sin energía reactiva')).toBeInTheDocument());
    expect(screen.queryByText(/Cuadrante dominante/)).not.toBeInTheDocument();
    expect(screen.queryByText('Q1 · Importada inductiva')).not.toBeInTheDocument();
  });
});

describe('exportar', () => {
  test('los botones de exportar solo aparecen con datos', async () => {
    servir(SIN_REACTIVA);

    montar();

    await waitFor(() => expect(screen.getByText('Sin energía reactiva')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Exportar CSV/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exportar PDF/ })).not.toBeInTheDocument();
  });

  test('el exportar CSV baja los puntos crudos de las últimas 24h del medidor', async () => {
    servir(RESULT);

    montar();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Exportar CSV/ })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));

    await waitFor(() => {
      expect(
        parametros.filter((p) => String(p.url) === '/analytics/reactive-quadrants/csv'),
      ).toHaveLength(1);
    });
    const pedido = parametros.find((p) => String(p.url) === '/analytics/reactive-quadrants/csv');
    expect(pedido?.device_id).toBe('eq-elegido');
    const from = new Date(String(pedido?.from)).getTime();
    const to = new Date(String(pedido?.to)).getTime();
    expect(Math.abs(to - from - 24 * 3600 * 1000)).toBeLessThan(1000);
    // Y el stream se descargó como Blob con el nombre del día.
    expect(savedBlobs).toHaveLength(1);
    expect(descargas).toEqual([expect.stringMatching(/^reactiva_24h_/)]);
  });

  test('al cambiar a 7 días el CSV baja una semana', async () => {
    servir(RESULT);

    montar();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Exportar CSV/ })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Últimos 7 días' }));
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));

    await waitFor(() => {
      expect(
        parametros.filter((p) => String(p.url) === '/analytics/reactive-quadrants/csv'),
      ).toHaveLength(1);
    });
    const pedido = parametros.find((p) => String(p.url) === '/analytics/reactive-quadrants/csv');
    const from = new Date(String(pedido?.from)).getTime();
    const to = new Date(String(pedido?.to)).getTime();
    expect(Math.abs(to - from - 7 * 24 * 3600 * 1000)).toBeLessThan(1000);
    expect(descargas).toEqual([expect.stringMatching(/^reactiva_7d_/)]);
  });

  test('el botón de PDF está presente con datos', async () => {
    servir(RESULT);

    montar();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Exportar PDF/ })).toBeInTheDocument(),
    );
  });
});

describe('tendencia por ventana', () => {
  test('muestra el total de cada ventana, la duración de la ventana y el desglose en el tooltip', async () => {
    servir(RESULT);

    montar();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Exportar CSV/ })).toBeInTheDocument(),
    );

    // El subtítulo anuncia la duración real de la ventana (06:00 → 12:00 = 6h).
    expect(screen.getByText(/Reactiva acumulada por ventana de 6 horas/)).toBeInTheDocument();

    // Suma de la primera ventana (2+4+1) y de la segunda (1+3+1) sobre las barras.
    expect(screen.getByText('7.00')).toBeInTheDocument();
    expect(screen.getByText('5.00')).toBeInTheDocument();

    // Las barras llevan el desglose por cuadrante en su tooltip (antes solo
    // colores sin lectura; ahora el dato viaja en el title de la barra).
    expect(screen.getAllByTitle(/Importada inductiva: 2\.00 kvarh/).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(/Exportada inductiva: 1\.00 kvarh/).length).toBeGreaterThan(0);
  });
});

// --- andamiaje ---------------------------------------------------------

function montar(): void {
  render(
    <DeviceContext.Provider value={deviceContext}>
      <Reactiva />
    </DeviceContext.Provider>,
  );
}

const deviceContext = {
  devices: [MEDIDOR],
  gateways: [
    {
      id: 'g1',
      serie: 'GW-0001',
      sede: 'Planta',
      enLinea: true,
      medidores: [MEDIDOR],
    },
  ],
  selectedGatewayId: 'g1',
  setSelectedGatewayId: () => {},
  setSelectedDeviceId: () => {},
  cargando: false,
  error: false,
  selectedDeviceId: 'eq-elegido',
};

const adapterOriginal = apiClient.defaults.adapter;
let parametros: Record<string, unknown>[] = [];
let savedBlobs: Blob[] = [];
let descargas: string[] = [];
const createObjectURLOriginal = URL.createObjectURL;
const revokeObjectURLOriginal = URL.revokeObjectURL;
const createElementOriginal = document.createElement;

function servir(resultado: ReactiveQuadrantsResult): void {
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    parametros.push({ url, ...(config.params ?? {}) });

    if (url === '/analytics/reactive-quadrants/csv') {
      // El endpoint responde un CSV crudo (Blob), no el envoltorio JSON.
      return Promise.resolve({
        data: new Blob(['fecha_hora_utc,campo,valor_kvarh\n...'], {
          type: 'text/csv;charset=utf-8',
        }),
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    }

    const data: unknown = url === '/analytics/reactive-quadrants' ? resultado : null;
    return Promise.resolve({
      data: { success: true, message: '', data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
}

/**
 * Captura la descarga del Blob (saveBlob) sustituyendo createObjectURL y el
 * click del link, como en downloadCsv.test — sin tocar el document real. El
 * `download` se anota en el click: es el único momento en que se sabe qué
 * archivo se bajó (framer-motion también crea anclas por render).
 */
function espiarDescargaBlob(): void {
  Object.defineProperty(URL, 'createObjectURL', {
    value: (blob: Blob) => {
      savedBlobs.push(blob);
      return 'blob:mock';
    },
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: () => undefined,
    configurable: true,
  });
  document.createElement = ((tag: string) => {
    const el = createElementOriginal.call(document, tag);
    el.click = () => {
      descargas.push((el as HTMLAnchorElement).download);
    };
    return el;
  }) as typeof document.createElement;
}

function restaurarDescargaBlob(): void {
  Object.defineProperty(URL, 'createObjectURL', {
    value: createObjectURLOriginal,
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: revokeObjectURLOriginal,
    configurable: true,
  });
  document.createElement = createElementOriginal;
}

beforeEach(() => {
  savedBlobs = [];
  descargas = [];
  espiarDescargaBlob();
});

afterEach(() => {
  cleanup();
  parametros = [];
  restaurarDescargaBlob();
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});
