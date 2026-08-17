import { apiClient, unwrap } from './client';
import type { ApiResponse, BillForecast } from './types';

/**
 * Cuánto va del mes y en cuánto termina al ritmo actual.
 *
 * Ojo con `method`: en `insufficient_history` los campos proyectados vienen en
 * `null` y no hay nada que dibujar — el backend prefiere callar antes que
 * proyectar sobre tres días de historial.
 */
export async function getBillForecast(params: { device_id?: string } = {}): Promise<BillForecast> {
  const { data } = await apiClient.get<ApiResponse<BillForecast>>('/forecast/bill', { params });
  return unwrap(data);
}
