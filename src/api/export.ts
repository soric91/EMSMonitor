import { apiClient, unwrap } from './client';
import type { ApiResponse, EnergySummary, Period } from './types';

export async function getExport(period: Period, deviceId?: string): Promise<EnergySummary> {
  const { data } = await apiClient.get<ApiResponse<EnergySummary>>(`/export/${period}`, {
    params: { device_id: deviceId },
  });
  return unwrap(data);
}
