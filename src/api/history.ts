import { apiClient, unwrap } from './client';
import type {
  ApiResponse,
  HistoryDownsampleParams,
  HistoryParams,
  HistoryRangeParams,
  HistoryResponse,
  RangeSummary,
} from './types';

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

export async function getHistoryRange(params: HistoryRangeParams): Promise<RangeSummary> {
  const { data } = await apiClient.get<ApiResponse<RangeSummary>>('/history/range', { params });
  return unwrap(data);
}
