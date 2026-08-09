/**
 * Cuál de los dos avisos sale.
 *
 * Los dos aparecen cuando el tablero no puede dibujar nada, pero mandan a
 * revisar lados opuestos del sistema. Confundirlos costó una tarde entera:
 * el CRM tenía las ocho variables cargadas, el aviso decía que no había
 * ninguna, y la búsqueda arrancó por lo único que estaba bien.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { AuthProvider } from '../src/context/AuthContext';
import { VariablesProvider } from '../src/context/VariablesContext';
import { SinConfiguracion } from '../src/components/layout/SinConfiguracion';
import type { VariableDisponible } from '../src/api/types';

function medicion(nombre: string, con_datos: boolean): VariableDisponible {
  return {
    nombre,
    etiqueta: nombre,
    unidad: 'V',
    magnitud: 'tension',
    fase: 'A',
    acumulativa: false,
    equipos: ['eq-1'],
    con_datos,
  };
}

describe('el aviso acusa a quien corresponde', () => {
  test('sin nada en el CRM manda al CRM', async () => {
    servir([]);

    render(<Arbol />);

    await waitFor(() => screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toHaveTextContent(/Se configuran en el CRM/);
  });

  test('con variables cargadas y sin lecturas NO manda al CRM', async () => {
    // La regresión concreta. El CRM está completo: decirle a alguien que dé
    // de alta mediciones que ya están dadas de alta lo manda a buscar un
    // problema que no tiene.
    servir([medicion('PhV_phsA', false), medicion('PhV_phsB', false)]);

    render(<Arbol />);

    await waitFor(() => screen.getByRole('dialog'));
    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveTextContent(/No hay nada que corregir en el CRM/);
    expect(dialogo).not.toHaveTextContent(/Se configuran en el CRM/);
  });

  test('dice cuántas mediciones hay cargadas', async () => {
    servir([medicion('PhV_phsA', false), medicion('PhV_phsB', false)]);

    render(<Arbol />);

    await waitFor(() => screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toHaveTextContent(/2 mediciones cargadas/);
  });

  test('con al menos una variable con datos no aparece ningún aviso', async () => {
    servir([medicion('PhV_phsA', true), medicion('PhV_phsB', false)]);

    render(<Arbol />);

    await waitFor(() => expect(pedidos).toContain('/variables'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('si la consulta falla no se afirma nada', async () => {
    // No se sabe si hay variables. Acusar a cualquiera de los dos lados sería
    // inventar, y el tablero en cero ya se ve solo.
    servir([], { falla: true });

    render(<Arbol />);

    await waitFor(() => expect(pedidos).toContain('/variables'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// --- andamiaje ---------------------------------------------------------

function Arbol() {
  return (
    <AuthProvider>
      <VariablesProvider>
        <SinConfiguracion />
      </VariablesProvider>
    </AuthProvider>
  );
}

const adapterOriginal = apiClient.defaults.adapter;
let pedidos: string[] = [];

function servir(variables: VariableDisponible[], options: { falla?: boolean } = {}): void {
  apiClient.defaults.adapter = (config) => {
    pedidos.push(config.url ?? '');
    if (options.falla) return Promise.reject(new Error('sin red'));
    return Promise.resolve({
      data: { success: true, message: '', data: variables },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
}

afterEach(() => {
  pedidos = [];
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});
