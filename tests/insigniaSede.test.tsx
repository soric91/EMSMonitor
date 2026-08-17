/**
 * La insignia de tipo de sede: qué instalación se está mirando y con cuánta
 * capacidad, tal como se declaró en el CRM.
 *
 * Importa distinguir lo declarado de lo deducido: no es lo mismo "alguien
 * revisó esta instalación" que "acá se exportó energía, así que asumimos que
 * hay paneles".
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { SiteModeBadge } from '../src/components/dashboard/SiteModeBadge';
import { DeviceContext } from '../src/context/DeviceContext';
import { clearSiteModeCache } from '../src/hooks/useSiteMode';
import type { SiteModeResult } from '../src/api/types';

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

const DECLARADA: SiteModeResult = {
  device_id: 'eq-elegido',
  mode: 'generacion',
  source: 'crm',
  capacity_kwp: 5.5,
};

describe('la insignia de sede', () => {
  test('muestra la generación declarada con su capacidad', async () => {
    servir(DECLARADA);

    render(<SiteModeBadge />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('Generación propia')).toBeInTheDocument());
    expect(screen.getByText('· 5.5 kWp')).toBeInTheDocument();
    expect(screen.queryByText('(detectado)')).not.toBeInTheDocument();
  });

  test('sin capacidad declarada no inventa un número', async () => {
    servir({ ...DECLARADA, capacity_kwp: null });

    render(<SiteModeBadge />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('Generación propia')).toBeInTheDocument());
    expect(screen.queryByText(/kWp/)).not.toBeInTheDocument();
  });

  test('un modo deducido se marca como tal', async () => {
    // "Acá se exportó energía, así que asumimos paneles" no es lo mismo que
    // "alguien revisó esta instalación".
    servir({ ...DECLARADA, source: 'detected', capacity_kwp: null });

    render(<SiteModeBadge />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('(detectado)')).toBeInTheDocument());
  });

  test('una sede de consumo puro se nombra por lo que es', async () => {
    servir({ ...DECLARADA, mode: 'consumo', capacity_kwp: null });

    render(<SiteModeBadge />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('Solo consumo')).toBeInTheDocument());
  });
});

// --- andamiaje ---------------------------------------------------------

const deviceContext = {
  devices: [MEDIDOR],
  gateways: [{ id: 'g1', serie: 'GW-0001', sede: 'Planta', enLinea: true, medidores: [MEDIDOR] }],
  selectedGatewayId: 'g1',
  setSelectedGatewayId: () => {},
  setSelectedDeviceId: () => {},
  cargando: false,
  error: false,
  selectedDeviceId: 'eq-elegido',
};

function ConDispositivo({ children }: { children: React.ReactNode }) {
  return <DeviceContext.Provider value={deviceContext}>{children}</DeviceContext.Provider>;
}

const adapterOriginal = apiClient.defaults.adapter;

function servir(modo: SiteModeResult): void {
  apiClient.defaults.adapter = (config) => {
    const data: unknown = config.url === '/analytics/site-mode' ? modo : null;
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
  // El caché del modo vive a nivel de módulo: sin limpiarlo, un test le
  // serviría su respuesta al siguiente.
  clearSiteModeCache();
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});
