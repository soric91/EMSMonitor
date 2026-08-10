import { apiClient, unwrap } from './client';
import type { ApiResponse, HistoryDownsampleParams, HistoryParams, HistoryResponse } from './types';

export async function getHistory(params: HistoryParams): Promise<HistoryResponse> {
  const { data } = await apiClient.get<ApiResponse<HistoryResponse>>('/history', { params });
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
