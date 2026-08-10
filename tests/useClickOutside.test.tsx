/**
 * useClickOutside: cierra al hacer click fuera y con Escape.
 */

import { describe, expect, test } from '@rstest/core';
import { fireEvent, render } from '@testing-library/react';
import { useClickOutside } from '../src/hooks/useClickOutside';

function Mount({ onOutside }: { onOutside: () => void }) {
  const ref = useClickOutside<HTMLDivElement>(onOutside);
  return (
    <div>
      <div ref={ref} data-testid="panel">
        panel
      </div>
      <button>afuera</button>
    </div>
  );
}

describe('useClickOutside', () => {
  test('cierra al hacer clic fuera del elemento', () => {
    let called = 0;
    const { container } = render(<Mount onOutside={() => (called += 1)} />);

    fireEvent.mouseDown(container.querySelector('button')!);
    expect(called).toBe(1);
  });

  test('no cierra al hacer clic dentro del elemento', () => {
    let called = 0;
    const { getByTestId } = render(<Mount onOutside={() => (called += 1)} />);

    fireEvent.mouseDown(getByTestId('panel'));
    expect(called).toBe(0);
  });

  test('cierra con Escape', () => {
    let called = 0;
    render(<Mount onOutside={() => (called += 1)} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(called).toBe(1);
  });
});
