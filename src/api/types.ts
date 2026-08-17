// Tipos alineados 1:1 con /openapi.json del backend ApiEMS. No inventar campos.
import type { Period } from '../domain/periods';

export type { Period };

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}

/**
 * El nombre canónico de una medición: `PhV_phsA`, `TotW`, `TotWh_import`.
 *
 * Es un identificador IEC 61850, no un texto para mostrar — viaja por MQTT,
 * queda guardado en InfluxDB y es lo que se manda en `?variable=`. Lo que ve
 * el usuario es la `etiqueta` ("Tensión fase A"), que llega junto al nombre.
 *
 * Deliberadamente `string` y no una unión cerrada: la lista de variables la
 * decide el CRM y cambia cuando alguien da de alta una nueva. Enumerarlas acá
 * era tener una segunda lista que se desactualiza sola — el problema exacto
 * que hacía que la fase C no apareciera.
 */
export type Variable = string;

/** Qué se está midiendo. El panel agrupa por esto. */
export type Magnitud =
  | 'tension'
  | 'tension_compuesta'
  | 'corriente'
  | 'potencia_activa'
  | 'potencia_reactiva'
  | 'potencia_aparente'
  | 'factor_potencia'
  | 'frecuencia'
  | 'energia_importada'
  | 'energia_exportada'
  | 'energia_reactiva_importada'
  | 'energia_reactiva_exportada'
  | 'estado_digital';

export type Fase = 'A' | 'B' | 'C' | 'AB' | 'BC' | 'CA' | 'N' | 'total';

/**
 * Una medición que este cliente tiene cargada y que además reportó datos.
 *
 * Sale de `GET /variables`. Que el backend solo devuelva las que tienen
 * lecturas es lo que evita dibujar una gráfica de fase C para un medidor
 * monofásico.
 */
export interface VariableDisponible {
  nombre: Variable;
  etiqueta: string;
  unidad: string;
  magnitud: Magnitud | null;
  fase: Fase | null;
  acumulativa: boolean;
  equipos: string[];
  /** Reportó al menos una lectura. En `false` existe en el CRM pero nunca publicó. */
  con_datos: boolean;
}

export type Aggregation = 'mean' | 'max' | 'min' | 'last';

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

// ---------- Auth ----------

export interface LoginRequest {
  /** La cuenta la crea un administrador en el CRM; la identifica el correo. */
  email: string;
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
  /**
   * La empresa cuyos datos va a pedir esta sesión.
   *
   * `null` en un administrador que todavía no eligió cuál mirar: su cuenta no
   * pertenece a ninguna empresa. Con ese token solo se puede listar proyectos
   * y elegir uno — no hay datos que pedir sin empresa.
   */
  client_id: string | null;
  /** Qué entró. El panel arranca en el tablero o en la lista de proyectos. */
  role: UserRole;
  /**
   * La contraseña sigue siendo la que generó un administrador. Mientras sea
   * true, el token no abre nada más que el cambio de contraseña —ni en el CRM
   * ni acá.
   */
  must_change_password: boolean;
}

export interface UserInfo {
  user_id: string;
  email: string;
  client_id: string | null;
  role: UserRole;
  /** Un administrador mirando los datos de otra empresa. El panel lo avisa. */
  impersonated: boolean;
  must_change_password: boolean;
}

export type UserRole = 'admin' | 'tecnico' | 'cliente';

export type EstadoCliente = 'activo' | 'suspendido' | 'prospecto';

/** Un gateway que dejó de reportar, con dónde está. */
export interface GatewayCaido {
  id: string;
  numero_serie: string;
  uuid: string;
  /** `None` si nunca se conectó: la instalación puede no haber arrancado. */
  ultima_conexion: string | null;
  site_id: string;
  sitio: string;
  client_id: string;
  empresa: string;
}

