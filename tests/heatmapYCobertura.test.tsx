/**
 * F1.1 y F1.5 — el mapa de calor por hora y el aviso de cobertura.
 *
 * Lo que se protege acá:
 *  - una hora SIN DATO se dibuja como hueco, no como consumo cero (es
 *    exactamente la confusión que el aviso de cobertura viene a romper);
 *  - exportación y balance neto solo se ofrecen donde hay generación propia;
 *  - un rango incompleto lo dice, en vez de dejar creer que el consumo bajó.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { clearSiteModeCache } from '../src/hooks/useSiteMode';
import { CalendarHeatmap } from '../src/components/charts/CalendarHeatmap';
import { DataCoverageBadge } from '../src/components/dashboard/DataCoverageBadge';
import { HeatmapCard } from '../src/components/dashboard/HeatmapCard';
import { DeviceContext } from '../src/context/DeviceContext';
import { formatKwh } from '../src/utils/format';
import type { CoverageResult, HeatmapResult, SiteMode, SiteModeResult } from '../src/api/types';

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

/** Un día con consumo a las 19:00 local y el resto de las horas sin dato. */
const HEATMAP: HeatmapResult = {
  device_id: 'eq-elegido',
  period_start: '2026-08-10T00:00:00Z',
  period_end: '2026-08-11T00:00:00Z',
  metric: 'import',
  unit: 'kWh',
  dates: ['2026-08-10'],
  values: [Array.from({ length: 24 }, (_, hora) => (hora === 19 ? 4.2 : null))],
};

const COBERTURA_COMPLETA: CoverageResult = {
  device_id: 'eq-elegido',
  period_start: '2026-08-10T00:00:00Z',
  period_end: '2026-08-11T00:00:00Z',
  bucket_seconds: 3600,
  expected_per_bucket: 60,
  expected_source: 'declarado',
  overall_ratio: 1,
  incomplete_buckets: 0,
  points: [],
};

const COBERTURA_CON_HUECOS: CoverageResult = {
  ...COBERTURA_COMPLETA,
  overall_ratio: 0.62,
  incomplete_buckets: 9,
};

describe('1.1 · el mapa de calor', () => {
  test('una hora sin dato no se pinta como consumo cero', () => {
    render(<CalendarHeatmap data={HEATMAP} valueFormatter={(v) => `${v} kWh`} />);

    // La casilla con dato lleva su valor; las demás dicen "sin datos", que no
    // es lo mismo que una casilla en el tono más bajo de la escala.
    expect(screen.getByLabelText('2026-08-10 19:00 — 4.2 kWh')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/sin datos$/)).toHaveLength(23);
  });

  test('sin ninguna casilla no inventa una escala', () => {
    render(
      <CalendarHeatmap
        data={{ ...HEATMAP, dates: [], values: [] }}
        valueFormatter={(v) => `${v} kWh`}
      />,
    );

    expect(screen.getByText('Sin datos suficientes.')).toBeInTheDocument();
  });

  test('en una sede de consumo puro no se ofrece exportación ni balance neto', async () => {
    servir({ mode: 'consumo' });

    render(<HeatmapCard fromIso={DESDE} toIso={HASTA} />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('Consumo')).toBeInTheDocument());
    expect(screen.getByText('Costo')).toBeInTheDocument();
    // Serían dos pestañas condenadas a estar siempre en cero.
    expect(screen.queryByText('Exportación')).not.toBeInTheDocument();
    expect(screen.queryByText('Neto')).not.toBeInTheDocument();
  });

  test('con generación propia sí se ofrecen', async () => {
    servir({ mode: 'generacion' });

    render(<HeatmapCard fromIso={DESDE} toIso={HASTA} />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('Exportación')).toBeInTheDocument());
    expect(screen.getByText('Neto')).toBeInTheDocument();
  });
});

