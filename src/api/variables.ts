import { apiClient, unwrap } from './client';
import type { ApiResponse, VariableDisponible } from './types';

/**
 * Las mediciones que este cliente puede graficar ahora mismo.
 *
 * El backend cruza dos cosas: qué variables tiene dadas de alta en el CRM y
 * cuáles reportaron lecturas. Solo devuelve las que cumplen ambas, así que
 * todo lo que llega acá se puede dibujar — no hay que filtrar después ni
 * mostrar tarjetas vacías esperando datos que no van a venir.
 */
export async function listVariables(): Promise<VariableDisponible[]> {
  const { data } = await apiClient.get<ApiResponse<VariableDisponible[]>>('/variables');
  return unwrap(data);
}
