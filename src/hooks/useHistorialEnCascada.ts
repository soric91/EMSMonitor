import { useEffect, useState } from 'react';
import axios from 'axios';
import { getHistory } from '../api/history';
import type { HistoryResponse, TimeSeriesPoint, Variable } from '../api/types';
import { trocear } from '../domain/historico';

/**
 * Trae el histórico por tramos, en cascada, y va entregando lo que llega.
 *
 * Con intervalos finos un rango normal no cabe en una sola consulta: un día
 * segundo a segundo son 86 400 puntos y el backend corta en 5 000. Antes eso
 * era un 400 en la cara del usuario; ahora el rango se parte y se pide de a un
 * tramo por vez.
 *
 * En cascada y no en paralelo a propósito. Cada tramo fino es una barrida
 * grande sobre InfluxDB, y veintidós de esas a la vez tumban al backend para
 * todos los demás — incluido el WebSocket del tablero. Secuencial tarda lo
 * mismo en total y no bloquea a nadie.
 *
 * Devuelve los puntos acumulados en cada paso, así que la gráfica se dibuja
 * desde el primer tramo y crece hacia la derecha en vez de dejar la pantalla en
 * blanco hasta el final.
 */

export interface EstadoHistorial {
  puntos: TimeSeriesPoint[];
  /** La última respuesta recibida: de ahí salen agregación e intervalo reales. */
  respuesta: HistoryResponse | null;
  cargando: boolean;
  error: string | null;
  /** Tramos ya traídos y tramos totales, para el indicador de avance. */
  avance: { hechos: number; total: number };
}

interface Parametros {
  variable: Variable;
  desde: string;
  hasta: string;
  intervaloSegundos: number;
  deviceId?: string;
  /** Sin variable en el catálogo del medidor no hay nada que pedir. */
  activo: boolean;
}

const INICIAL: EstadoHistorial = {
  puntos: [],
  respuesta: null,
  cargando: false,
  error: null,
  avance: { hechos: 0, total: 0 },
};

function mensajeDeError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detalle = (err.response?.data as { detail?: string } | undefined)?.detail;
    if (detalle) return detalle;
  }
  return 'No se pudo cargar el histórico.';
}

export function useHistorialEnCascada({
  variable,
  desde,
  hasta,
  intervaloSegundos,
  deviceId,
  activo,
}: Parametros): EstadoHistorial {
  const [estado, setEstado] = useState<EstadoHistorial>(INICIAL);

  useEffect(() => {
    if (!activo) return;
    const tramos = trocear(desde, hasta, intervaloSegundos);
    if (tramos.length === 0) return;

    let cancelado = false;
    setEstado({ ...INICIAL, cargando: true, avance: { hechos: 0, total: tramos.length } });

    async function correr() {
      const acumulado: TimeSeriesPoint[] = [];

      for (const [i, tramo] of tramos.entries()) {
        try {
          const data = await getHistory({
            variable,
            from: tramo.desde,
            to: tramo.hasta,
            interval_seconds: intervaloSegundos,
            device_id: deviceId,
          });
          if (cancelado) return;
          acumulado.push(...data.points);
          setEstado({
            puntos: [...acumulado],
            respuesta: data,
            cargando: i < tramos.length - 1,
            error: null,
            avance: { hechos: i + 1, total: tramos.length },
          });
        } catch (err) {
          if (cancelado) return;
          // Un tramo que falla no tira lo que ya se dibujó: se muestra lo
          // traído hasta ahí y se dice que el resto no llegó.
          setEstado((previo) => ({
            ...previo,
            cargando: false,
            error: mensajeDeError(err),
          }));
          return;
        }
      }
    }

    void correr();
    return () => {
      cancelado = true;
    };
  }, [variable, desde, hasta, intervaloSegundos, deviceId, activo]);

  return estado;
}
