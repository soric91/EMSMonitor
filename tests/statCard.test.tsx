/**
 * StatCard: la tarjeta label+valor compartida por todo el tablero.
 */

import { describe, expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { StatCard } from '../src/components/ui/StatCard';

describe('StatCard', () => {
  test('muestra label y value', () => {
    render(<StatCard label="Importado" value="10.50 kWh" />);

    expect(screen.getByText('Importado')).toBeTruthy();
    expect(screen.getByText('10.50 kWh')).toBeTruthy();
  });

  test('sin value muestra el esqueleto de carga', () => {
    render(<StatCard label="Potencia promedio" />);

    const label = screen.getByText('Potencia promedio');
    // Sin value aún no hay número grande: está en carga.
    const value = label.parentElement?.querySelector('.text-2xl');
    expect(value).toBeNull();
  });

  test('tiene un footer opcional', () => {
    render(<StatCard label="Neto" value="−5 kWh" footer="a tu favor" />);

    expect(screen.getByText('a tu favor')).toBeTruthy();
  });

  test('distingue el tono import (ámbar) del export (esmeralda)', () => {
    render(<StatCard label="Importado" value="1" tone="import" icon={<span>i</span>} />);
    render(<StatCard label="Exportado" value="2" tone="export" icon={<span>e</span>} />);

    const html = document.body.innerHTML;
    expect(html).toContain('bg-amber-500/10');
    expect(html).toContain('bg-emerald-500/10');
  });
});