describe('1.5 · el aviso de cobertura', () => {
  test('un rango incompleto lo dice', async () => {
    servir({ mode: 'generacion', coverage: COBERTURA_CON_HUECOS });

    render(<DataCoverageBadge fromIso={DESDE} toIso={HASTA} />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText(/incompletos al 62%/)).toBeInTheDocument());
  });

  test('un rango completo también, para que el silencio no sea ambiguo', async () => {
    servir({ mode: 'generacion' });

    render(<DataCoverageBadge fromIso={DESDE} toIso={HASTA} />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText(/completos al 100%/)).toBeInTheDocument());
  });

  test('una cobertura inferida se marca como estimada', async () => {
    servir({
      mode: 'generacion',
      coverage: { ...COBERTURA_COMPLETA, expected_source: 'inferido' },
    });

    render(<DataCoverageBadge fromIso={DESDE} toIso={HASTA} />, { wrapper: ConDispositivo });

    await waitFor(() => expect(screen.getByText('(estimado)')).toBeInTheDocument());
  });

  test('sin referencia de cuánto esperar, no se muestra nada', async () => {
    servir({
      mode: 'generacion',
      coverage: {
        ...COBERTURA_COMPLETA,
        expected_source: 'desconocido',
        expected_per_bucket: null,
        overall_ratio: null,
      },
    });

    const { container } = render(<DataCoverageBadge fromIso={DESDE} toIso={HASTA} />, {
      wrapper: ConDispositivo,
    });

    await waitFor(() => expect(pedidos('/analytics/coverage')).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });
});

// --- andamiaje ---------------------------------------------------------

const DESDE = '2026-08-10T00:00:00Z';
const HASTA = '2026-08-11T00:00:00Z';

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
let parametros: Record<string, unknown>[] = [];

function pedidos(url: string): Record<string, unknown>[] {
  return parametros.filter((p) => String(p.url) === url);
}

function servir({
  mode,
  coverage = COBERTURA_COMPLETA,
}: {
  mode: SiteMode;
  coverage?: CoverageResult;
}): void {
  const modo: SiteModeResult = { device_id: 'eq-elegido', mode, source: 'crm' };
  apiClient.defaults.adapter = (config) => {
    const url = config.url ?? '';
    parametros.push({ url, ...(config.params ?? {}) });

    const data: unknown =
      url === '/analytics/heatmap'
        ? HEATMAP
        : url === '/analytics/coverage'
          ? coverage
          : url === '/analytics/site-mode'
            ? modo
            : null;

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
  parametros = [];
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});

describe('la leyenda del mapa', () => {
  /** Un mapa con valores repartidos, para que la escala tenga cortes reales. */
  const conValores = (metric: HeatmapResult['metric']): HeatmapResult => ({
    device_id: 'eq-1',
    period_start: '2026-08-01T05:00:00Z',
    period_end: '2026-08-03T05:00:00Z',
    metric,
    unit: metric === 'cost' ? 'COP' : 'kWh',
    dates: ['2026-08-01', '2026-08-02'],
    values: [
      Array.from({ length: 24 }, (_, h) => h * 0.1),
      Array.from({ length: 24 }, (_, h) => h * 0.2),
    ],
  });

  test('cada frontera de color lleva su valor, no solo "menos" y "más"', () => {
    // Antes eran cinco tonos sin una sola cifra: el color no se podía
    // traducir a consumo.
    render(<CalendarHeatmap data={conValores('import')} valueFormatter={formatKwh} />);

    expect(screen.getByText('menos')).toBeInTheDocument();
    expect(screen.getByText('más')).toBeInTheDocument();
    // Cuatro cortes entre los cinco tonos, cada uno con su cifra en kWh.
    expect(screen.getAllByText(/kWh$/).length).toBeGreaterThanOrEqual(4);
  });

  test('dice que la escala va por cuantiles, que es lo que engañaba', () => {
    // Sin decirlo, dos tonos seguidos pueden separar 0.2 kWh o 3 kWh.
    render(<CalendarHeatmap data={conValores('import')} valueFormatter={formatKwh} />);

    expect(screen.getByText(/cuantiles/)).toBeInTheDocument();
  });

  test('explica la casilla vacía: sin lectura no es consumo cero', () => {
    render(<CalendarHeatmap data={conValores('import')} valueFormatter={formatKwh} />);

    expect(screen.getByText(/Sin lectura/)).toBeInTheDocument();
  });

  test('el balance neto se lee entre exportar e importar, no de menos a más', () => {
    // Sus cortes son artificiales (±0.001 alrededor del cero): un número ahí
    // no diría nada.
    render(<CalendarHeatmap data={conValores('net')} valueFormatter={formatKwh} />);

    expect(screen.getByText('exporta')).toBeInTheDocument();
    expect(screen.getByText('importa')).toBeInTheDocument();
    expect(screen.queryByText('menos')).toBeNull();
  });
});
