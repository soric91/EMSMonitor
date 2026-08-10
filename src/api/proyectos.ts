/**
 * Los proyectos que un administrador puede mirar, y cómo entrar a uno.
 *
 * Ambas cosas hablan con CRMBackend, no con ApiEMS: el CRM es quien sabe qué
 * empresas existen y quién firma la identidad. ApiEMS solo recibe el token ya
 * acotado y sirve datos.
 */

import { MONITOR_PREFIX, crmClient } from './crmClient';
import type { GatewayCaido, Proyecto, TokenPair } from './types';

interface Pagina<T> {
  items: T[];
  total: number;
}

/**
 * Las empresas visibles para quien llama, con sus conteos.
 *
 * `/fleet/summary` y no `/fleet`: los conteos se hacen en la base. Pedir el
 * árbol y contar acá transfiere el inventario completo de cada empresa —cada
 * registro Modbus de cada equipo— para dibujar "3 gateways".
 */
export async function listProyectos(accessToken: string): Promise<Proyecto[]> {
  const { data } = await crmClient.get<Pagina<Proyecto>>('/fleet/summary', {
    params: { limit: 200 },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data.items;
}

/**
 * Los gateways que dejaron de reportar, en toda la flota.
 *
 * Navegando por padre —cliente, sede, gateway— esto cuesta una petición por
 * nodo, así que en la práctica no se contesta nunca.
 */
export async function listGatewaysCaidos(accessToken: string): Promise<GatewayCaido[]> {
  const { data } = await crmClient.get<Pagina<GatewayCaido>>('/fleet/gateways-offline', {
    params: { limit: 200 },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data.items;
}

/**
 * Volver a la lista de proyectos.
 *
 * No es un refresh: el refresh conserva la empresa a propósito, para que un
 * token vencido no eche al administrador de lo que está mirando. Salir es una
 * decisión y se pide aparte.
 */
export async function salirDeProyecto(accessToken: string): Promise<TokenPair> {
  const { data } = await crmClient.delete<TokenPair>(`${MONITOR_PREFIX}/impersonate`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

/**
 * Cambiar a los datos de una empresa.
 *
 * Devuelve un par de tokens nuevo, acotado a esa empresa. Hay que reemplazar
 * el guardado: el anterior no abre ningún dato.
 */
export async function entrarAProyecto(accessToken: string, clientId: string): Promise<TokenPair> {
  const { data } = await crmClient.post<TokenPair>(
    `${MONITOR_PREFIX}/impersonate/${clientId}`,
    undefined,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return data;
}
