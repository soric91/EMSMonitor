import { apiClient, unwrap } from './client';
import type {
  ApiResponse,
  HistoryDownsampleParams,
  HistoryParams,
  HistoryResponse,
  HistoryStats,
  HistoryStatsParams,
} from './types';

export async function getHistory(params: HistoryParams): Promise<HistoryResponse> {
  const { data } = await apiClient.get<ApiResponse<HistoryResponse>>('/history', { params });
  return unwrap(data);
}

/**
 * Mínimo, máximo, promedio y último valor del rango, reducidos sobre los datos
 * crudos. Solo para variables instantáneas: con un contador acumulativo el
 * backend devuelve 400 (esos solo admiten difference()/last()).
 */
export async function getHistoryStats(params: HistoryStatsParams): Promise<HistoryStats> {
  const { data } = await apiClient.get<ApiResponse<HistoryStats>>('/history/stats', { params });
  return unwrap(data);
}

export async function getHistoryDownsample(
  params: HistoryDownsampleParams,
): Promise<HistoryResponse> {
  const { data } = await apiClient.get<ApiResponse<HistoryResponse>>('/history/downsample', {
    params,
  });
  return unwrap(data);
}
