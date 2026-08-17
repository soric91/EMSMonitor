import { apiClient, unwrap } from './client';
import type {
  AlertsData,
  AlertsHistory,
  AlertsHistoryParams,
  AlertsParams,
  ApiResponse,
} from './types';

export async function getAlerts(params: AlertsParams = {}): Promise<AlertsData> {
  const { data } = await apiClient.get<ApiResponse<AlertsData>>('/alerts', { params });
  return unwrap(data);
}

/**
 * Qué días se salieron de lo normal y desde cuándo cambió el nivel de consumo.
 *
 * Se recalcula en el backend sobre los datos guardados —no hay tabla de
 * eventos—, así que la respuesta es la misma hoy que dentro de un mes. Sin
 * from/to, los últimos 30 días completos.
 */
export async function getAlertsHistory(params: AlertsHistoryParams = {}): Promise<AlertsHistory> {
  const { data } = await apiClient.get<ApiResponse<AlertsHistory>>('/alerts/history', {
    params,
  });
  return unwrap(data);
}
