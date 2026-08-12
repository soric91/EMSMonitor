// Config del backfill histórico de las gráficas en vivo del dashboard.
// El historial se consulta por buckets horarios secuenciales —cada request es
// liviano (una hora, no la ventana completa)— y se anteponen hasta completar
// la ventana configurada acá abajo.

export const LIVE_HISTORY_WINDOW_HOURS = 12; // horas de historial que se arrastran
export const HISTORY_BUCKET_HOURS = 1; // horas que abarca cada consulta
export const HISTORY_POINTS_PER_BUCKET = 30; // target_points por consulta horaria
export const LIVE_HISTORY_BUFFER_MS = LIVE_HISTORY_WINDOW_HOURS * 3_600_000;
