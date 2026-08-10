import { apiClient, unwrap } from './client';
import type { ApiResponse, DeviceDisponible } from './types';

/**
 * Los medidores que este cliente tiene dados de alta.
 *
 * Es el inventario del CRM, no lo que haya publicado últimamente: incluye los
 * de un gateway caído, que existen y tienen histórico guardado.
 */
export async function listDevices(): Promise<DeviceDisponible[]> {
  const { data } = await apiClient.get<ApiResponse<DeviceDisponible[]>>('/devices');
  return unwrap(data);
}
