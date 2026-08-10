import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import { entrarAProyecto, salirDeProyecto } from '../api/proyectos';
import {
  clearSession,
  getAccessToken,
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
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** True mientras la contraseña siga siendo la que generó un administrador. */
  mustChangePassword: boolean;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /**
   * Un administrador que entró pero todavía no eligió empresa. Mientras sea
   * true no hay datos que pedir: el token no nombra ninguna.
   */
  necesitaElegirProyecto: boolean;
  /** Un administrador mirando los datos de otra empresa. */
  suplantando: boolean;
  /** Cambiar a los datos de una empresa. Pide un token nuevo, acotado a ella. */
  entrarA: (clientId: string) => Promise<void>;
  /** Volver a la lista de proyectos, descartando el token de la empresa. */
  salirDelProyecto: () => Promise<void>;
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
        setUser(await authApi.me(pair.access_token));
      } catch {
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };
    void bootstrap();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const pair = await authApi.login({ email, password });
      setAccessToken(pair.access_token);
      setRefreshToken(pair.refresh_token);
      // La identidad se relee del CRM en vez de armarse con lo que vino en el
      // login: es la misma fuente que decide todo lo demás, y así no hay dos
      // versiones de "quién sos" que puedan discrepar.
      setUser(await authApi.me(pair.access_token));
    } catch {
      clearSession();
      setError('Correo o contraseña incorrectos');
      throw new Error('login_failed');
    }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const stored = getAccessToken();
    if (!stored) throw new Error('no_session');

    // El CRM devuelve un par nuevo: el viejo seguía restringido al cambio de
    // contraseña, así que hay que reemplazarlo, no conservarlo.
    const pair = await authApi.changePassword(stored, currentPassword, newPassword);
    setAccessToken(pair.access_token);
    setRefreshToken(pair.refresh_token);
    setUser(await authApi.me(pair.access_token));
  }, []);

  const entrarA = useCallback(async (clientId: string) => {
    const stored = getAccessToken();
    if (!stored) throw new Error('no_session');

    const pair = await entrarAProyecto(stored, clientId);
    setAccessToken(pair.access_token);
    setRefreshToken(pair.refresh_token);
    setUser(await authApi.me(pair.access_token));
  }, []);

  const salirDelProyecto = useCallback(async () => {
    const stored = getAccessToken();
    if (!stored) throw new Error('no_session');

    // No es un refresh: el refresh conserva la empresa elegida, para que un
    // token vencido no eche al administrador de lo que está mirando.
    const pair = await salirDeProyecto(stored);
    setAccessToken(pair.access_token);
    setRefreshToken(pair.refresh_token);
    setUser(await authApi.me(pair.access_token));
  }, []);

  const logout = useCallback(async () => {
    // Local: el CRM no revoca refresh tokens en esta superficie, así que no
    // hay a quién avisarle. El que quede suelto muere al vencer.
    authApi.logout();
    clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        // Una sesión con la contraseña sin cambiar no cuenta como autenticada:
        // su token no abre el consumo ni acá ni en ApiEMS, así que tratarla
        // como válida solo produciría una pantalla vacía con errores.
        isAuthenticated: user !== null && !user.must_change_password,
        mustChangePassword: user?.must_change_password ?? false,
        // Un administrador sin empresa elegida. Se deduce del token, no del
        // rol: un administrador que ya eligió tiene `client_id` y entra al
        // tablero como cualquiera.
        necesitaElegirProyecto: user !== null && user.client_id === null,
        suplantando: user?.impersonated ?? false,
        entrarA,
        salirDelProyecto,
        isLoading,
        error,
        login,
        logout,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
