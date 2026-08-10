/**
 * Cuándo se abre el WebSocket.
 *
 * Un proyecto sin variables cargadas no tiene nada que suscribir ni de qué
 * alertar —las alertas salen de las lecturas— así que abrir el socket dejaba
 * un ciclo de reconexión con backoff corriendo para siempre contra algo que
 * nunca iba a tener datos. En la consola se veía como una falla real.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { render, waitFor } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { setAccessToken, clearSession } from '../src/api/tokenStore';
import { RealtimeProvider } from '../src/context/RealtimeContext';
import { VariablesProvider } from '../src/context/VariablesContext';
import { DeviceProvider } from '../src/context/DeviceContext';
import type { VariableDisponible } from '../src/api/types';

const UNA_VARIABLE: VariableDisponible = {
  nombre: 'PhV_phsA',
  etiqueta: 'Tensión fase A',
  unidad: 'V',
  magnitud: 'tension',
  fase: 'A',
  acumulativa: false,
  equipos: ['eq-1'],
  con_datos: true,
};

describe('no se conecta si no hay nada que suscribir', () => {
  test('sin variables no se abre ningún socket', async () => {
    servir([]);

    render(<Arbol />);

    await waitFor(() => expect(pedidos).toContain('/variables'));
    expect(abiertos).toHaveLength(0);
  });

  test('con variables sí se abre', async () => {
    servir([UNA_VARIABLE]);

    render(<Arbol />);

    await waitFor(() => expect(abiertos).toHaveLength(1));
  });

  test('una variable declarada sin datos igual abre el socket', async () => {
    // Sin histórico todavía, pero el gateway puede estar publicando ahora
    // mismo: es el caso de un medidor recién instalado y el de un
    // almacenamiento caído. Cerrar el socket acá dejaría al panel sin lo
    // único que sí está llegando.
    servir([{ ...UNA_VARIABLE, con_datos: false }]);

    render(<Arbol />);

    await waitFor(() => expect(abiertos).toHaveLength(1));
  });

  test('mientras carga no se adivina', async () => {
    // Conectar antes de saber si hay variables abriría el socket en el mismo
    // caso que este cambio existe para evitar.
    servirLento();

    render(<Arbol />);

    expect(abiertos).toHaveLength(0);
  });

  test('si la lista falla tampoco conecta', async () => {
    // No se sabe si hay variables. Reintentar contra un backend que quizá no
    // tiene nada es el ciclo que se quiso apagar.
    servir([], { falla: true });

    render(<Arbol />);

    await waitFor(() => expect(pedidos).toContain('/variables'));
    expect(abiertos).toHaveLength(0);
  });
});

// --- andamiaje ---------------------------------------------------------

function Arbol() {
  return (
    <VariablesProvider>
      <DeviceProvider>
        <RealtimeProvider>
          <span />
        </RealtimeProvider>
      </DeviceProvider>
    </VariablesProvider>
  );
}

const WebSocketOriginal = globalThis.WebSocket;
const adapterOriginal = apiClient.defaults.adapter;
let abiertos: string[] = [];
let pedidos: string[] = [];

class WebSocketEspia {
  static readonly CONNECTING = 0;
  readyState = WebSocketEspia.CONNECTING;
  constructor(url: string) {
    abiertos.push(url);
  }
  close(): void {}
  addEventListener(): void {}
}

function instalarEspia(): void {
  globalThis.WebSocket = WebSocketEspia as unknown as typeof WebSocket;
}

function servir(variables: VariableDisponible[], options: { falla?: boolean } = {}): void {
  instalarEspia();
  setAccessToken('token-de-prueba');
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

/** Una respuesta que nunca llega: deja el contexto en «cargando». */
function servirLento(): void {
  instalarEspia();
  setAccessToken('token-de-prueba');
  apiClient.defaults.adapter = () => new Promise(() => {});
}

afterEach(() => {
  abiertos = [];
  pedidos = [];
  clearSession();
});

afterAll(() => {
  globalThis.WebSocket = WebSocketOriginal;
  apiClient.defaults.adapter = adapterOriginal;
});
