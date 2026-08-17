import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ForecastPoint } from '../../api/types';
import { formatKwh, formatLocalDateTime } from '../../utils/format';

/**
 * El consumo esperado hora a hora, con su banda.
 *
 * La banda se dibuja como un área entre p10 y p90 y la línea va punteada: las
 * dos cosas dicen lo mismo —esto no ocurrió todavía— y juntas evitan que el
 * pronóstico se lea como un dato medido. Un número solo, sin banda, es la
 * forma más rápida de que alguien lo tome por una promesa.
 *
 * Recharts apila áreas: para pintar solo la franja entre p10 y p90 se dibuja
 * un área invisible hasta p10 y encima otra del ancho de la banda.
 */

const COLOR = '#3b82f6';

interface ForecastBandChartProps {
  points: ForecastPoint[];
  height?: number;
}

export function ForecastBandChart({ points, height = 200 }: ForecastBandChartProps) {
  if (points.length === 0) {
    return <p className="text-sm text-slate-400">Sin pronóstico disponible.</p>;
  }

  const datos = points.map((p) => ({
    time: Date.parse(p.time),
    esperado: p.kwh,
    piso: p.p10,
    ancho: Math.max(0, p.p90 - p.p10),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={datos} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-500/15" />
        <XAxis
          dataKey="time"
          type="number"
          domain={['dataMin', 'dataMax']}
          scale="time"
          tickFormatter={(v: number) => formatLocalDateTime(new Date(v).toISOString(), 'HH:mm')}
          tick={{ fontSize: 11 }}
          stroke="currentColor"
          className="text-slate-400"
        />
        <YAxis
          tickFormatter={(v: number) => formatKwh(v)}
          tick={{ fontSize: 11 }}
          width={72}
          stroke="currentColor"
          className="text-slate-400"
        />
        <Tooltip
          formatter={(value, name) =>
            name === 'esperado' ? [formatKwh(Number(value)), 'Esperado'] : []
          }
          labelFormatter={(label) =>
            formatLocalDateTime(new Date(Number(label)).toISOString(), 'd MMM, HH:mm')
          }
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Area dataKey="piso" stackId="banda" stroke="none" fill="none" isAnimationActive={false} />
        <Area
          dataKey="ancho"
          stackId="banda"
          stroke="none"
          fill={COLOR}
          fillOpacity={0.15}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="esperado"
          stroke={COLOR}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
