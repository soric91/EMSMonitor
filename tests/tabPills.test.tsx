/**
 * TabPills: tabs con píldora animada, navegables por teclado.
 */

import { describe, expect, test } from '@rstest/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { TabPills } from '../src/components/ui/TabPills';

const OPTIONS = [
  { key: 'day', label: 'Día' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
];

function spy() {
  const calls: string[] = [];
  return {
    calls,
    fn: (key: string) => {
      calls.push(key);
    },
  };
}

describe('TabPills', () => {
  test('resalta la tab activa y cambia al hacer click', () => {
    const on = spy();
    render(<TabPills options={OPTIONS} value="day" onChange={on.fn} layoutId="p" />);

    fireEvent.click(screen.getByText('Mes'));
    expect(on.calls).toEqual(['month']);
  });

  test('cada instancia dibuja su píldora solo en la tab activa', () => {
    // El layoutId es obligatorio en el tipo: no se puede montar el componente
    // sin él. Lo que sí se puede comprobar es que cada instancia pinta UNA
    // píldora, cada una dentro de su tab aria-selected — si dos compartieran
    // layoutId, framer las animaría a la vez y se verían mal.
    render(
      <>
        <TabPills options={OPTIONS} value="day" onChange={() => {}} layoutId="tab-a" />
        <TabPills options={OPTIONS} value="week" onChange={() => {}} layoutId="tab-b" />
      </>,
    );

    const pills = document.querySelectorAll('.absolute.inset-0');
    expect(pills.length).toBe(2);
    pills.forEach((pill) => {
      expect(pill.closest('[aria-selected="true"]')).toBeTruthy();
    });
    expect(
      screen.getByRole('tab', { selected: true, name: 'Día' }).querySelector('.absolute'),
    ).toBeTruthy();
    expect(
      screen.getByRole('tab', { selected: true, name: 'Semana' }).querySelector('.absolute'),
    ).toBeTruthy();
  });

  test('navega con las flechas del teclado', () => {
    let value: string = 'day';
    const callbacks: string[] = [];
    const { rerender } = render(
      <TabPills
        options={OPTIONS}
        value={value as 'day' | 'week'}
        onChange={(k) => {
          value = k;
          callbacks.push(k);
        }}
        layoutId="p"
      />,
    );
    const redraw = () =>
      rerender(
        <TabPills
          options={OPTIONS}
          value={value as 'day' | 'week'}
          onChange={(k) => {
            value = k;
            callbacks.push(k);
          }}
          layoutId="p"
        />,
      );

    fireEvent.keyDown(screen.getByRole('tab', { selected: true }), { key: 'ArrowRight' });
    redraw();
    expect(callbacks).toEqual(['week']);

    fireEvent.keyDown(screen.getByRole('tab', { selected: true }), { key: 'ArrowLeft' });
    redraw();
    expect(callbacks).toEqual(['week', 'day']);
  });

  test('expone las tabs con role tab y aria-selected', () => {
    render(<TabPills options={OPTIONS} value="day" onChange={() => {}} layoutId="p" />);

    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Día');
  });
});
