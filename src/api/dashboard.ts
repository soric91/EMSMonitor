import { apiClient, unwrap } from './client';
import type { ApiResponse, DashboardStatus, DashboardSummary } from './types';

export async function getDashboardStatus(): Promise<DashboardStatus> {
  const { data } = await apiClient.get<ApiResponse<DashboardStatus>>('/dashboard/status');
  return unwrap(data);
}

export async function getDashboardSummary(params: {
  device_id?: string;
}): Promise<DashboardSummary> {
  const { data } = await apiClient.get<ApiResponse<DashboardSummary>>('/dashboard/summary', {
    params,
  });
  return unwrap(data);
}
