import { apiClient, unwrap } from './client';
import type { AnalyticsRangeParams, ApiResponse, KpiSummary } from './types';

export async function getKpis(params: AnalyticsRangeParams = {}): Promise<KpiSummary> {
  const { data } = await apiClient.get<ApiResponse<KpiSummary>>('/kpis', { params });
  return unwrap(data);
}
