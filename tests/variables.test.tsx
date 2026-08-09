/**
 * Qué se ofrece graficar.
 *
 * El valor de estos tests es negativo: comprueban sobre todo lo que **no**
 * aparece. Una fase que el medidor no reporta, una frecuencia que no llega,
 * un contador acumulado que como serie en vivo es una recta. Antes todo eso
 * se dibujaba igual, vacío, porque la lista de variables estaba escrita a
 * mano en el panel.
 */

import { useEffect } from 'react';
import { afterAll, afterEach, describe, expect, test } from '@rstest/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { apiClient } from '../src/api/client';
import { VariablesProvider } from '../src/context/VariablesContext';
import { useVariables } from '../src/hooks/useVariables';
import { useVariablesDelMedidor } from '../src/hooks/useVariablesDelMedidor';
import { useDevice } from '../src/hooks/useDevice';
import { DeviceProvider } from '../src/context/DeviceContext';
import { colorModeFor, esGraficableEnVivo, ordenarMagnitudes } from '../src/types/variable';
import type { Magnitud, VariableDisponible } from '../src/api/types';

function medicion(over: Partial<VariableDisponible> & { nombre: string }): VariableDisponible {
  return {
    etiqueta: over.nombre,
    unidad: 'V',
    magnitud: 'tension',
    fase: 'A',
    acumulativa: false,
    equipos: ['eq-1'],
    con_datos: true,
    ...over,
  };
}

describe('agrupar por magnitud', () => {
  test('solo entran las fases que el medidor reporta', async () => {
    // Un trifásico al que se le cayó la fase C.
    servir([
      medicion({ nombre: 'PhV_phsA', fase: 'A' }),
      medicion({ nombre: 'PhV_phsB', fase: 'B' }),
    ]);

    const grupo = await grupoDe('tension');

    expect(grupo.map((v) => v.nombre)).toEqual(['PhV_phsA', 'PhV_phsB']);
    expect(grupo.map((v) => v.fase)).not.toContain('C');
  });

  test('las fases salen en orden A, B, C aunque lleguen desordenadas', async () => {
    servir([
      medicion({ nombre: 'PhV_phsC', fase: 'C' }),
      medicion({ nombre: 'PhV_phsA', fase: 'A' }),
      medicion({ nombre: 'PhV_phsB', fase: 'B' }),
    ]);

    const grupo = await grupoDe('tension');

    expect(grupo.map((v) => v.fase)).toEqual(['A', 'B', 'C']);
  });

  test('la fase C se agrupa con las otras, no queda suelta', async () => {
    // La regresión concreta: el panel tenía las pestañas fijas en A y B, así
    // que la C caía al desplegable de "más variables" por descarte.
    servir([
      medicion({ nombre: 'PhV_phsA', fase: 'A' }),
      medicion({ nombre: 'PhV_phsB', fase: 'B' }),
      medicion({ nombre: 'PhV_phsC', fase: 'C' }),
    ]);

    const grupo = await grupoDe('tension');

    expect(grupo).toHaveLength(3);
  });

  test('una magnitud que no llega no genera grupo', async () => {
    servir([medicion({ nombre: 'PhV_phsA' })]);

    const { porMagnitud } = await leer();

    expect(porMagnitud.has('frecuencia')).toBe(false);
    expect(porMagnitud.has('corriente')).toBe(false);
  });

  test('una variable sin clasificar no rompe el agrupado', async () => {
    // Filas anteriores al catálogo: existen, pero no se sabe qué miden.
    servir([
      medicion({ nombre: 'PhV_phsA' }),
      medicion({ nombre: 'Voltaje_A', magnitud: null, fase: null }),
    ]);

    const { porMagnitud, porNombre } = await leer();

    expect(porMagnitud.get('tension')).toHaveLength(1);
    expect(porNombre.has('Voltaje_A')).toBe(true); // sigue siendo consultable
  });
});

