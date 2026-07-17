// Tipos alineados 1:1 con /openapi.json del backend ApiEMS. No inventar campos.

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}

export type Variable =
  | 'CURRENT_A'
  | 'CURRENT_B'
  | 'VOLTAGE_A'
  | 'VOLTAGE_B'
  | 'POWER_ACTIVE_INST_A'
  | 'POWER_ACTIVE_INST_B'
  | 'POWER_ACTIVE_INST_TOTAL'
  | 'POWER_REACTIVE_INST_TOTAL'
  | 'FACTOR_POTENCIA_TOTAL'
  | 'POWER_ACTIVE_TOTAL_POS'
  | 'POWER_ACTIVE_TOTAL_NEG';

export type Aggregation = 'mean' | 'max' | 'min' | 'last';

export type Period = 'day' | 'week' | 'month' | 'year';

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

// ---------- Auth ----------

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface LogoutRequest {
  refresh_token?: string | null;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface UserInfo {
  username: string;
}

// ---------- Dashboard ----------

export interface DashboardData {
  device_id: string;
  power_active_total_w: number;
  voltage_a: number;
  voltage_b: number;
  current_a: number;
  current_b: number;
  power_factor: number;
  consumption_today_kwh: number;
  consumption_month_kwh: number;
  export_today_kwh: number;
  export_month_kwh: number;
  last_update: string;
}

export interface DashboardCard {
  key: string;
  label: string;
  value: number;
  unit: string;
}

export interface DashboardStatus {
  mqtt_connected: boolean;
  influx_connected: boolean;
  devices_online: number;
  devices_total: number;
  last_message_at: string | null;
}

// ---------- Realtime ----------

export interface DeviceSnapshot {
  device_id: string;
  device_name: string;
  device_type: string;
  identify_device: string;
  timestamp: string;
  received_at: string;
  data: Record<string, number>;
}

// ---------- History ----------

export interface TimeSeriesPoint {
  time: string;
  value: number;
}

export interface HistoryResponse {
  variable: Variable;
  device_id: string | null;
  aggregation: Aggregation;
  period_start: string;
  period_end: string;
  interval_seconds: number;
  points: TimeSeriesPoint[];
}

export interface RangeSummary {
  variable: Variable;
  device_id: string | null;
  period_start: string;
  period_end: string;
  mean: number | null;
  max: number | null;
  min: number | null;
  last: number | null;
  total_kwh: number | null;
}

export interface HistoryParams {
  variable: Variable;
  from: string;
  to: string;
  interval_seconds?: number;
  device_id?: string;
  aggregation?: Aggregation;
}

export interface HistoryDownsampleParams {
  variable: Variable;
  from: string;
  to: string;
  target_points?: number;
  device_id?: string;
  aggregation?: Aggregation;
}

export interface HistoryRangeParams {
  variable: Variable;
  from: string;
  to: string;
  device_id?: string;
}

// ---------- Consumption / Export ----------

export interface EnergyPoint {
  time: string;
  value: number;
}

export interface EnergySummary {
  period: Period;
  device_id: string | null;
  period_start: string;
  period_end: string;
  total_kwh: number;
  series: EnergyPoint[];
}

// ---------- Analytics ----------

export interface MaxDemandResult {
  period_start: string;
  period_end: string;
  device_id: string | null;
  peak_power_w: number | null;
  peak_at: string | null;
}

export interface LoadFactorResult {
  period_start: string;
  period_end: string;
  device_id: string | null;
  average_import_w: number | null;
  peak_import_w: number | null;
  load_factor: number | null;
}

export interface BaseLoadResult {
  period_start: string;
  period_end: string;
  device_id: string | null;
  percentile: number;
  base_load_w: number | null;
}

export interface AnalyticsOverview {
  period_start: string;
  period_end: string;
  device_id: string | null;
  consumption_kwh: number;
  export_kwh: number;
  max_demand: MaxDemandResult;
  load_factor: LoadFactorResult;
  base_load: BaseLoadResult;
}

export interface HourProfilePoint {
  hour: number;
  power_avg_w: number;
  power_max_w: number;
  power_min_w: number;
  sample_count: number;
}

export interface WeekdayProfilePoint {
  weekday: number;
  weekday_name: string;
  consumption_avg_kwh: number;
  export_avg_kwh: number;
}

export interface ComparePeriod {
  period_start: string;
  period_end: string;
  consumption_kwh: number;
  export_kwh: number;
  peak_import_w: number | null;
}

export interface CompareResult {
  device_id: string | null;
  period_a: ComparePeriod;
  period_b: ComparePeriod;
  consumption_delta_pct: number | null;
  export_delta_pct: number | null;
}

export interface AnalyticsRangeParams {
  from?: string;
  to?: string;
  device_id?: string;
}

export interface BaseLoadParams extends AnalyticsRangeParams {
  percentile?: number;
}

export interface CompareParams {
  from_a: string;
  to_a: string;
  from_b: string;
  to_b: string;
  device_id?: string;
}

// ---------- KPIs ----------

export interface KpiSummary {
  period_start: string;
  period_end: string;
  device_id: string | null;
  power_avg_w: number | null;
  power_max_w: number | null;
  voltage_avg_v: number | null;
  voltage_min_v: number | null;
  voltage_max_v: number | null;
  current_avg_a: number | null;
  power_factor_avg: number | null;
  consumption_daily_kwh: number;
  consumption_weekly_kwh: number;
  consumption_monthly_kwh: number;
  export_daily_kwh: number;
  export_monthly_kwh: number;
}

// ---------- Reports ----------

export interface ReportData {
  report_type: ReportType;
  device_id: string | null;
  period_start: string;
  period_end: string;
  consumption_kwh: number;
  export_kwh: number;
  net_balance_kwh: number;
  consumption_series: EnergyPoint[];
  export_series: EnergyPoint[];
  kpis: KpiSummary;
  max_demand: MaxDemandResult;
  load_factor: LoadFactorResult;
  base_load: BaseLoadResult;
  /** Desglose de costos del mismo periodo del reporte — sin llamada extra a /costs. */
  costs: CostBreakdown;
  generated_at: string;
}

export interface CustomReportParams {
  from: string;
  to: string;
  device_id?: string;
}

// ---------- Tariff / Costs ----------

export interface TariffPeriod {
  /** Mes calendario "YYYY-MM" (validado server-side). */
  month: string;
  cu_cop_kwh: number;
  cargo_fijo_cop: number;
}

export interface TariffConfig {
  excedente_cop_kwh: number;
  umbral_cs_kwh: number;
  periods: TariffPeriod[];
}

/** Ojo: NO son los mismos strings que ReportType ("daily"/"monthly"/…) — convención aparte. */
export type CostPeriod = Period | 'custom';

export interface CostPoint {
  time: string;
  consumption_kwh: number;
  export_kwh: number;
  consumption_cost_cop: number;
  export_credit_cop: number;
  net_cost_cop: number;
}

export interface CostBreakdown {
  period: CostPeriod;
  device_id: string | null;
  period_start: string;
  period_end: string;
  consumption_kwh: number;
  export_kwh: number;
  consumption_cost_cop: number;
  export_credit_cop: number;
  cargo_fijo_cop: number;
  /** Negativo = crédito por exportación superó el costo: saldo a favor del usuario. */
  net_cost_cop: number;
  /** false solo en day/week; en range y en costs de reportes siempre true. */
  cargo_fijo_included: boolean;
  months_used: string[];
  /** Meses sin tarifa registrada: el backend estimó con la más reciente anterior. */
  stale_months: string[];
  /** Un punto por bucket — mismo bucketing que /consumption y /export para ese period. */
  series: CostPoint[];
}

export interface CostsRangeParams {
  from: string;
  to: string;
  device_id?: string;
}

// ---------- Alerts ----------

export type AlertKind = 'hourly_power' | 'daily_total';

export type AlertSeverity = 'moderate' | 'high';

export interface Alert {
  kind: AlertKind;
  severity: AlertSeverity;
  device_id: string | null;
  variable: string;
  value: number;
  expected_low: number;
  expected_high: number;
  /** Hora local 0-23 si kind="hourly_power"; día de semana 0=lunes..6=domingo si kind="daily_total". */
  bucket: number;
  timestamp: string;
  message: string;
}

export interface AlertsData {
  recent: Alert[];
  daily_total: Alert | null;
}

export interface AlertsParams {
  device_id?: string;
  limit?: number;
}

// ---------- WebSocket ----------

export interface WsSubscribeMessage {
  action: 'subscribe';
  variable: Variable;
}

export interface WsUnsubscribeMessage {
  action: 'unsubscribe';
}

export interface WsPingMessage {
  action: 'ping';
}

export type WsClientMessage = WsSubscribeMessage | WsUnsubscribeMessage | WsPingMessage;

export interface WsSubscribedEvent {
  type: 'subscribed';
  variable: Variable;
}

export interface WsDataEvent {
  type: 'data';
  variable: Variable;
  value: number;
  device_id: string;
  device_name: string;
  timestamp: string;
}

export interface WsUnsubscribedEvent {
  type: 'unsubscribed';
}

export interface WsPongEvent {
  type: 'pong';
}

export interface WsErrorEvent {
  type: 'error';
  message: string;
  valid_variables: Variable[];
}

/**
 * Llega a TODOS los clientes conectados, sin importar la variable suscrita
 * (o si no hay suscripción activa) — a diferencia de los mensajes `data`.
 */
export interface WsAlertEvent extends Alert {
  type: 'alert';
}

export type WsServerEvent =
  | WsSubscribedEvent
  | WsDataEvent
  | WsUnsubscribedEvent
  | WsPongEvent
  | WsErrorEvent
  | WsAlertEvent;
