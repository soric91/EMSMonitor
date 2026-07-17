import { apiClient, unwrap } from './client';
import type { ApiResponse, CustomReportParams, ReportData, ReportType } from './types';

export async function getReport(
  type: Exclude<ReportType, 'custom'>,
  deviceId?: string,
): Promise<ReportData> {
  const { data } = await apiClient.get<ApiResponse<ReportData>>(`/reports/${type}`, {
    params: { device_id: deviceId },
  });
  return unwrap(data);
}

export async function getCustomReport(params: CustomReportParams): Promise<ReportData> {
  const { data } = await apiClient.get<ApiResponse<ReportData>>('/reports/custom', { params });
  return unwrap(data);
}
