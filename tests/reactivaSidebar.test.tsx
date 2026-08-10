/**
 * La entrada "Reactiva" del menú lateral es condicional: aparece solo cuando
 * este medidor reporta cuadrantes de energía reactiva (magnitud reactiva con
 * lecturas). Sin las variables Q1..Q4 declaradas y con datos, no hay página
 * que visitar.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { apiClient } from '../src/api/client';
import { Sidebar } from '../src/components/layout/Sidebar';
import { ThemeProvider } from '../src/context/ThemeContext';
import { VariablesProvider } from '../src/context/VariablesContext';
import { DeviceContext } from '../src/context/DeviceContext';
import type { VariableDisponible } from '../src/api/types';

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

const REACTIVA: VariableDisponible = {
  nombre: 'Q1Eq',
  etiqueta: 'Energía reactiva cuadrante 1',
  unidad: 'kvarh',
  magnitud: 'energia_reactiva_importada',
  fase: 'total',
  acumulativa: true,
  equipos: ['eq-elegido'],
  con_datos: true,
};

const POTENCIA: VariableDisponible = {
  nombre: 'TotW',
  etiqueta: 'Potencia activa total',
  unidad: 'W',
  magnitud: 'potencia_activa',
  fase: 'total',
  acumulativa: false,
  equipos: ['eq-elegido'],
  con_datos: true,
};

describe('la entrada de reactiva en el menú', () => {
  test('aparece cuando el medidor reporta cuadrantes con datos', async () => {
    const lista = servir([REACTIVA]);

    montar();

    await lista;
    await waitFor(() => expect(screen.getByText('Reactiva')).toBeInTheDocument());
  });

  test('no aparece si el medidor no tiene energía reactiva', async () => {
    const lista = servir([POTENCIA]);

    montar();

    await lista;
    await waitFor(() => expect(screen.getByText('Dashboard')).toBeInTheDocument());
    expect(screen.queryByText('Reactiva')).not.toBeInTheDocument();
  });
});

// --- andamiaje ---------------------------------------------------------

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

function montar(): void {
  render(
    <MemoryRouter>
      <ThemeProvider>
        <VariablesProvider>
          <DeviceContext.Provider value={deviceContext}>
            <Sidebar
              collapsed={false}
              onToggleCollapse={() => {}}
              mobileOpen={false}
              onCloseMobile={() => {}}
            />
          </DeviceContext.Provider>
        </VariablesProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const adapterOriginal = apiClient.defaults.adapter;

function servir(variables: VariableDisponible[]): Promise<void> {
  // El provider de variables recién pide al montar, así que la promesa NO se
  // puede esperar antes de `montar()`. Se resuelve en un macrotask posterior a
  // la respuesta para que el estado de VariablesProvider ya esté aplicado
  // cuando el test la consuma.
  return new Promise<void>((resolve) => {
    apiClient.defaults.adapter = (config) => {
      const url = config.url ?? '';
      const data: unknown = url === '/variables' ? variables : null;
      if (url === '/variables') setTimeout(resolve, 0);
      return Promise.resolve({
        data: { success: true, message: '', data },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };
  });
}

afterEach(() => {
  cleanup();
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});