/**
 * Una empresa y cuánto tiene instalado, de `GET /fleet/summary`.
 *
 * Son conteos y no el árbol a propósito: dibujar "3 gateways" pidiendo el
 * inventario completo de cada empresa transfiere cada registro Modbus de cada
 * equipo para mostrar un número.
 */
export interface Proyecto {
  id: string;
  nombre_empresa: string;
  /** Estado comercial. Un prospecto suele no tener nada instalado todavía. */
  estado: EstadoCliente;
  /**
   * Si el cliente puede ver su propio consumo. Un administrador entra igual
   * —por eso existe la pantalla— pero la tarjeta lo muestra: es la diferencia
   * entre "todavía no lo habilitamos" y "no tiene datos".
   */
  puede_ver_consumo: boolean;

  sedes: number;
  gateways: number;
  /** Cuántos reportan ahora. La diferencia contra `gateways` es lo que hay que ir a arreglar. */
  gateways_en_linea: number;
  equipos: number;
  /** Registros Modbus. Un equipo sin variables está de alta pero no mide nada. */
  variables: number;
  /** La conexión más reciente de cualquiera de sus gateways. */
  ultima_conexion: string | null;
}

// ---------- Dashboard ----------

export interface DashboardStatus {
  mqtt_connected: boolean;
  influx_connected: boolean;
  devices_online: number;
  devices_total: number;
  last_message_at: string | null;
}

/**
 * El payload consolidado del panel (una sola llamada).
 *
 * Sustituye las peticiones separadas de costos y KPIs del top del dashboard.
 * La conectividad NO va aquí — la sigue exponiendo `/dashboard/status`.
 */
export interface DashboardSummary {
  device_id: string;
  last_update: string;
  // En vivo (RAM, vía MQTT)
  power_active_total_w: number;
  voltage_a: number;
  voltage_b: number;
  current_a: number;
  current_b: number;
  power_factor: number;
  // Energía del periodo (InfluxDB, cacheada)
  consumption_today_kwh: number;
  consumption_month_kwh: number;
  export_today_kwh: number;
  export_month_kwh: number;
  // Costos del día y del mes (mismos rangos que /costs/*)
  costs_day: CostBreakdown;
  costs_month: CostBreakdown;
  // KPIs del día (idénticos a /kpis con el default de hoy)
  kpis: KpiSummary;
}

// ---------- Realtime ----------

