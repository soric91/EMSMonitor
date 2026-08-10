import { apiClient, unwrap } from './client';
import type { ApiResponse, CostBreakdown, CostsRangeParams, Period } from './types';

export async function getCosts(period: Period, deviceId?: string): Promise<CostBreakdown> {
  const { data } = await apiClient.get<ApiResponse<CostBreakdown>>(`/costs/${period}`, {
    params: { device_id: deviceId },
  });
  return unwrap(data);
}

/** Rango libre UTC ISO, para Analytics o comparaciones. */
export async function getCostsRange(params: CostsRangeParams): Promise<CostBreakdown> {
  const { data } = await apiClient.get<ApiResponse<CostBreakdown>>('/costs/range', { params });
  return unwrap(data);
}
