import { apiClient, unwrap } from './client';
import type { ApiResponse, DashboardCard, DashboardData, DashboardStatus } from './types';

export async function getDashboard(deviceId?: string): Promise<DashboardData> {
  const { data } = await apiClient.get<ApiResponse<DashboardData>>('/dashboard', {
    params: { device_id: deviceId },
  });
  return unwrap(data);
}

export async function getDashboardCards(deviceId?: string): Promise<DashboardCard[]> {
  const { data } = await apiClient.get<ApiResponse<DashboardCard[]>>('/dashboard/cards', {
    params: { device_id: deviceId },
  });
  return unwrap(data);
}

export async function getDashboardStatus(): Promise<DashboardStatus> {
  const { data } = await apiClient.get<ApiResponse<DashboardStatus>>('/dashboard/status');
  return unwrap(data);
}
