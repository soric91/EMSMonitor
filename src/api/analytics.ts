import { apiClient, unwrap } from './client';
import type {
  AnalyticsOverview,
  AnalyticsRangeParams,
  ApiResponse,
  BaseLoadParams,
  BaseLoadResult,
  CompareParams,
  CompareResult,
  HourProfilePoint,
  LoadFactorResult,
  MaxDemandResult,
  WeekdayProfilePoint,
} from './types';

export async function getAnalyticsOverview(
  params: AnalyticsRangeParams = {},
): Promise<AnalyticsOverview> {
  const { data } = await apiClient.get<ApiResponse<AnalyticsOverview>>('/analytics', { params });
  return unwrap(data);
}

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

export async function getMaxDemand(
  params: AnalyticsRangeParams = {},
): Promise<MaxDemandResult> {
  const { data } = await apiClient.get<ApiResponse<MaxDemandResult>>('/analytics/max-demand', {
    params,
  });
  return unwrap(data);
}

export async function getLoadFactor(
  params: AnalyticsRangeParams = {},
): Promise<LoadFactorResult> {
  const { data } = await apiClient.get<ApiResponse<LoadFactorResult>>('/analytics/load-factor', {
    params,
  });
  return unwrap(data);
}

export async function getBaseLoad(params: BaseLoadParams = {}): Promise<BaseLoadResult> {
  const { data } = await apiClient.get<ApiResponse<BaseLoadResult>>('/analytics/base-load', {
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
