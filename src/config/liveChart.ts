// Config del backfill histórico de las gráficas en vivo del dashboard.
// El historial se consulta por buckets secuenciales —cada request es liviano
// (una fracción de la ventana, no la ventana completa)— y se anteponen hasta
// completar la ventana configurada acá abajo.
//
// Un bucket de 3 h → 4 requests por variable (ventana 12 h). Antes eran 12
// requests de 1 h en serie: el tiempo de la primera carga era 12 × la latencia
// de cada consulta a InfluxDB. La resolución (30 puntos por bucket) no cambia.

export const LIVE_HISTORY_WINDOW_HOURS = 12; // horas de historial que se arrastran
export const HISTORY_BUCKET_HOURS = 3; // horas que abarca cada consulta
export const HISTORY_POINTS_PER_BUCKET = 30; // target_points por consulta
export const LIVE_HISTORY_BUFFER_MS = LIVE_HISTORY_WINDOW_HOURS * 3_600_000;
