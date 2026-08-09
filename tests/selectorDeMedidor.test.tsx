/**
 * Los dos desplegables encadenados: primero el gateway, después su medidor.
 *
 * Con un gateway y un medidor cualquier cosa funciona. Lo que se prueba acá es
 * lo que se rompía a partir del segundo: una lista plana de nombres casi
 * idénticos, los medidores de un gateway caído desaparecidos, y una opción de
 * "todos" que mezclaba acometidas distintas en un solo número.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { DeviceProvider } from '../src/context/DeviceContext';
import { SelectorDeMedidor } from '../src/components/layout/SelectorDeMedidor';
import type { DeviceDisponible } from '../src/api/types';

function medidor(over: Partial<DeviceDisponible> & { device_id: string }): DeviceDisponible {
  return {
    nombre: over.device_id,
    modbus_id: 10,
    sede_id: 's1',
    sede: 'Planta Norte',
    gateway_id: 'g1',
    gateway: 'GW-0001',
    gateway_en_linea: true,
    ...over,
  };
}

/** Dos gateways, dos medidores cada uno. El segundo gateway está caído. */
const DOS_GATEWAYS = [
  medidor({ device_id: 'a1', nombre: 'Tablero general' }),
  medidor({ device_id: 'a2', nombre: 'Bombas', modbus_id: 11 }),
  medidor({
    device_id: 'b1',
    nombre: 'Compresor',
    gateway_id: 'g2',
    gateway: 'GW-0002',
    sede: 'Planta Sur',
    gateway_en_linea: false,
  }),
];

describe('qué se muestra al entrar', () => {
  test('cae en el primer gateway y su primer medidor', async () => {
    // Sin elección previa el panel tiene que mostrar algo concreto: dejarlo
    // sin elegir mostraría la mezcla de todos los medidores.
    servir(DOS_GATEWAYS);

    await montar();

    expect(screen.getByRole('button', { name: 'Gateway' })).toHaveTextContent('GW-0001');
    expect(screen.getByRole('button', { name: 'Medidor' })).toHaveTextContent(
      'Tablero general',
    );
  });

  test('con un solo gateway se muestra su serial, sin desplegable', async () => {
    // No hay nada que elegir, y una lista de un elemento sugiere que sí.
    servir([medidor({ device_id: 'unico', nombre: 'Medidor único' })]);

    await montar();

    expect(screen.getByText('GW-0001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gateway' })).toBeNull();
  });

  test('con un solo medidor tampoco hay desplegable de medidor', async () => {
    servir([medidor({ device_id: 'unico', nombre: 'Medidor único' })]);

    await montar();

    expect(screen.getByText('Medidor único')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Medidor' })).toBeNull();
  });
});

describe('elegir gateway', () => {
  test('muestra los gateways con su sede', async () => {
    servir(DOS_GATEWAYS);

    const lista = await abrir('Gateway');

    expect(within(lista).getByText('Planta Norte')).toBeInTheDocument();
    expect(within(lista).getByText('Planta Sur')).toBeInTheDocument();
  });

  test('uno caído se ofrece igual, marcado', async () => {
    // Sus medidores tienen histórico guardado y se pueden consultar. Lo que no
    // van a tener es dato en vivo, y decirlo evita leerlo como medidor roto.
    servir(DOS_GATEWAYS);

    const lista = await abrir('Gateway');

    expect(within(lista).getByText('sin conexión')).toBeInTheDocument();
    expect(within(lista).getByRole('option', { name: /GW-0002/ })).toBeInTheDocument();
  });

  test('cambiar de gateway mueve el medidor al primero del nuevo', async () => {
    // Dejar el anterior elegido mostraría datos de un gateway distinto del que
    // dice el selector de arriba: dos indicadores contradiciéndose.
    servir(DOS_GATEWAYS);

    const lista = await abrir('Gateway');
    fireEvent.click(within(lista).getByRole('option', { name: /GW-0002/ }));

    await waitFor(() =>
      expect(screen.getByText('GW-0002')).toBeInTheDocument(),
    );
    expect(screen.getByText('Compresor')).toBeInTheDocument();
  });
});

describe('elegir medidor', () => {
  test('solo ofrece los del gateway elegido', async () => {
    servir(DOS_GATEWAYS);

    const lista = await abrir('Medidor');

    const nombres = within(lista)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(nombres.some((n) => n?.includes('Tablero general'))).toBe(true);
    expect(nombres.some((n) => n?.includes('Compresor'))).toBe(false);
  });

  test('no existe la opción de verlos todos juntos', async () => {
    // Cada medidor mide su propia acometida: sumarlos da un número que no
    // corresponde a ninguna, y promediar tensiones de dos no significa nada.
    servir(DOS_GATEWAYS);

    const lista = await abrir('Medidor');

    expect(within(lista).queryByText(/todos/i)).toBeNull();
  });

  test('elegir uno lo deja elegido', async () => {
    servir(DOS_GATEWAYS);

    const lista = await abrir('Medidor');
    fireEvent.click(within(lista).getByRole('option', { name: /Bombas/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Medidor' })).toHaveTextContent('Bombas'),
    );
  });
});

describe('el buscador', () => {
  test('no aparece con pocos', async () => {
    servir(DOS_GATEWAYS);

    await abrir('Medidor');

    expect(screen.queryByLabelText('Buscar medidor')).toBeNull();
  });

  test('aparece cuando la lista se vuelve larga', async () => {
    servir(muchos(10));

    await abrir('Medidor');

    expect(screen.getByLabelText('Buscar medidor')).toBeInTheDocument();
  });

  test('filtra por lo que se ve', async () => {
    servir(muchos(10));

    const lista = await abrir('Medidor');
    fireEvent.change(screen.getByLabelText('Buscar medidor'), {
      target: { value: '_7' },
    });

    await waitFor(() => expect(within(lista).getAllByRole('option')).toHaveLength(1));
  });

  test('sin coincidencias lo dice en vez de mostrar una lista vacía', async () => {
    servir(muchos(10));

    const lista = await abrir('Medidor');
    fireEvent.change(screen.getByLabelText('Buscar medidor'), {
      target: { value: 'zzzz' },
    });

    await waitFor(() =>
      expect(within(lista).getByText('Ninguno coincide.')).toBeInTheDocument(),
    );
  });
});

// --- andamiaje ---------------------------------------------------------

function muchos(cuantos: number): DeviceDisponible[] {
  return Array.from({ length: cuantos }, (_, i) =>
    medidor({ device_id: `eq-${i}`, nombre: `Modbus_SDM630_${i}`, modbus_id: 10 + i }),
  );
}

async function montar(): Promise<void> {
  render(
    <DeviceProvider>
      <SelectorDeMedidor />
    </DeviceProvider>,
  );
  await waitFor(() => expect(pedidos).toContain('/devices'));
  // El serial siempre está, sea chip fijo o desplegable: es la señal de que el
  // inventario ya llegó y el componente se dibujó.
  await waitFor(() => expect(screen.getByText(/GW-/)).toBeInTheDocument());
}

async function abrir(cual: 'Gateway' | 'Medidor'): Promise<HTMLElement> {
  await montar();
  fireEvent.click(screen.getByRole('button', { name: cual }));
  return await waitFor(() => screen.getByRole('listbox', { name: cual }));
}

const adapterOriginal = apiClient.defaults.adapter;
let pedidos: string[] = [];

function servir(devices: DeviceDisponible[]): void {
  apiClient.defaults.adapter = (config) => {
    pedidos.push(config.url ?? '');
    return Promise.resolve({
      data: { success: true, message: '', data: devices },
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
