/**
 * Cascada diaria de la página de reactiva.
 *
 * Un rango de muchas semanas pedido de una vez obliga a InfluxDB a barrer todo
 * el período en una sola consulta, que en el gateway se queda sin respuesta
 * (timeout) y la página termina en error. Partir el rango por día hace N
 * consultas chicas —cada una cabe en el límite— y la respuesta se combina: los
 * totales se suman y la tendencia se concatena (mejor resolución: ventanas de
 * 1h por día en vez de 6h para un mes).
 */

import type { ReactiveQuadrantPoint, ReactiveQuadrantsResult } from '../api/types';

const DIA_MS = 86_400_000;

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Partir un rango en trozos de a un día; rangos ≤ 24h quedan en una sola pieza. */
export function dividirEnDias(fromIso: string, toIso: string): { from: string; to: string }[] {
  const inicio = Date.parse(fromIso);
  const fin = Date.parse(toIso);
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || inicio >= fin) {
    return [{ from: fromIso, to: toIso }];
  }
  if (fin - inicio <= DIA_MS) return [{ from: fromIso, to: toIso }];

  const trozos: { from: string; to: string }[] = [];
  let actual = inicio;
  while (actual < fin) {
    const tope = Math.min(actual + DIA_MS, fin);
    trozos.push({ from: new Date(actual).toISOString(), to: new Date(tope).toISOString() });
    actual = tope;
  }
  return trozos;
}

/** Suma los totales y concatena la tendencia de los trozos diarios. */
export function combinarResultados(partes: ReactiveQuadrantsResult[]): ReactiveQuadrantsResult {
  const q: [number, number, number, number] = [0, 0, 0, 0];
  const trend: ReactiveQuadrantPoint[] = [];
  let periodStart = '';
  let periodEnd = '';
  const deviceId = partes[0]?.device_id ?? null;

  for (const parte of partes) {
    q[0] += parte.q1_kvarh;
    q[1] += parte.q2_kvarh;
    q[2] += parte.q3_kvarh;
    q[3] += parte.q4_kvarh;
    trend.push(...parte.trend);
    if (!periodStart || parte.period_start < periodStart) periodStart = parte.period_start;
    if (!periodEnd || parte.period_end > periodEnd) periodEnd = parte.period_end;
  }

  trend.sort((a, b) => a.time.localeCompare(b.time));

  const totalImport = redondear(q[0] + q[1]);
  const totalExport = redondear(q[2] + q[3]);
  const sum = q[0] + q[1] + q[2] + q[3];
  const dominante = sum > 0 ? q.indexOf(Math.max(...q)) : -1;

  return {
    period_start: periodStart,
    period_end: periodEnd,
    device_id: deviceId,
    q1_kvarh: redondear(q[0]),
    q2_kvarh: redondear(q[1]),
    q3_kvarh: redondear(q[2]),
    q4_kvarh: redondear(q[3]),
    total_import_kvarh: totalImport,
    total_export_kvarh: totalExport,
    balance_kvarh: redondear(totalImport - totalExport),
    dominant: dominante >= 0 ? `q${dominante + 1}` : null,
    dominant_kvarh: dominante >= 0 ? redondear(q[dominante] ?? 0) : 0,
    trend,
  };
}
