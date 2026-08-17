import { apiClient, unwrap } from './client';
import type { ApiResponse, BillForecast, PowerForecast, PowerForecastParams } from './types';

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

/**
 * El consumo esperado hora a hora. Con `method: 'insufficient_history'` no hay
 * puntos: el backend prefiere callar antes que pronosticar sobre dos semanas
 * incompletas.
 */
export async function getPowerForecast(params: PowerForecastParams = {}): Promise<PowerForecast> {
  const { data } = await apiClient.get<ApiResponse<PowerForecast>>('/forecast/power', {
    params,
  });
  return unwrap(data);
}
