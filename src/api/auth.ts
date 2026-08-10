/**
 * Autenticación contra CRMBackend.
 *
 * ApiEMS ya no emite tokens. El CRM es el único que sabe qué clientes existen,
 * a qué empresa pertenece cada persona y si tiene permitido ver su consumo; el
 * token que firma se manda tal cual a ApiEMS, que lo verifica con la clave
 * pública del CRM.
 *
 * Las respuestas de acá NO vienen envueltas en `{success, data}` — eso es la
 * convención de ApiEMS. El CRM devuelve el objeto directo.
 */

import { MONITOR_PREFIX, crmClient } from './crmClient';
import type { LoginRequest, TokenPair, UserInfo } from './types';

export async function login(payload: LoginRequest): Promise<TokenPair> {
  const { data } = await crmClient.post<TokenPair>(`${MONITOR_PREFIX}/login`, payload);
  return data;
}

export async function refresh(refreshToken: string): Promise<TokenPair> {
  const { data } = await crmClient.post<TokenPair>(`${MONITOR_PREFIX}/refresh`, {
    refresh_token: refreshToken,
  });
  return data;
}

export async function me(accessToken: string): Promise<UserInfo> {
  const { data } = await crmClient.get<UserInfo>(`${MONITOR_PREFIX}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

/**
 * Cambia la contraseña propia y devuelve un par nuevo.
 *
 * El token viejo queda restringido al cambio de contraseña, así que el par que
 * devuelve esta llamada es el que de verdad abre el consumo — hay que
 * reemplazar el guardado, no conservarlo.
 */
export async function changePassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<TokenPair> {
  const { data } = await crmClient.post<TokenPair>(
    `${MONITOR_PREFIX}/password`,
    { current_password: currentPassword, new_password: newPassword },
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return data;
}

/**
 * Cerrar sesión es local.
 *
 * El CRM no tiene revocación de refresh tokens en esta superficie, así que no
 * hay a quién avisarle: se borran las credenciales del navegador y el token
 * que quedara suelto muere solo al vencer. Existe como función para que
 * `AuthContext` no tenga que saber eso.
 */
export function logout(): void {
  // Sin llamada de red a propósito. Ver el comentario de arriba.
}
