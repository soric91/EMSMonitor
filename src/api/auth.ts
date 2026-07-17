import { apiClient, unwrap, unwrapVoid } from './client';
import type { ApiResponse, LoginRequest, TokenPair, UserInfo } from './types';

export async function login(payload: LoginRequest): Promise<TokenPair> {
  const { data } = await apiClient.post<ApiResponse<TokenPair>>('/auth/login', payload);
  return unwrap(data);
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  const { data } = await apiClient.post<ApiResponse<TokenPair>>('/auth/refresh', {
    refresh_token: refreshToken,
  });
  return unwrap(data);
}

export async function logout(refreshToken?: string | null): Promise<void> {
  const { data } = await apiClient.post<ApiResponse<null>>('/auth/logout', {
    refresh_token: refreshToken ?? null,
  });
  unwrapVoid(data);
}

export async function me(): Promise<UserInfo> {
  const { data } = await apiClient.get<ApiResponse<UserInfo>>('/auth/me');
  return unwrap(data);
}
