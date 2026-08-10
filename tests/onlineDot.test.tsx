/**
 * OnlineDot: el punto que comunica estado de un vistazo.
 */

import { describe, expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { OnlineDot } from '../src/components/ui/OnlineDot';

describe('OnlineDot', () => {
  test('usa el color del tono pedido', () => {
    const { container } = render(<OnlineDot tone="emerald" />);
    expect(container.innerHTML).toContain('bg-emerald-500');
  });

  test('sin pulse no dibuja la onda que se expande (solo el punto)', () => {
    const { container } = render(<OnlineDot />);
    const dots = container.querySelectorAll('span[class*="rounded-full"]');
    expect(dots.length).toBe(1);
  });

  test('con pulse agrega la onda animada', () => {
    const { container } = render(<OnlineDot pulse />);
    const dots = container.querySelectorAll('span[class*="rounded-full"]');
    expect(dots.length).toBe(2);
  });

  test('expone label accesible como aria-label del rol status', () => {
    render(<OnlineDot label="En línea" />);
    expect(screen.getByRole('status', { name: 'En línea' })).toBeTruthy();
  });
});
