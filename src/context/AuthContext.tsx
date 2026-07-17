import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import {
  clearSession,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '../api/tokenStore';
import type { UserInfo } from '../api/types';

interface AuthContextValue {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bootstrap = async () => {
      const storedRefreshToken = getRefreshToken();
      if (!storedRefreshToken) {
        setIsLoading(false);
        return;
      }
      try {
        const pair = await authApi.refresh(storedRefreshToken);
        setAccessToken(pair.access_token);
        setRefreshToken(pair.refresh_token);
        const info = await authApi.me();
        setUser(info);
      } catch {
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };
    void bootstrap();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    try {
      const pair = await authApi.login({ username, password });
      setAccessToken(pair.access_token);
      setRefreshToken(pair.refresh_token);
      const info = await authApi.me();
      setUser(info);
    } catch {
      clearSession();
      setError('Usuario o contraseña incorrectos');
      throw new Error('login_failed');
    }
  }, []);

  const logout = useCallback(async () => {
    const storedRefreshToken = getRefreshToken();
    try {
      await authApi.logout(storedRefreshToken);
    } catch {
      // sesión se limpia localmente igual, aunque el backend no responda
    }
    clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: user !== null, isLoading, error, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
