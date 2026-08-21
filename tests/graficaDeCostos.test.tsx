/**
 * La gráfica de costo por bucket.
 *
 * Vivía solo en la página de Consumo/Exportación; al fusionarse con Reportes
 * pasa a ser una pieza propia. Lo que se prueba acá es lo que no puede
 * cambiar: que no se dibuje sin datos, y que las etiquetas del eje sean las
 * del periodo y no las de una tabla fija.
 */

import { describe, expect, test } from '@rstest/core';
import { render, screen } from '@testing-library/react';
import { PeriodCostChart, puntosDeCosto } from '../src/components/charts/PeriodCostChart';
import type { CostPoint } from '../src/api/types';

const PUNTO = (time: string, costo: number, credito: number): CostPoint => ({
  time,
  consumption_kwh: 1,
  export_kwh: 0,
  consumption_cost_cop: costo,
  export_credit_cop: credito,
  net_cost_cop: costo - credito,
});

describe('cuándo se dibuja', () => {
  test('sin serie no monta nada: cero no es lo mismo que "no se sabe"', () => {
    const { container } = render(<PeriodCostChart series={[]} labelOf={(t) => t} />);

    expect(container.innerHTML).toBe('');
  });

  test('con serie sí monta la tarjeta, con su título', () => {
    render(
      <PeriodCostChart series={[PUNTO('2026-08-01T05:00:00Z', 7751, 1142)]} labelOf={(t) => t} />,
    );

    expect(screen.getByText('Costo por periodo (COP)')).toBeInTheDocument();
  });
});

describe('qué va en cada barra', () => {
  test('la primera es el costo importado y la segunda el crédito exportado', () => {
    const puntos = puntosDeCosto([PUNTO('2026-08-01T05:00:00Z', 7751, 1142)], () => 'ago');

    expect(puntos).toEqual([{ label: 'ago', a: 7751, b: 1142 }]);
  });

  test('no suma ni netea: los valores viajan tal como los calculó el backend', () => {
    const puntos = puntosDeCosto(
      [PUNTO('2026-08-01T05:00:00Z', 100, 30), PUNTO('2026-08-02T05:00:00Z', 200, 50)],
      () => 'x',
    );

    // Dos puntos, dos barras. Nada de un total de 300 armado en el cliente:
    // el crédito por exportar se reparte en tramos contra el mes, no por día.
    expect(puntos.length).toBe(2);
    expect(puntos.map((p) => p.a)).toEqual([100, 200]);
  });
});

describe('las etiquetas del eje', () => {
  test('salen del formateador que le pasa la página, no de una tabla interna', () => {
    const vistos: string[] = [];
    puntosDeCosto(
      [PUNTO('2026-08-01T05:00:00Z', 10, 0), PUNTO('2026-09-01T05:00:00Z', 20, 0)],
      (t) => {
        vistos.push(t);
        return 'X';
      },
    );

    expect(vistos).toEqual(['2026-08-01T05:00:00Z', '2026-09-01T05:00:00Z']);
  });
});
