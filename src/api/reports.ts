import { apiClient, unwrap } from './client';
import type { FixedPeriod } from '../domain/periods';
import { toReportPath } from '../domain/periods';
import type { ApiResponse, CustomReportParams, ReportData } from './types';

export async function getReport(period: FixedPeriod, deviceId?: string): Promise<ReportData> {
  const { data } = await apiClient.get<ApiResponse<ReportData>>(toReportPath(period), {
    params: { device_id: deviceId },
  });
  return unwrap(data);
}

export async function getCustomReport(params: CustomReportParams): Promise<ReportData> {
  const { data } = await apiClient.get<ApiResponse<ReportData>>(toReportPath('custom'), {
    params,
  });
  return unwrap(data);
}
