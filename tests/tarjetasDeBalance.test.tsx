/**
 * Las tres tarjetas de energía del periodo.
 *
 * Estaban escritas dos veces con una divergencia que nadie decidió: una
 * página toleraba el balance nulo y la otra lo asumía número. Acá se fija la
 * versión que queda, incluido el color por signo — el que dice si la plata va
 * a favor o en contra sin obligar a leer la letra chica.
 */

import { describe, expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { EnergyBalanceCards } from '../src/components/dashboard/EnergyBalanceCards';

describe('los totales', () => {
  test('importado y exportado salen formateados en kWh', () => {
    render(<EnergyBalanceCards consumptionKwh={12.4} exportKwh={3.5} netKwh={8.9} />);

    expect(screen.getByText('12.40 kWh')).toBeInTheDocument();
    expect(screen.getByText('3.50 kWh')).toBeInTheDocument();
  });

  test('el balance se muestra en valor absoluto, con el signo dicho en palabras', () => {
    render(<EnergyBalanceCards consumptionKwh={1} exportKwh={9} netKwh={-8} />);

    // −8 kWh se lee "8.00 kWh · Exportador neto", no "-8.00 kWh".
    expect(screen.getByText('8.00 kWh')).toBeInTheDocument();
    expect(screen.queryByText('-8.00 kWh')).toBeNull();
  });
});

describe('el signo del balance', () => {
  test('importador neto va en ámbar', () => {
    render(<EnergyBalanceCards consumptionKwh={10} exportKwh={2} netKwh={8} />);

    expect(screen.getByText('Importador neto')).toBeInTheDocument();
    expect(screen.getByText('8.00 kWh').className).toContain('text-amber');
  });

  test('exportador neto va en verde: es plata a favor', () => {
    render(<EnergyBalanceCards consumptionKwh={2} exportKwh={10} netKwh={-8} />);

    expect(screen.getByText('Exportador neto')).toBeInTheDocument();
    expect(screen.getByText('8.00 kWh').className).toContain('text-emerald');
  });
});

describe('lo que el dato no sostiene', () => {
  test('un balance nulo pinta — y no afirma ninguna de las dos cosas', () => {
    render(<EnergyBalanceCards consumptionKwh={5} exportKwh={0} netKwh={null} />);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('Importador neto')).toBeNull();
    expect(screen.queryByText('Exportador neto')).toBeNull();
  });

  test('sin valores muestra los tres esqueletos, no ceros', () => {
    render(<EnergyBalanceCards />);

    expect(screen.queryByText('0.00 kWh')).toBeNull();
    expect(screen.getByText('Importado')).toBeInTheDocument();
    expect(document.querySelectorAll('.text-2xl').length).toBe(0);
  });
});
