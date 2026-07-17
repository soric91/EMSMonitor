import { apiClient, unwrap } from './client';
import type { AlertsData, AlertsParams, ApiResponse } from './types';

export async function getAlerts(params: AlertsParams = {}): Promise<AlertsData> {
  const { data } = await apiClient.get<ApiResponse<AlertsData>>('/alerts', { params });
  return unwrap(data);
}
