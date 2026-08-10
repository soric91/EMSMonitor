/**
 * La salida de la pantalla de contraseña obligatoria.
 *
 * `ProtectedRoute` sabe traer acá a quien la tiene pendiente, pero nada sacaba
 * de acá al que ya la cambió: el guardado funcionaba, la sesión quedaba lista,
 * y la pantalla seguía siendo la misma. Sin botón de volver ni de cerrar, para
 * el cliente eso se ve como una aplicación colgada.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { crmClient } from '../src/api/crmClient';
import { setAccessToken, setRefreshToken, clearSession } from '../src/api/tokenStore';
import { AuthProvider } from '../src/context/AuthContext';
import ChangePassword from '../src/pages/ChangePassword';
import type { UserInfo } from '../src/api/types';

const CLIENTE: UserInfo = {
  user_id: 'u1',
  email: 'cliente@empresa.com',
  client_id: 'c1',
  role: 'cliente',
  impersonated: false,
  must_change_password: true,
};

describe('después de elegir la contraseña', () => {
  test('sale de la pantalla en vez de quedarse', async () => {
    servir();
    render(<ChangePassword />, { wrapper: ConAuth });
    await waitFor(() => expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument());

    completarYGuardar();

    await waitFor(() =>
      expect(screen.getByTestId('ubicacion')).toHaveTextContent('/dashboard'),
    );
  });

  test('mientras no la cambie se queda, que es lo que se quiere', async () => {
    // El otro lado de la regla: la pantalla no tiene forma de saltearse.
    servir({ cambiaDeVerdad: false });
    render(<ChangePassword />, { wrapper: ConAuth });
    await waitFor(() => expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument());

    completarYGuardar();

    await waitFor(() => expect(pedidos).toContain('POST /auth-monitor/password'));
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/cambiar-password');
  });

  test('si el guardado falla tampoco se va', async () => {
    servir({ falla: true });
    render(<ChangePassword />, { wrapper: ConAuth });
    await waitFor(() => expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument());

    completarYGuardar();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByTestId('ubicacion')).toHaveTextContent('/cambiar-password');
  });
});

// --- andamiaje ---------------------------------------------------------

function completarYGuardar(): void {
  escribir('Contraseña actual', 'la-de-un-solo-uso');
  escribir('Nueva contraseña', 'una-contraseña-mia');
  escribir('Repetila', 'una-contraseña-mia');
  fireEvent.click(screen.getByText('Guardar y entrar'));
}

function escribir(label: string, valor: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value: valor } });
}

function ConAuth({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/cambiar-password']}>
      <AuthProvider>
        {children}
        <Ubicacion />
      </AuthProvider>
    </MemoryRouter>
  );
}

/** Delata a dónde navegó: el componente suelto nunca se desmonta. */
function Ubicacion() {
  return <span data-testid="ubicacion">{useLocation().pathname}</span>;
}

const adapterOriginal = crmClient.defaults.adapter;
let pedidos: string[] = [];

function servir(options: { cambiaDeVerdad?: boolean; falla?: boolean } = {}): void {
  // Arranca debiendo la contraseña; el POST la salda, igual que en el CRM.
  let debeCambiarla = true;

  setAccessToken('token-de-prueba');
  setRefreshToken('r'); // dispara el bootstrap del contexto

  crmClient.defaults.adapter = (config) => {
    const ruta = `${(config.method ?? 'get').toUpperCase()} ${config.url}`;
    pedidos.push(ruta);

    const responder = (data: unknown) =>
      Promise.resolve({ data, status: 200, statusText: 'OK', headers: {}, config });

    if (config.url === '/auth-monitor/password') {
      if (options.falla) return Promise.reject(new Error('contraseña incorrecta'));
      if (options.cambiaDeVerdad !== false) debeCambiarla = false;
    }
    if (config.url === '/auth-monitor/me') {
      return responder({ ...CLIENTE, must_change_password: debeCambiarla });
    }
    return responder({
      access_token: 'a',
      refresh_token: 'r',
      token_type: 'bearer',
      expires_in: 900,
      client_id: 'c1',
      role: 'cliente',
      must_change_password: debeCambiarla,
    });
  };
}

afterEach(() => {
  pedidos = [];
  clearSession();
});

afterAll(() => {
  crmClient.defaults.adapter = adapterOriginal;
});
