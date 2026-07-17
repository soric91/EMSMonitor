import { apiClient, unwrap } from './client';
import type { ApiResponse, DeviceSnapshot } from './types';

export async function getRealtimeLatest(): Promise<DeviceSnapshot[]> {
  const { data } = await apiClient.get<ApiResponse<DeviceSnapshot[]>>('/realtime/latest');
  return unwrap(data);
}

export async function getRealtimeDevice(deviceId: string): Promise<DeviceSnapshot> {
  const { data } = await apiClient.get<ApiResponse<DeviceSnapshot>>('/realtime/device', {
    params: { device_id: deviceId },
  });
  return unwrap(data);
}
