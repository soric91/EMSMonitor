// Access token vive solo en memoria (se pierde al recargar, se recupera vía refresh).
// Refresh token se persiste en localStorage para sobrevivir recargas de página.

const REFRESH_TOKEN_KEY = 'ems_refresh_token';

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string | null): void {
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function clearSession(): void {
  accessToken = null;
  setRefreshToken(null);
}
