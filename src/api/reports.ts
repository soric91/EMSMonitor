import { apiClient, unwrap } from './client';
import type { FixedPeriod } from '../domain/periods';
import { finDeRangoPedible, toReportPath } from '../domain/periods';
import type { ApiResponse, CustomReportParams, ReportData } from './types';

export async function getReport(period: FixedPeriod, deviceId?: string): Promise<ReportData> {
  const { data } = await apiClient.get<ApiResponse<ReportData>>(toReportPath(period), {
    params: { device_id: deviceId },
  });
  return unwrap(data);
}

export async function getCustomReport(params: CustomReportParams): Promise<ReportData> {
  const { data } = await apiClient.get<ApiResponse<ReportData>>(toReportPath('custom'), {
    // El ajuste va acá y no en cada pantalla: es el único punto por el que
    // pasan todos los reportes por fecha, y el bug que esquiva es del endpoint
    // (ver `finDeRangoPedible`).
    params: { ...params, to: finDeRangoPedible(params.to) },
  });
  return unwrap(data);
}