describe('declarada en el CRM no es lo mismo que con datos', () => {
  test('una variable que nunca reportó no se grafica', async () => {
    servir([
      medicion({ nombre: 'PhV_phsA' }),
      medicion({ nombre: 'PhV_phsB', fase: 'B', con_datos: false }),
    ]);

    const { variables } = await leer();

    expect(variables.map((v) => v.nombre)).toEqual(['PhV_phsA']);
  });

  test('pero sí se cuenta como declarada', async () => {
    // De acá sale la diferencia entre "falta configurar el CRM" y "el CRM
    // está bien y no está llegando nada". Contar solo las graficables las
    // volvía a mezclar, que es el bug que este campo vino a resolver.
    servir([
      medicion({ nombre: 'PhV_phsA', con_datos: false }),
      medicion({ nombre: 'PhV_phsB', fase: 'B', con_datos: false }),
    ]);

    const { variables, declaradas } = await leer();

    expect(variables).toHaveLength(0);
    expect(declaradas).toBe(2);
  });

  test('sin nada cargado en el CRM, declaradas es cero', async () => {
    servir([]);

    const { variables, declaradas } = await leer();

    expect(variables).toHaveLength(0);
    expect(declaradas).toBe(0);
  });
});

describe('qué se grafica en vivo', () => {
  test('un contador acumulado no', () => {
    // Crece monótono: la serie es una recta y el consumo real ya se muestra
    // como diferencias en Consumo.
    expect(esGraficableEnVivo(medicion({ nombre: 'TotWh_import', acumulativa: true }))).toBe(false);
  });

  test('una instantánea sí', () => {
    expect(esGraficableEnVivo(medicion({ nombre: 'TotW' }))).toBe(true);
  });

  test('un estado digital tampoco', () => {
    expect(esGraficableEnVivo(medicion({ nombre: 'Ind01', magnitud: 'estado_digital' }))).toBe(
      false,
    );
  });
});

describe('el color sale de la magnitud', () => {
  test('la potencia activa es bidireccional', () => {
    // Su color depende del signo del valor, no de la magnitud sola.
    expect(colorModeFor('potencia_activa')).toBe('power');
  });

  test('importada y exportada no comparten color', () => {
    expect(colorModeFor('energia_importada')).toBe('import');
    expect(colorModeFor('energia_exportada')).toBe('export');
  });

  test('una magnitud desconocida cae a neutro en vez de romper', () => {
    expect(colorModeFor(null)).toBe('neutral');
  });
});

describe('el orden de las pestañas', () => {
  test('primero lo que se mira todo el día', () => {
    const ordenadas = ordenarMagnitudes(['frecuencia', 'corriente', 'potencia_activa', 'tension']);

    expect(ordenadas).toEqual(['potencia_activa', 'tension', 'corriente', 'frecuencia']);
  });

  test('una magnitud fuera de la lista se muestra igual, al final', () => {
    // El catálogo puede crecer sin tocar el panel. Omitirla sería peor que
    // ponerla en un orden discutible.
    const ordenadas = ordenarMagnitudes(['estado_digital', 'tension']);

    expect(ordenadas).toEqual(['tension', 'estado_digital']);
  });
});

// --- andamiaje ---------------------------------------------------------

// Se sustituye el adapter de axios y no `fetch`: el cliente real corre entero
// —interceptores, baseURL, `unwrap`— y lo único falseado es la red. Un doble
// del módulo `api/variables` dejaría todo eso sin ejercitar.
const adapterOriginal = apiClient.defaults.adapter;
let servidas: VariableDisponible[] = [];

