/**
 * Un administrador eligiendo qué empresa mirar.
 *
 * Lo que importa acá no es que la lista se dibuje, sino dos límites: que una
 * empresa con el consumo apagado se pueda abrir igual —es el caso que motivó
 * la pantalla— y que mientras se está mirando otra empresa haya un aviso que
 * no se pueda perder de vista.
 */

import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { crmClient } from '../src/api/crmClient';
import { setAccessToken, setRefreshToken, clearSession } from '../src/api/tokenStore';
import { AuthProvider } from '../src/context/AuthContext';
import { ImpersonationBanner } from '../src/components/layout/ImpersonationBanner';
import { Proyectos } from '../src/pages/Proyectos';
import type { GatewayCaido, Proyecto, UserInfo } from '../src/api/types';

const HABILITADA: Proyecto = {
  id: 'c1',
  nombre_empresa: 'Industrias Andinas',
  estado: 'activo',
  puede_ver_consumo: true,
  sedes: 2,
  gateways: 3,
  gateways_en_linea: 3,
  equipos: 4,
  variables: 9,
  ultima_conexion: new Date().toISOString(),
};
const APAGADA: Proyecto = {
  id: 'c2',
  nombre_empresa: 'Textiles del Sur',
  estado: 'prospecto',
  puede_ver_consumo: false,
  sedes: 0,
  gateways: 0,
  gateways_en_linea: 0,
  equipos: 0,
  variables: 0,
  ultima_conexion: null,
};

