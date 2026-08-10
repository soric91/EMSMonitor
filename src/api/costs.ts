import { apiClient, unwrap } from './client';
import type { FixedPeriod } from '../domain/periods';
import type { ApiResponse, CostBreakdown, CostsRangeParams } from './types';

export async function getCosts(period: FixedPeriod, deviceId?: string): Promise<CostBreakdown> {
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
