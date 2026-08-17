import { apiClient, unwrap } from './client';
import type {
  AnalyticsRangeParams,
  AnalyticsSummary,
  BaseLoadTrendResult,
  BaseloadTrendParams,
  ApiResponse,
  CompareParams,
  CompareResult,
  CoverageParams,
  CoverageResult,
  HeatmapParams,
  HeatmapResult,
  DayArchetypesParams,
  DayArchetypesResult,
  LoadDurationParams,
  LoadDurationResult,
  HourProfilePoint,
  ReactiveQuadrantsResult,
  SiteModeResult,
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

/**
 * Si la sede tiene generación propia o es de consumo puro. El panel lo usa
 * para no ofrecer exportación ni balance neto en una instalación que nunca va
 * a tener ninguno.
 */
export async function getSiteMode(params: AnalyticsRangeParams = {}): Promise<SiteModeResult> {
  const { data } = await apiClient.get<ApiResponse<SiteModeResult>>('/analytics/site-mode', {
    params,
  });
  return unwrap(data);
}

/** La cuadrícula hora x día del rango. Un `null` es una hora sin dato, no un cero. */
export async function getHeatmap(params: HeatmapParams = {}): Promise<HeatmapResult> {
  const { data } = await apiClient.get<ApiResponse<HeatmapResult>>('/analytics/heatmap', {
    params,
  });
  return unwrap(data);
}

/**
 * La carga base día a día, su tendencia y lo que cuesta al mes. El backend
 * decide la ventana (día completo o solo noche) según el modo de la sede.
 */
export async function getBaseloadTrend(
  params: BaseloadTrendParams = {},
): Promise<BaseLoadTrendResult> {
  const { data } = await apiClient.get<ApiResponse<BaseLoadTrendResult>>(
    '/analytics/baseload-trend',
    { params },
  );
  return unwrap(data);
}

/**
 * Los tipos de día de la instalación, agrupados por la forma de su consumo
 * horario. Cacheado 24 h en el backend: no cambian entre dos cargas.
 */
export async function getDayArchetypes(
  params: DayArchetypesParams = {},
): Promise<DayArchetypesResult> {
  const { data } = await apiClient.get<ApiResponse<DayArchetypesResult>>(
    '/analytics/day-archetypes',
    { params },
  );
  return unwrap(data);
}

/**
 * La curva de duración de carga del rango: la potencia importada ordenada de
 * mayor a menor contra el porcentaje del tiempo.
 */
export async function getLoadDuration(
  params: LoadDurationParams = {},
): Promise<LoadDurationResult> {
  const { data } = await apiClient.get<ApiResponse<LoadDurationResult>>(
    '/analytics/load-duration',
    { params },
  );
  return unwrap(data);
}

/** Qué porcentaje de las lecturas esperadas llegó, ventana por ventana. */
export async function getCoverage(params: CoverageParams = {}): Promise<CoverageResult> {
  const { data } = await apiClient.get<ApiResponse<CoverageResult>>('/analytics/coverage', {
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
