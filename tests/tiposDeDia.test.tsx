/**
 * F2.3 — los tipos de día.
 *
 * Lo que se protege: que la tarjeta no invente grupos cuando el backend dice
 * que no los hay, y que distinga "todavía no hay datos" de "tus días se
 * parecen entre sí" — son dos respuestas distintas y la segunda es un
 * hallazgo, no una carencia.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { clearSiteModeCache } from '../src/hooks/useSiteMode';
import { DayArchetypesCard } from '../src/components/dashboard/DayArchetypesCard';
import { DeviceContext } from '../src/context/DeviceContext';
import type { DayArchetypesResult } from '../src/api/types';

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

/** Curva de 24 horas que suma 1, con el peso donde se le indique. */
function curva(horasFuertes: number[]): number[] {
  const fuerte = 0.9 / horasFuertes.length;
  const flojo = 0.1 / (24 - horasFuertes.length);
  return Array.from({ length: 24 }, (_, h) => (horasFuertes.includes(h) ? fuerte : flojo));
}

const CON_GRUPOS: DayArchetypesResult = {
  device_id: 'eq-elegido',
  period_start: '2026-05-12T05:00:00Z',
  period_end: '2026-08-10T05:00:00Z',
  days_analyzed: 90,
  silhouette: 0.61,
  archetypes: [
    {
      label: 'Laboral',
      day_count: 64,
      avg_kwh: 18.2,
      hourly_share: curva([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]),
      weekdays: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'],
    },
    {
      label: 'Fin de semana',
      day_count: 26,
      avg_kwh: 11.4,
      hourly_share: curva([18, 19, 20, 21]),
      weekdays: ['sábado', 'domingo'],
    },
  ],
  assignments: Array.from({ length: 90 }, (_, i) => ({
    date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
    archetype: i % 7 < 5 ? 0 : 1,
    kwh: i % 7 < 5 ? 18 : 11,
  })),
};

describe('los tipos de día', () => {
  test('muestra cada grupo con su tamaño y su consumo típico', async () => {
    servir(CON_GRUPOS);

    render(<DayArchetypesCard />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('Laboral')).toBeInTheDocument());
    expect(screen.getByText('Fin de semana')).toBeInTheDocument();
    expect(screen.getByText(/64 días · 18\.20 kWh\/día/)).toBeInTheDocument();
    expect(screen.getByText(/90 días analizados/)).toBeInTheDocument();
  });

  test('cuando los días se parecen entre sí lo dice como hallazgo', async () => {
    servir({ ...CON_GRUPOS, archetypes: [], assignments: [], silhouette: 0.11 });

    render(<DayArchetypesCard />, { wrapper: ConDispositivo });

    await waitFor(() =>
      expect(
        screen.getByText('Tus 90 días se parecen entre sí: no hay tipos de día distinguibles.'),
      ).toBeInTheDocument(),
    );
  });

  test('sin días suficientes dice otra cosa', async () => {
    // "Tus días se parecen entre sí" con cero días sería una conclusión sobre
    // datos que no existen.
    servir({
      ...CON_GRUPOS,
      days_analyzed: 0,
      archetypes: [],
      assignments: [],
      silhouette: null,
    });

    render(<DayArchetypesCard />, { wrapper: ConDispositivo });

    await waitFor(() =>
      expect(
        screen.getByText('Todavía no hay días completos suficientes para agrupar.'),
      ).toBeInTheDocument(),
    );
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

function servir(resultado: DayArchetypesResult): void {
  apiClient.defaults.adapter = (config) => {
    const data: unknown = config.url === '/analytics/day-archetypes' ? resultado : null;
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
  clearSiteModeCache();
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});
