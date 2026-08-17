/**
 * F3.4 — la cascada de la factura.
 *
 * Responde "¿por qué pago esto?" y, sobre todo, por qué exportar 150 kWh no
 * acredita 150 kWh al precio del excedente: el tramo 1 se paga al precio de
 * compra y solo el tramo 2 al de excedente.
 */

import { afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen } from '@testing-library/react';
import { CostWaterfall } from '../src/components/charts/CostWaterfall';
import type { CostBreakdown } from '../src/api/types';

const COSTO: CostBreakdown = {
  period: 'month',
  device_id: 'eq-elegido',
  period_start: '2026-08-01T05:00:00Z',
  period_end: '2026-08-31T05:00:00Z',
  consumption_kwh: 120,
  export_kwh: 150,
  consumption_cost_cop: 103102,
  export_credit_cop: 106533,
  net_cost_cop: -3431,
  export_tier1_kwh: 120,
  export_tier2_kwh: 30,
  export_tier1_credit_cop: 103102,
  export_tier2_credit_cop: 3431,
  months_used: ['2026-08'],
  stale_months: [],
  series: [],
};

afterEach(() => {
  cleanup();
});

describe('la cascada de la factura', () => {
  test('separa los dos tramos del crédito con su precio', () => {
    render(<CostWaterfall costs={COSTO} />);

    expect(screen.getByText('Crédito tramo 1')).toBeInTheDocument();
    expect(screen.getByText(/al precio de compra/)).toBeInTheDocument();
    expect(screen.getByText('Crédito tramo 2')).toBeInTheDocument();
    expect(screen.getByText(/al precio de excedente/)).toBeInTheDocument();
  });

  test('un neto negativo se presenta como saldo a favor, no como deuda', () => {
    render(<CostWaterfall costs={COSTO} />);

    expect(screen.getByText('Saldo a tu favor')).toBeInTheDocument();
    expect(screen.queryByText('Neto a pagar')).not.toBeInTheDocument();
  });

  test('un neto positivo es lo que se paga', () => {
    render(
      <CostWaterfall
        costs={{
          ...COSTO,
          export_kwh: 10,
          export_credit_cop: 8592,
          export_tier1_kwh: 10,
          export_tier2_kwh: 0,
          export_tier1_credit_cop: 8592,
          export_tier2_credit_cop: 0,
          net_cost_cop: 94510,
        }}
      />,
    );

    expect(screen.getByText('Neto a pagar')).toBeInTheDocument();
    expect(screen.getByText('Costo de lo importado')).toBeInTheDocument();
  });
});
