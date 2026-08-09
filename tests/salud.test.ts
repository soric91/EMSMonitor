/**
 * El semáforo de configuración.
 *
 * Responde "¿por qué este proyecto no está midiendo?" sin abrirlo. Antes eso
 * se descubría entrando y viendo un tablero en cero, que es indistinguible de
 * un medidor apagado.
 */

import { describe, expect, test } from '@rstest/core';
import { desdeUltimaConexion, diagnosticar, porUrgencia } from '../src/domain/salud';
import type { Proyecto } from '../src/api/types';

/** Una instalación completa y sana. Cada test rompe un eslabón. */
function sano(over: Partial<Proyecto> = {}): Proyecto {
  return {
    id: 'c1',
    nombre_empresa: 'Empresa',
    estado: 'activo',
    puede_ver_consumo: true,
    sedes: 1,
    gateways: 2,
    gateways_en_linea: 2,
    equipos: 3,
    variables: 8,
    ultima_conexion: new Date().toISOString(),
    ...over,
  };
}

describe('qué falta para que mida', () => {
  test('todo completo y conectado está operando', () => {
    expect(diagnosticar(sano())).toEqual({ nivel: 'ok', mensaje: 'Operando' });
  });

  test('sin sedes', () => {
    const d = diagnosticar(sano({ sedes: 0, gateways: 0, equipos: 0, variables: 0 }));

    expect(d.nivel).toBe('incompleto');
    expect(d.mensaje).toBe('Sin sedes cargadas');
  });

  test('sin gateway', () => {
    const d = diagnosticar(sano({ gateways: 0, gateways_en_linea: 0, equipos: 0, variables: 0 }));

    expect(d.mensaje).toBe('Sin gateway instalado');
  });

  test('sin medidores', () => {
    expect(diagnosticar(sano({ equipos: 0, variables: 0 })).mensaje).toBe('Sin medidores');
  });

  test('medidores sin variables: el caso silencioso', () => {
    // Todo el hardware está instalado y no mide nada. Es el que más se parece
    // a "funciona" desde afuera.
    const d = diagnosticar(sano({ variables: 0 }));

    expect(d.nivel).toBe('incompleto');
    expect(d.mensaje).toBe('Medidores sin variables');
  });
});

describe('el orden de los avisos', () => {
  test('se reporta lo primero que falta, no lo más grave', () => {
    // Una empresa sin nada cargado tiene todos sus gateways "sin conexión",
    // porque no tiene ninguno. Decirle eso la manda a revisar una antena que
    // no existe: lo que falta es cargar la sede.
    const vacia = sano({
      sedes: 0,
      gateways: 0,
      gateways_en_linea: 0,
      equipos: 0,
      variables: 0,
      ultima_conexion: null,
    });

    expect(diagnosticar(vacia).mensaje).toBe('Sin sedes cargadas');
  });
});

describe('conexión de los gateways', () => {
  test('ninguno reportando', () => {
    const d = diagnosticar(sano({ gateways_en_linea: 0 }));

    expect(d.nivel).toBe('atencion');
    expect(d.mensaje).toBe('Sin conexión');
  });

  test('algunos caídos dice cuántos', () => {
    // Un proyecto que anda a medias: lo que importa es cuántos faltan, no que
    // "hay conexión".
    expect(diagnosticar(sano({ gateways: 3, gateways_en_linea: 2 })).mensaje).toBe(
      '1 gateway sin conexión',
    );
    expect(diagnosticar(sano({ gateways: 5, gateways_en_linea: 2 })).mensaje).toBe(
      '3 gateways sin conexión',
    );
  });

  test('estar a medias no es lo mismo que estar incompleto', () => {
    // Un gateway caído se arregla yendo al sitio; una variable sin cargar, en
    // el CRM. Son dos trabajos distintos y no deberían verse igual.
    expect(diagnosticar(sano({ gateways_en_linea: 1, gateways: 2 })).nivel).toBe('atencion');
    expect(diagnosticar(sano({ variables: 0 })).nivel).toBe('incompleto');
  });
});

describe('el orden de la lista', () => {
  test('primero lo incompleto, después lo caído, al final lo que anda', () => {
    const ok = sano({ nombre_empresa: 'Anda bien' });
    const caido = sano({ nombre_empresa: 'Caido', gateways_en_linea: 0 });
    const roto = sano({ nombre_empresa: 'Roto', variables: 0 });

    const ordenados = [ok, caido, roto].sort(porUrgencia);

    expect(ordenados.map((p) => p.nombre_empresa)).toEqual(['Roto', 'Caido', 'Anda bien']);
  });

  test('empate se desempata alfabético, para que no cambie entre recargas', () => {
    const b = sano({ id: 'b', nombre_empresa: 'Beta' });
    const a = sano({ id: 'a', nombre_empresa: 'Alfa' });

    expect([b, a].sort(porUrgencia).map((p) => p.nombre_empresa)).toEqual(['Alfa', 'Beta']);
  });
});

describe('hace cuánto que no se conecta', () => {
  const AHORA = Date.parse('2026-08-07T12:00:00Z');
  const hace = (ms: number) => new Date(AHORA - ms).toISOString();

  test('nunca conectado no es "hace mucho"', () => {
    // La instalación no arrancó todavía. "hace 56 años" sería absurdo.
    expect(desdeUltimaConexion(null, AHORA)).toBeNull();
  });

  test('escalas', () => {
    expect(desdeUltimaConexion(hace(30_000), AHORA)).toBe('recién');
    expect(desdeUltimaConexion(hace(5 * 60_000), AHORA)).toBe('hace 5 min');
    expect(desdeUltimaConexion(hace(3 * 3_600_000), AHORA)).toBe('hace 3 h');
    expect(desdeUltimaConexion(hace(2 * 86_400_000), AHORA)).toBe('hace 2 d');
  });
});
