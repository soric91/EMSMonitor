import { apiClient, unwrap } from './client';
import type {
  AnalyticsRangeParams,
  AnalyticsSummary,
  ApiResponse,
  CompareParams,
  CompareResult,
  HourProfilePoint,
  ReactiveQuadrantsResult,
  WeekdayProfilePoint,
} from './types';

export async function getDailyProfile(
  params: AnalyticsRangeParams = {},
): Promise<HourProfilePoint[]> {
  const { data } = await apiClient.get<ApiResponse<HourProfilePoint[]>>(
    '/analytics/daily-profile',
    { params },
  );
  return unwrap(data);
}

export async function getMonthlyProfile(
  params: AnalyticsRangeParams = {},
): Promise<WeekdayProfilePoint[]> {
  const { data } = await apiClient.get<ApiResponse<WeekdayProfilePoint[]>>(
    '/analytics/monthly-profile',
    { params },
  );
  return unwrap(data);
}

/**
 * Resumen general. Ojo: sin from/to el default del backend son los ÚLTIMOS 30 DÍAS
 * (no "hoy" como el resto de /analytics/*) — la hora pico necesita semanas de muestras.
 */
export async function getAnalyticsSummary(
  params: AnalyticsRangeParams = {},
): Promise<AnalyticsSummary> {
  const { data } = await apiClient.get<ApiResponse<AnalyticsSummary>>('/analytics/summary', {
    params,
  });
  return unwrap(data);
}

export async function compare(params: CompareParams): Promise<CompareResult> {
  const { data } = await apiClient.get<ApiResponse<CompareResult>>('/analytics/compare', {
    params,
  });
  return unwrap(data);
}

export async function getReactiveQuadrants(
  params: AnalyticsRangeParams = {},
): Promise<ReactiveQuadrantsResult> {
  const { data } = await apiClient.get<ApiResponse<ReactiveQuadrantsResult>>(
    '/analytics/reactive-quadrants',
    { params },
  );
  return unwrap(data);
}

/**
 * Descarga el CSV de puntos crudos (1 Hz) de los cuadrantes reactivos.
 *
 * El backend lo sirve con streaming (el CSV se arma del Influx hacia la
 * descarga); acá el navegador recibe ese stream como Blob con
 * `responseType: 'blob'`, sin parsear nunca un JSON con miles de puntos. El
 * interceptor de `apiClient` renueva el token si hace falta, como en el resto.
 */
export async function downloadReactiveQuadrantsCsv(params: AnalyticsRangeParams): Promise<Blob> {
  const { data } = await apiClient.get<Blob>('/analytics/reactive-quadrants/csv', {
    params,
    responseType: 'blob',
  });
  return data;
}
