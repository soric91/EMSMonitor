/**
 * Guard de código muerto en `src/api`.
 *
 * Cada función o constante que exporta el cliente HTTP tiene que ser
 * consumida por algún otro módulo del proyecto (src, tests, o un vecino de
 * api). Una exportación que nadie importa es código muerto: costó mantenerla
 * y, peor, su endpoint siguió vivo en el backend "por respetarla".
 *
 * F4.1 eliminó 10 así (getDashboard, getDashboardCards, getKpis,
 * getConsumption, getExport, getHistoryRange, getMaxDemand, getLoadFactor,
 * getBaseLoad, getRealtimeLatest) — 141 líneas menos. Este test hace que no
 * vuelvan.
 *
 * Ojo: es una red de seguridad, no la definición de "vivo". Enumerar acá cada
 * export la duplicaría y se desactualiza sola; leer el árbol de archivos es
 * la única verdad que no miente.
 */

import { describe, expect, test } from '@rstest/core';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(process.cwd(), 'src');
const API_DIR = join(SRC_DIR, 'api');

function archivosTs(dir: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) encontrados.push(...archivosTs(ruta));
    else if (/\.(ts|tsx)$/.test(entrada.name)) encontrados.push(ruta);
  }
  return encontrados;
}

/** Lo que un módulo de `src/api` expone como función o constante. */
function exportacionesFuncionales(ruta: string): string[] {
  const fuente = readFileSync(ruta, 'utf8');
  const nombres: string[] = [];
  for (const m of fuente.matchAll(/^export (?:async )?function (\w+)/gm)) nombres.push(m[1]);
  for (const m of fuente.matchAll(/^export const (\w+)/gm)) nombres.push(m[1]);
  return nombres;
}

/** Cuántos módulos fuera del que la define mencionan el nombre. */
function consumidores(nombre: string, definidoEn: string): number {
  const menciona = new RegExp(`\\b${nombre}\\b`);
  let contador = 0;
  for (const ruta of archivosTs(SRC_DIR)) {
    if (ruta === definidoEn) continue;
    if (menciona.test(readFileSync(ruta, 'utf8'))) contador += 1;
  }
  return contador;
}

describe('la superficie de src/api sin muertos', () => {
  test('cada export lo usa alguien', () => {
    const muertos: string[] = [];
    for (const ruta of archivosTs(API_DIR)) {
      for (const nombre of exportacionesFuncionales(ruta)) {
        if (consumidores(nombre, ruta) === 0) {
          muertos.push(`${nombre} (${ruta.replace(SRC_DIR + '/', '')})`);
        }
      }
    }

    expect(muertos).toEqual([]);
  });
});