export interface DeviceDisponible {
  /** El `identify_device` con el que viajan sus lecturas. */
  device_id: string;
  nombre: string;
  modbus_id: number | null;
  sede_id: string;
  sede: string;
  gateway_id: string;
  /** Número de serie del gateway que lo lee. */
  gateway: string;
  /** Lo decide el CRM con su umbral; acá solo se muestra. */
  gateway_en_linea: boolean;
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

export interface HistoryParams {
  variable: Variable;
  from: string;
  to: string;
  interval_seconds?: number;
  device_id?: string;
  aggregation?: Aggregation;
}

/**
 * Reducciones EXACTAS del rango, calculadas por InfluxDB sobre los datos
 * crudos. No confundir con reducir los puntos de `HistoryResponse`: esos ya
 * vienen agregados por ventana, así que su máximo es el mayor de unos
 * promedios. Solo aplica a variables instantáneas (un contador acumulativo
 * devuelve 400).
 */
export interface HistoryStats {
  variable: Variable;
  device_id: string | null;
  period_start: string;
  period_end: string;
  min: number | null;
  max: number | null;
  mean: number | null;
  last: number | null;
}

export interface HistoryStatsParams {
  variable: Variable;
  from: string;
  to: string;
  device_id?: string;
}

export interface HistoryDownsampleParams {
  variable: Variable;
  from: string;
  to: string;
  target_points?: number;
  device_id?: string;
  aggregation?: Aggregation;
}

// ---------- Analytics ----------

/**
 * Cómo hay que leer el medidor de frontera de esta sede.
 *
 * `consumo`: sin generación propia — todo lo que pasa por el medidor es
 * consumo y los indicadores valen las 24 h. `generacion`: hay fotovoltaica
 * inyectando y el medidor solo ve el balance neto, así que en horas de sol el
 * consumo real queda escondido.
 */
export type SiteMode = 'consumo' | 'generacion';

export interface SiteModeResult {
  device_id: string | null;
  mode: SiteMode;
  /** `crm` si alguien lo declaró en la sede; `detected` si se dedujo de lo exportado. */
  source: 'crm' | 'detected';
}

export type HeatmapMetric = 'import' | 'export' | 'net' | 'cost';

/**
 * Cuadrícula hora x día: `values[i][h]` es la casilla del día `dates[i]` a la
 * hora local `h`. Un `null` es una hora SIN DATO, no un cero.
 */
export interface HeatmapResult {
  device_id: string | null;
  period_start: string;
  period_end: string;
  metric: HeatmapMetric;
  unit: string;
  dates: string[];
  values: (number | null)[][];
}

export interface HeatmapParams extends AnalyticsRangeParams {
  metric?: HeatmapMetric;
}

export interface LoadDurationPoint {
  /** Fracción del tiempo (0..1) durante la que se estuvo por encima de `power_w`. */
  time_fraction: number;
  power_w: number;
}

/**
 * Curva de duración de carga: la potencia importada ordenada de mayor a menor
 * contra el porcentaje del tiempo. `top_energy_share` dice qué porción de la
 * energía se consume en el `top_fraction` del tiempo más alto.
 */
export interface LoadDurationResult {
  device_id: string | null;
  period_start: string;
  period_end: string;
  sample_seconds: number;
  points: LoadDurationPoint[];
  p1_w: number | null;
  p5_w: number | null;
  p50_w: number | null;
  p95_w: number | null;
  top_fraction: number;
  top_energy_share: number | null;
  sample_count: number;
}

export interface LoadDurationParams extends AnalyticsRangeParams {
  points?: number;
}

export interface BaseLoadTrendPoint {
  /** Fecha local, `YYYY-MM-DD`. */
  date: string;
  base_load_w: number;
  sample_count: number;
}

/**
 * La carga base ("siempre encendido") día a día, su tendencia y su costo.
 *
 * `window` dice sobre qué horas se midió: `dia` en una sede sin generación,
 * `noche` con generación — de día el medidor ve el balance neto y la
 * fotovoltaica tapa el consumo real.
 */
export interface BaseLoadTrendResult {
  device_id: string | null;
  period_start: string;
  period_end: string;
  percentile: number;
  window: 'dia' | 'noche';
  points: BaseLoadTrendPoint[];
  current_w: number | null;
  /** Mediana de los últimos 7 días menos la de los 7 anteriores. */
  trend_delta_w: number | null;
  monthly_kwh: number | null;
  monthly_cost_cop: number | null;
  share_of_import: number | null;
}

export interface BaseloadTrendParams extends AnalyticsRangeParams {
  percentile?: number;
}

/**
 * Proyección de la factura del mes.
 *
 * Con `method: 'insufficient_history'` los campos proyectados vienen en `null`
 * y no se proyecta nada: una media sacada de tres días dice más del azar que
 * del consumo.
 */
export interface BillForecast {
  month: string;
  device_id: string | null;
  kwh_mtd: number;
  export_mtd_kwh: number;
  days_elapsed: number;
  days_total: number;
  kwh_projected: number | null;
  kwh_p10: number | null;
  kwh_p90: number | null;
  export_projected_kwh: number | null;
  cost_projected_cop: number | null;
  cost_p10_cop: number | null;
  cost_p90_cop: number | null;
  method: 'ewma_por_tipo_de_dia' | 'insufficient_history';
}

export interface CoveragePoint {
  time: string;
  samples: number;
  /** 1.0 = ventana completa. */
  ratio: number;
}

/**
 * Cuánto dato hay realmente en el rango. Un hueco no es consumo cero, aunque
 * se vea igual en una gráfica.
 */
export interface CoverageResult {
  device_id: string | null;
  period_start: string;
  period_end: string;
  bucket_seconds: number;
  expected_per_bucket: number | null;
  /** De dónde salieron las muestras esperadas. */
  expected_source: 'declarado' | 'inferido' | 'desconocido';
  overall_ratio: number | null;
  incomplete_buckets: number;
  points: CoveragePoint[];
}

export interface CoverageParams extends AnalyticsRangeParams {
  bucket_seconds?: number;
}

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

export interface EfficiencyRecommendation {
  tariff_month: string;
  /** true = la tarifa usada es de un mes anterior, no la del mes actual. */
  stale: boolean;
  cu_cop_kwh: number;
  excedente_cop_kwh: number;
  export_kwh: number;
  /** Cota superior ilustrativa (asume autoconsumir TODO lo exportado), no promesa exacta. */
  potential_savings_cop: number;
}

export interface AnalyticsSummary {
  period_start: string;
  period_end: string;
  device_id: string | null;
  consumption_daily_kwh: number;
  consumption_weekly_kwh: number;
  consumption_monthly_kwh: number;
  export_daily_kwh: number;
  export_monthly_kwh: number;
  /** 24 puntos (hora 0-23); power_avg_w positivo = importando, negativo = exportando. */
  hourly_profile: HourProfilePoint[];
  /** null si el rango no tuvo ninguna hora importando. */
  peak_consumption_hour: number | null;
  /** null si el rango no tuvo ninguna hora exportando. */
  peak_export_hour: number | null;
  /** null si no hay NINGUNA tarifa registrada de la cual estimar. */
  efficiency: EfficiencyRecommendation | null;
}

export interface BaseLoadParams extends AnalyticsRangeParams {
  percentile?: number;
}

export interface ReactiveQuadrantPoint {
  time: string;
  q1_kvarh: number;
  q2_kvarh: number;
  q3_kvarh: number;
  q4_kvarh: number;
}

export interface ReactiveQuadrantsResult {
  period_start: string;
  period_end: string;
  device_id: string | null;
  q1_kvarh: number;
  q2_kvarh: number;
  q3_kvarh: number;
  q4_kvarh: number;
  /** q1 + q2: reactiva importada de la red. */
  total_import_kvarh: number;
  /** q3 + q4: reactiva exportada a la red. */
  total_export_kvarh: number;
  /** importada - exportada. Positivo = la red le entrega reactiva al cliente. */
  balance_kvarh: number;
  /** "q1" | "q2" | "q3" | "q4", o null si no hubo reactiva en el período. */
  dominant: string | null;
  dominant_kvarh: number;
  /** Un punto por ventana del período; las ventanas las decide el backend. */
  trend: ReactiveQuadrantPoint[];
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

export interface EnergyPoint {
  time: string;
  value: number;
}

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
  /** Precio del tramo 2 del excedente exportado — el tramo 1 (hasta lo importado
   *  ese mismo mes) se paga a cu_cop_kwh. Por mes, igual que cu_cop_kwh. */
  excedente_cop_kwh: number;
}

export interface TariffConfig {
  umbral_cs_kwh: number;
  periods: TariffPeriod[];
}

/** Ojo: NO son los mismos strings que ReportType ("daily"/"monthly"/…) — convención aparte. */
export type CostPeriod = Period;

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
  /** Negativo = crédito por exportación superó el costo: saldo a favor del usuario. */
  net_cost_cop: number;
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
  /** Acota a un medidor. `null` = todos los del cliente. */
  device_id?: string | null;
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
  /** El equipo al que quedó acotada, o `null` si son todos. */
  device_id: string | null;
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
  WsSubscribedEvent | WsDataEvent | WsUnsubscribedEvent | WsPongEvent | WsErrorEvent | WsAlertEvent;