describe('la pantalla de proyectos', () => {
  test('lista las empresas', async () => {
    servir({ proyectos: [HABILITADA, APAGADA] });

    render(<Proyectos />, { wrapper: ConAuth });

    await waitFor(() => expect(screen.getByText('Industrias Andinas')).toBeInTheDocument());
    expect(screen.getByText('Textiles del Sur')).toBeInTheDocument();
  });

  test('marca la que tiene el consumo oculto para el cliente', async () => {
    servir({ proyectos: [HABILITADA, APAGADA] });

    render(<Proyectos />, { wrapper: ConAuth });

    await waitFor(() => expect(screen.getByText('Textiles del Sur')).toBeInTheDocument());
    expect(screen.getByText(/Oculto para el cliente/)).toBeInTheDocument();
  });

  test('una empresa con el consumo apagado se puede abrir igual', async () => {
    // El caso que motivó la pantalla: revisar una empresa antes de
    // habilitarla. Si la tarjeta estuviera deshabilitada, la única forma de
    // ver qué tiene cargada sería habilitársela al cliente primero.
    servir({ proyectos: [APAGADA] });
    render(<Proyectos />, { wrapper: ConAuth });
    await waitFor(() => expect(screen.getByText('Textiles del Sur')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Textiles del Sur'));

    await waitFor(() => expect(pedidos).toContain('POST /auth-monitor/impersonate/c2'));
  });

  test('al abrir un proyecto se sale de esta pantalla', async () => {
    // El guardia solo manda acá cuando falta elegir empresa; no saca de acá
    // al elegirla. Sin navegar, la tarjeta se queda en "abriendo…" con la
    // sesión ya cambiada — que fue exactamente el síntoma reportado.
    servir({ proyectos: [HABILITADA] });
    render(<Proyectos />, { wrapper: ConAuth });
    await waitFor(() => expect(screen.getByText('Industrias Andinas')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Industrias Andinas'));

    await waitFor(() => expect(screen.getByTestId('ubicacion')).toHaveTextContent('/dashboard'));
  });

  test('la tarjeta muestra el inventario, no solo el nombre', async () => {
    // Sin esto todas las tarjetas se ven iguales y no hay forma de distinguir
    // un proyecto instalado de uno recién dado de alta.
    servir({ proyectos: [HABILITADA] });

    render(<Proyectos />, { wrapper: ConAuth });

    await waitFor(() => expect(screen.getByText(/2 sedes/)).toBeInTheDocument());
    expect(screen.getByText(/3 gateways/)).toBeInTheDocument();
    expect(screen.getByText(/4 medidores/)).toBeInTheDocument();
  });

  test('la tarjeta dice qué falta, o que está operando', async () => {
    servir({ proyectos: [HABILITADA, APAGADA] });

    render(<Proyectos />, { wrapper: ConAuth });

    await waitFor(() => expect(screen.getByText('Operando')).toBeInTheDocument());
    expect(screen.getByText('Sin sedes cargadas')).toBeInTheDocument();
  });

  test('los proyectos con problemas van primero', async () => {
    // Ordenados por nombre, "Industrias" iría antes que "Textiles" y el
    // proyecto roto quedaría escondido debajo del que anda bien.
    servir({ proyectos: [HABILITADA, APAGADA] });
    render(<Proyectos />, { wrapper: ConAuth });
    await waitFor(() => expect(screen.getByText('Operando')).toBeInTheDocument());

    const nombres = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((t) => t.includes('Industrias') || t.includes('Textiles'));

    expect(nombres[0]).toContain('Textiles del Sur');
  });

  test('pide el resumen y no el árbol completo', async () => {
    // Contar del lado del navegador obligaba a traer cada registro Modbus de
    // cada equipo de cada empresa para dibujar "3 gateways".
    servir({ proyectos: [HABILITADA] });

    render(<Proyectos />, { wrapper: ConAuth });

    await waitFor(() => expect(pedidos).toContain('GET /fleet/summary'));
  });

  test('sin empresas dadas de alta lo dice, en vez de quedar en blanco', async () => {
    servir({ proyectos: [] });

    render(<Proyectos />, { wrapper: ConAuth });

    await waitFor(() => expect(screen.getByText('No hay proyectos')).toBeInTheDocument());
  });

  test('si la lista falla lo avisa', async () => {
    servir({ proyectos: [], fallaLista: true });

    render(<Proyectos />, { wrapper: ConAuth });

    await waitFor(() =>
      expect(screen.getByText(/No se pudieron cargar los proyectos/)).toBeInTheDocument(),
    );
  });
});

describe('la cabecera y el buscador', () => {
  test('muestra con qué cuenta entraste', async () => {
    // Antes no había forma de saberlo ni de salir: la pantalla no monta el
    // Topbar, que necesita una empresa elegida.
    servir({ proyectos: [HABILITADA], identidad: identidadAdmin });
    setRefreshToken('r');

    render(<Proyectos />, { wrapper: ConAuth });

    await waitFor(() => expect(screen.getByText('admin@ems.com')).toBeInTheDocument());
    expect(screen.getByTitle('Cerrar sesión')).toBeInTheDocument();
  });

  test('filtra por nombre', async () => {
    servir({ proyectos: [HABILITADA, APAGADA] });
    render(<Proyectos />, { wrapper: ConAuth });
    await waitFor(() => expect(screen.getByText('Industrias Andinas')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Buscar empresa'), {
      target: { value: 'textiles' },
    });

    expect(screen.getByText('Textiles del Sur')).toBeInTheDocument();
    expect(screen.queryByText('Industrias Andinas')).toBeNull();
  });

  test('sin coincidencias lo dice, en vez de mostrar una grilla vacía', async () => {
    servir({ proyectos: [HABILITADA] });
    render(<Proyectos />, { wrapper: ConAuth });
    await waitFor(() => expect(screen.getByText('Industrias Andinas')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Buscar empresa'), {
      target: { value: 'zzz' },
    });

    expect(screen.getByText('Sin coincidencias')).toBeInTheDocument();
  });

  test('no ofrece buscador cuando no hay nada que buscar', async () => {
    servir({ proyectos: [] });

    render(<Proyectos />, { wrapper: ConAuth });

    await waitFor(() => expect(screen.getByText('No hay proyectos')).toBeInTheDocument());
    expect(screen.queryByLabelText('Buscar empresa')).toBeNull();
  });
});

describe('los gateways caídos de toda la flota', () => {
  test('no se dibuja nada cuando no hay ninguno', async () => {
    // Un "0 gateways caídos" ocupa el mismo lugar que el aviso real y entrena
    // a no mirar ahí.
    servir({ proyectos: [HABILITADA], caidos: [] });

    render(<Proyectos />, { wrapper: ConAuth });

    await waitFor(() => expect(screen.getByText('Industrias Andinas')).toBeInTheDocument());
    expect(screen.queryByText(/sin reportar/)).toBeNull();
  });

  test('avisa cuántos hay', async () => {
    servir({ proyectos: [HABILITADA], caidos: [CAIDO, NUNCA] });

    render(<Proyectos />, { wrapper: ConAuth });

    await waitFor(() => expect(screen.getByText('2 gateways sin reportar')).toBeInTheDocument());
  });

  test('al desplegarlo dice a quién llamar', async () => {
    // Una lista de números de serie obliga a resolver cada sede a mano — el
    // trabajo que esta vista existe para evitar.
    servir({ proyectos: [HABILITADA], caidos: [CAIDO] });
    render(<Proyectos />, { wrapper: ConAuth });
    await waitFor(() => expect(screen.getByText('1 gateway sin reportar')).toBeInTheDocument());

    fireEvent.click(screen.getByText('1 gateway sin reportar'));

    expect(screen.getByText('Textiles del Sur')).toBeInTheDocument();
    expect(screen.getByText(/Planta Norte/)).toBeInTheDocument();
    expect(screen.getByText('GW-0042')).toBeInTheDocument();
  });

  test('distingue "nunca reportó" de "hace mucho"', async () => {
    // Uno se atiende revisando la instalación; el otro, yendo al sitio.
    servir({ proyectos: [HABILITADA], caidos: [NUNCA] });
    render(<Proyectos />, { wrapper: ConAuth });
    await waitFor(() => expect(screen.getByText('1 gateway sin reportar')).toBeInTheDocument());

    fireEvent.click(screen.getByText('1 gateway sin reportar'));

    expect(screen.getByText('nunca reportó')).toBeInTheDocument();
  });

  test('si falla, la pantalla de proyectos sigue sirviendo', async () => {
    // Es un aviso extra, no el contenido. Un error acá taparía la lista que
    // sí cargó.
    servir({ proyectos: [HABILITADA], fallaCaidos: true });

    render(<Proyectos />, { wrapper: ConAuth });

    await waitFor(() => expect(screen.getByText('Industrias Andinas')).toBeInTheDocument());
  });
});

describe('el aviso de que se está mirando otra empresa', () => {
  test('aparece mientras se suplanta', async () => {
    servir({ proyectos: [], identidad: identidadSuplantando });
    setRefreshToken('r'); // dispara el bootstrap del contexto

    render(<ImpersonationBanner />, { wrapper: ConAuth });

    await waitFor(() =>
      expect(screen.getByText(/Estás viendo los datos de otra empresa/)).toBeInTheDocument(),
    );
  });

  test('no aparece para un cliente común', async () => {
    // Un cliente ve su propio consumo: avisarle de una suplantación que no
    // existe sería alarmar sin motivo.
    servir({ proyectos: [], identidad: identidadCliente });
    setRefreshToken('r');

    render(<ImpersonationBanner />, { wrapper: ConAuth });

    await waitFor(() => expect(pedidos).toContain('GET /auth-monitor/me'));
    expect(screen.queryByText(/Estás viendo los datos de otra empresa/)).toBeNull();
  });

  test('ofrece volver, y volver pide el token de vuelta', async () => {
    servir({ proyectos: [], identidad: identidadSuplantando });
    setRefreshToken('r');
    render(<ImpersonationBanner />, { wrapper: ConAuth });
    await waitFor(() =>
      expect(screen.getByText(/Estás viendo los datos de otra empresa/)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText('Volver a proyectos'));

    await waitFor(() => expect(pedidos).toContain('DELETE /auth-monitor/impersonate'));
  });
});

// --- andamiaje ---------------------------------------------------------

function ConAuth({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/proyectos']}>
      <AuthProvider>
        {children}
        <Ubicacion />
      </AuthProvider>
    </MemoryRouter>
  );
}

/** Delata a dónde navegó el componente: renderizado suelto no se desmonta. */
function Ubicacion() {
  return <span data-testid="ubicacion">{useLocation().pathname}</span>;
}

const identidadCliente: UserInfo = {
  user_id: 'u1',
  email: 'cliente@empresa.com',
  client_id: 'c1',
  role: 'cliente',
  impersonated: false,
  must_change_password: false,
};

const identidadAdmin: UserInfo = {
  user_id: 'admin',
  email: 'admin@ems.com',
  client_id: null,
  role: 'admin',
  impersonated: false,
  must_change_password: false,
};

const identidadSuplantando: UserInfo = {
  user_id: 'admin',
  email: 'admin@ems.com',
  client_id: 'c2',
  role: 'admin',
  impersonated: true,
  must_change_password: false,
};

const CAIDO: GatewayCaido = {
  id: 'g1',
  numero_serie: 'GW-0042',
  uuid: 'u1',
  ultima_conexion: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  site_id: 's1',
  sitio: 'Planta Norte',
  client_id: 'c2',
  empresa: 'Textiles del Sur',
};

const NUNCA: GatewayCaido = {
  ...CAIDO,
  id: 'g2',
  numero_serie: 'GW-0099',
  ultima_conexion: null,
};

const adapterOriginal = crmClient.defaults.adapter;
let pedidos: string[] = [];

function servir(options: {
  proyectos: Proyecto[];
  identidad?: UserInfo;
  fallaLista?: boolean;
  caidos?: GatewayCaido[];
  fallaCaidos?: boolean;
}): void {
  setAccessToken('token-de-prueba');
  crmClient.defaults.adapter = (config) => {
    const ruta = `${(config.method ?? 'get').toUpperCase()} ${config.url}`;
    pedidos.push(ruta);

    const responder = (data: unknown, status = 200) =>
      Promise.resolve({ data, status, statusText: 'OK', headers: {}, config });

    if (config.url === '/fleet/summary') {
      if (options.fallaLista) return Promise.reject(new Error('sin red'));
      return responder({ items: options.proyectos, total: options.proyectos.length });
    }
    if (config.url === '/fleet/gateways-offline') {
      if (options.fallaCaidos) return Promise.reject(new Error('sin red'));
      const lista = options.caidos ?? [];
      return responder({ items: lista, total: lista.length });
    }
    if (config.url === '/auth-monitor/me') {
      return responder(options.identidad ?? identidadCliente);
    }
    // login, refresh, impersonate y su salida devuelven todos un par de tokens.
    return responder({
      access_token: 'a',
      refresh_token: 'r',
      token_type: 'bearer',
      expires_in: 900,
      client_id: options.identidad?.client_id ?? null,
      role: options.identidad?.role ?? 'cliente',
      must_change_password: false,
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