function servir(variables: VariableDisponible[]): void {
  servidas = variables;
  apiClient.defaults.adapter = (config) => {
    // Las dos rutas devuelven cosas distintas: servir lo mismo a ambas dejaba
    // al inventario con objetos que no son equipos, y el medidor elegido
    // terminaba en `undefined`.
    const data = config.url === '/devices' ? inventario : servidas;
    return Promise.resolve({
      data: { success: true, message: '', data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
}

/** El inventario que ve el contexto de equipos. Vacío = ninguno elegido. */
let inventario: unknown[] = [];

function conEquipos(...ids: string[]): void {
  inventario = ids.map((id, i) => ({
    device_id: id,
    nombre: id,
    modbus_id: 10 + i,
    sede_id: 's1',
    sede: 'Planta',
    gateway_id: 'g1',
    gateway: 'GW-0001',
    gateway_en_linea: true,
  }));
}

afterEach(() => {
  // Sin esto los árboles montados se acumulan entre tests y una consulta
  // global encuentra los de corridas anteriores.
  cleanup();
  servidas = [];
  inventario = [];
});

afterAll(() => {
  apiClient.defaults.adapter = adapterOriginal;
});

type Leido = ReturnType<typeof useVariables>;

async function leer(): Promise<Leido> {
  let capturado: Leido | null = null;

  function Sonda() {
    capturado = useVariables();
    return <span data-testid="listo">{capturado.cargando ? 'cargando' : 'listo'}</span>;
  }

  render(
    <VariablesProvider>
      <Sonda />
    </VariablesProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('listo')).toHaveTextContent('listo'));
  return capturado!;
}

async function grupoDe(magnitud: Magnitud): Promise<VariableDisponible[]> {
  const { porMagnitud } = await leer();
  return porMagnitud.get(magnitud) ?? [];
}

describe('las variables del medidor elegido', () => {
  test('sin inventario todavía se ven todas', async () => {
    // Mientras `/devices` no responde no hay medidor elegido, y filtrar por
    // algo que aún no se sabe escondería variables que sí corresponden.
    servir([
      medicion({ nombre: 'PhV_phsA', equipos: ['eq-1'] }),
      medicion({ nombre: 'Hz', magnitud: 'frecuencia', fase: 'total', equipos: ['eq-2'] }),
    ]);

    const { variables } = await leerDelMedidor(null);

    expect(variables.map((v) => v.nombre)).toEqual(['PhV_phsA', 'Hz']);
  });

  test('elegido uno, no se ofrecen las que ese medidor no mide', async () => {
    // El mismo error que la fase C de un monofásico, un nivel más arriba:
    // `/variables` devuelve la unión de toda la empresa. Ofrecer frecuencia
    // para un medidor que no la reporta da una gráfica vacía para siempre.
    servir([
      medicion({ nombre: 'PhV_phsA', equipos: ['eq-1'] }),
      medicion({ nombre: 'Hz', magnitud: 'frecuencia', fase: 'total', equipos: ['eq-2'] }),
    ]);

    const { variables, porMagnitud } = await leerDelMedidor('eq-1');

    expect(variables.map((v) => v.nombre)).toEqual(['PhV_phsA']);
    expect(porMagnitud.has('frecuencia')).toBe(false);
  });

  test('una variable que miden dos medidores se ve en los dos', async () => {
    servir([medicion({ nombre: 'PhV_phsA', equipos: ['eq-1', 'eq-2'] })]);

    expect((await leerDelMedidor('eq-1')).variables).toHaveLength(1);
    expect((await leerDelMedidor('eq-2')).variables).toHaveLength(1);
  });
});

type LeidoDelMedidor = ReturnType<typeof useVariablesDelMedidor>;

async function leerDelMedidor(deviceId: string | null): Promise<LeidoDelMedidor> {
  let capturado: LeidoDelMedidor | null = null;

  function Sonda() {
    const { setSelectedDeviceId } = useDevice();
    capturado = useVariablesDelMedidor();
    const { cargando } = capturado;
    useEffect(() => {
      if (deviceId !== null) setSelectedDeviceId(deviceId);
    }, [setSelectedDeviceId]);
    return <span data-testid="listo">{cargando ? 'cargando' : 'listo'}</span>;
  }

  if (deviceId !== null) conEquipos(deviceId);

  // Se consulta dentro del contenedor: las consultas que devuelve `render`
  // están ligadas a `document.body`, así que un test que lee dos veces
  // encontraría los dos árboles montados y no sabría cuál es cuál.
  const { container } = render(
    <VariablesProvider>
      <DeviceProvider>
        <Sonda />
      </DeviceProvider>
    </VariablesProvider>,
  );
  await waitFor(() =>
    expect(within(container).getByTestId('listo')).toHaveTextContent('listo'),
  );
  await waitFor(() =>
    expect(capturado!.variables.length > 0 || deviceId === null).toBe(true),
  );
  return capturado!;
}
