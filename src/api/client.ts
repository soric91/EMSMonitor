import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ApiError } from './errors';
import type { ApiResponse, TokenPair } from './types';
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

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new ApiError('No refresh token available');
  }
  const response = await axios.post<ApiResponse<TokenPair>>(
    `${baseURL}/api/v1/auth/refresh`,
    { refresh_token: refreshToken },
    { headers: NGROK_HEADERS },
  );
  const pair = response.data.data;
  if (!response.data.success || !pair) {
    throw new ApiError(response.data.message || 'Refresh failed');
  }
  setAccessToken(pair.access_token);
  setRefreshToken(pair.refresh_token);
  return pair.access_token;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    if (error.response?.status === 401 && config && !config._retried && !config.url?.includes('/auth/')) {
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
