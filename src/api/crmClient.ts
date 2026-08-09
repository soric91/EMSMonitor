/**
 * El cliente HTTP hacia CRMBackend, que es quien emite la identidad.
 *
 * Separado de `apiClient` a propósito, y no por gusto de tener dos:
 *
 * - Hablan con servicios distintos, en orígenes distintos.
 * - CRMBackend devuelve el objeto directo; ApiEMS lo envuelve en
 *   `{success, message, data}`. Compartir instancia obligaría a que cada
 *   llamada supiera cuál de las dos formas le toca.
 * - `apiClient` reintenta con refresh ante un 401. Este no puede: el refresh
 *   *vive acá*, y reintentarlo desde adentro sería un bucle.
 */

import axios from 'axios';

const crmBaseURL = import.meta.env.PUBLIC_CRM_BASE_URL;

export const crmClient = axios.create({
  baseURL: `${crmBaseURL}/api/v1`,
});

/**
 * La superficie del CRM para la web de clientes. Es exclusiva del rol
 * `cliente`: un operador del CRM no entra por acá, y su token lleva otra
 * audiencia que ApiEMS rechaza.
 */
export const MONITOR_PREFIX = '/auth-monitor';
