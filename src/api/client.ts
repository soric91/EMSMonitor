import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import * as authApi from './auth';
import { ApiError } from './errors';
import type { ApiResponse } from './types';
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from './tokenStore';

const baseURL = import.meta.env.PUBLIC_API_BASE_URL;

// El plan gratis de ngrok intercepta la primera petición del navegador con una
// página HTML de advertencia (axios recibiría HTML en vez de JSON). Este header
// la desactiva; solo se envía cuando el backend está detrás de ngrok.
const NGROK_HEADERS: Record<string, string> = /\.ngrok(-free)?\.(app|io|dev)/.test(baseURL)
  ? { 'ngrok-skip-browser-warning': 'true' }
  : {};

export const apiClient = axios.create({
  baseURL: `${baseURL}/api/v1`,
  headers: NGROK_HEADERS,
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

let refreshPromise: Promise<string> | null = null;

/**
 * Renueva contra CRMBackend, no contra ApiEMS.
 *
 * ApiEMS ya no emite tokens: los verifica. Un 401 suyo significa que el token
 * del CRM venció o fue revocado, y el único que puede dar uno nuevo es quien
 * lo firmó.
 */
async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new ApiError('No refresh token available');
  }
  const pair = await authApi.refresh(refreshToken);
  setAccessToken(pair.access_token);
  setRefreshToken(pair.refresh_token);
  return pair.access_token;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    if (
      error.response?.status === 401 &&
      config &&
      !config._retried &&
      !config.url?.includes('/auth/')
    ) {
      config._retried = true;
      try {
        refreshPromise ??= refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
        const newToken = await refreshPromise;
        config.headers.set('Authorization', `Bearer ${newToken}`);
        return apiClient(config);
      } catch {
        clearSession();
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success || response.data === null) {
    throw new ApiError(response.message || 'Request failed', undefined, response);
  }
  return response.data;
}

export function unwrapVoid(response: ApiResponse<unknown>): void {
  if (!response.success) {
    throw new ApiError(response.message || 'Request failed', undefined, response);
  }
}
