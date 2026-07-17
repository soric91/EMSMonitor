import { apiClient, unwrap } from './client';
import type { ApiResponse, TariffConfig } from './types';

export async function getTariff(): Promise<TariffConfig> {
  const { data } = await apiClient.get<ApiResponse<TariffConfig>>('/tariff');
  return unwrap(data);
}

/**
 * PUT reemplaza la configuración COMPLETA (no hace merge parcial).
 * Flujo obligatorio para no perder historial: getTariff() → editar en el
 * cliente → updateTariff(objeto completo). Nunca armar el PUT desde cero.
 */
export async function updateTariff(config: TariffConfig): Promise<TariffConfig> {
  const { data } = await apiClient.put<ApiResponse<TariffConfig>>('/tariff', config);
  return unwrap(data);
}
