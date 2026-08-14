/**
 * La tarjeta KPI única del panel: valor, unidad, timestamp, variación y
 * estados loading/empty. Es el contrato visual que todos los indicadores del
 * RESUMEN comparten, así que su forma es lo que hay que fijar acá.
 */

import { describe, expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { KpiCard } from '../src/components/dashboard/KpiCard';

describe('KpiCard', () => {
  test('muestra etiqueta, valor y unidad', () => {
    render(<KpiCard label="Consumido hoy" value="7.45" unit="kWh" />);

    expect(screen.getByText('Consumido hoy')).toBeInTheDocument();
    expect(screen.getByText('7.45')).toBeInTheDocument();
    expect(screen.getByText('kWh')).toBeInTheDocument();
  });

  test('con loading no muestra el valor y dibuja esqueletos', () => {
    const { container } = render(<KpiCard label="Consumido hoy" value="7.45" loading />);

    expect(screen.queryByText('7.45')).toBeNull();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  test('empty muestra un guión en vez de inventar un valor', () => {
    render(<KpiCard label="Exportado mes" value="10.52" empty />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('10.52')).toBeNull();
  });

  test('una variación buena se pinta en verde y una mala en ámbar', () => {
    const { container, rerender } = render(
      <KpiCard
        label="Exportado hoy"
        value="10.52"
        variacion={{ delta: 12.4, label: 'vs. ayer', positivo: true }}
      />,
    );

    const buen = container.querySelector('.text-emerald-600');
    expect(buen).not.toBeNull();

    rerender(
      <KpiCard
        label="Consumido hoy"
        value="7.45"
        variacion={{ delta: 12.4, label: 'vs. ayer', positivo: false }}
      />,
    );

    const malo = container.querySelector('.text-amber-600');
    expect(malo).not.toBeNull();
  });

  test('muestra el timestamp en hora local', () => {
    render(<KpiCard label="Potencia" value="5.21" timestamp="2026-08-13T20:30:00Z" />);

    // America/Bogota = UTC-5 → 15:30 local.
    expect(screen.getByText('15:30')).toBeInTheDocument();
  });
});
