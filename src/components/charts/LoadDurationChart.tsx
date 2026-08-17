import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LoadDurationResult } from '../../api/types';
import { formatWatts } from '../../utils/format';
import { AXIS_LINE, AXIS_TICK, TOOLTIP_CONTENT, TOOLTIP_ITEM, TOOLTIP_LABEL } from './chartTheme';

/**
 * La curva de duración de carga.
 *
 * Se lee de izquierda a derecha: en el extremo izquierdo está la potencia que
 * solo se alcanza un rato, y en el derecho la que hay casi siempre. Una curva
 * que cae en picada es un consumo de picos; una plana, consumo de fondo.
 *
 * La línea de referencia marca el 5% del tiempo, que es el punto que se cita
 * ("el 5% del tiempo estás por encima de X").
 */

const COLOR = '#f59e0b';

interface LoadDurationChartProps {
  data: LoadDurationResult;
  height?: number;
}

export function LoadDurationChart({ data, height = 240 }: LoadDurationChartProps) {
  if (data.points.length === 0) {
    return <p className="text-sm text-slate-400">Sin datos suficientes.</p>;
  }

  const puntos = data.points.map((p) => ({
    porcentaje: Math.round(p.time_fraction * 1000) / 10,
    potencia: p.power_w,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={puntos} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="duracion" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR} stopOpacity={0.35} />
            <stop offset="100%" stopColor={COLOR} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={AXIS_LINE} />
        <XAxis
          dataKey="porcentaje"
          type="number"
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tick={AXIS_TICK}
          stroke={AXIS_LINE}
        />
        <YAxis
          tickFormatter={(v: number) => formatWatts(v)}
          tick={AXIS_TICK}
          width={64}
          stroke={AXIS_LINE}
        />
        <Tooltip
          formatter={(value) => [formatWatts(Number(value)), 'Potencia']}
          labelFormatter={(label) => `${String(label)}% del tiempo por encima`}
          contentStyle={TOOLTIP_CONTENT}
          labelStyle={TOOLTIP_LABEL}
          itemStyle={TOOLTIP_ITEM}
        />
        {data.p5_w !== null && (
          <ReferenceLine
            x={data.top_fraction * 100}
            stroke={COLOR}
            strokeDasharray="4 4"
            label={{ value: '5%', position: 'top', fontSize: 10, fill: COLOR }}
          />
        )}
        <Area
          type="monotone"
          dataKey="potencia"
          stroke={COLOR}
          strokeWidth={2}
          fill="url(#duracion)"
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
