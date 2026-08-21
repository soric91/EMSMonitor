/**
 * La sede que solo importa energía — el caso mayoritario.
 *
 * La instalación con paneles es la excepción, no la regla. Donde no hay
 * generación, "exportado", "balance neto" y "crédito por exportar" no son
 * datos en cero a la espera de llenarse: son widgets que nunca van a tener
 * nada, y mostrarlos obliga al cliente a interpretar ceros que no significan
 * lo que parecen.
 */

import { describe, expect, test } from '@rstest/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach } from '@rstest/core';
import { EnergyBalanceCards } from '../src/components/dashboard/EnergyBalanceCards';
import { WeeklyBreakdownCard } from '../src/components/dashboard/WeeklyBreakdownCard';
import { puntosDeCosto } from '../src/components/charts/puntosDeCosto';
import { tieneGeneracion } from '../src/domain/informeMensual';
import type { SemanaDelPeriodo } from '../src/domain/detalleDelPeriodo';
import type { CostPoint } from '../src/api/types';
import type { DatosInformeMensual } from '../src/domain/informeMensual';

afterEach(cleanup);

describe('los totales del periodo', () => {
  test('una sede de consumo puro muestra una sola tarjeta', () => {
    render(<EnergyBalanceCards consumptionKwh={380} exportKwh={0} netKwh={380} soloImporta />);

    expect(screen.getByText('Consumo del periodo')).toBeInTheDocument();
    // Ni exportado en cero ni un "balance" que solo puede ir en una dirección.
    expect(screen.queryByText('Exportado')).toBeNull();
    expect(screen.queryByText('Balance neto')).toBeNull();
    expect(screen.queryByText('Importador neto')).toBeNull();
  });

  test('con generación siguen las tres', () => {
    render(<EnergyBalanceCards consumptionKwh={380} exportKwh={55} netKwh={325} />);

    expect(screen.getByText('Importado')).toBeInTheDocument();
    expect(screen.getByText('Exportado')).toBeInTheDocument();
    expect(screen.getByText('Balance neto')).toBeInTheDocument();
  });
});

describe('el desglose semanal', () => {
  const semanas: SemanaDelPeriodo[] = [
    {
      inicio: '2026-08-03T05:00:00.000Z',
      fin: '2026-08-10T05:00:00.000Z',
      etiqueta: '3 – 9 ago',
      consumoKwh: 70,
      exportacionKwh: 0,
      buckets: 7,
    },
    {
      inicio: '2026-08-10T05:00:00.000Z',
      fin: '2026-08-17T05:00:00.000Z',
      etiqueta: '10 – 16 ago',
      consumoKwh: 90,
      exportacionKwh: 0,
      buckets: 7,
    },
  ];

  test('sin generación la gráfica se titula por lo que sí hay', () => {
    render(<WeeklyBreakdownCard semanas={semanas} soloImporta />);

    expect(screen.getByText('Consumo por semana')).toBeInTheDocument();
  });
});

describe('el costo por bucket', () => {
  const punto: CostPoint = {
    time: '2026-08-01T05:00:00Z',
    consumption_kwh: 12,
    export_kwh: 0,
    consumption_cost_cop: 7500,
    export_credit_cop: 0,
    net_cost_cop: 7500,
  };

  test('sin generación el crédito no viaja a la gráfica', () => {
    const puntos = puntosDeCosto([punto], () => 'ago', true);

    expect(puntos[0]!.a).toBe(7500);
    expect(puntos[0]!.b).toBe(0);
  });

  test('con generación sí', () => {
    const conCredito = { ...punto, export_credit_cop: 1200 };

    expect(puntosDeCosto([conCredito], () => 'ago')[0]!.b).toBe(1200);
  });
});

describe('el informe en PDF', () => {
  // Se arma fuera de React, así que deduce la generación de los datos que ya
  // trae en vez de preguntarle a useSiteMode.
  const base = {
    sede: 'Planta · Tablero',
    reporte: { export_kwh: 0 },
    cargaBase: null,
  } as unknown as DatosInformeMensual;

  test('sin exportación ni carga base nocturna, la sede solo importa', () => {
    expect(tieneGeneracion(base)).toBe(false);
  });

  test('exportar aunque sea un poco la delata', () => {
    const conSolar = { ...base, reporte: { export_kwh: 55 } } as unknown as DatosInformeMensual;

    expect(tieneGeneracion(conSolar)).toBe(true);
  });

  test('una carga base medida de noche también', () => {
    // Es lo que hace el backend cuando la curva diurna está contaminada por
    // los paneles: un mes nublado puede exportar cero y seguir teniendo solar.
    const nocturna = {
      ...base,
      cargaBase: { window: 'noche' },
    } as unknown as DatosInformeMensual;

    expect(tieneGeneracion(nocturna)).toBe(true);
  });
});
