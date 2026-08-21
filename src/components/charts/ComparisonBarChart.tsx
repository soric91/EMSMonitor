import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AXIS_LINE,
  AXIS_TICK,
  LEGEND_WRAPPER,
  TOOLTIP_CONTENT,
  TOOLTIP_ITEM,
  TOOLTIP_LABEL,
} from './chartTheme';

export interface ComparisonBarPoint {
  label: string;
  a: number;
  b: number;
}

interface ComparisonBarChartProps {
  data: ComparisonBarPoint[];
  labelA: string;
  labelB: string;
  colorA?: string;
  colorB?: string;
  height?: number;
  valueFormatter?: (value: number) => string;
  /**
   * Oculta la segunda serie. Para las sedes sin generación propia, donde
   * "exportado" es una fila de barras en cero con su entrada en la leyenda —y
   * una leyenda que promete un dato que nunca llega confunde más que informa.
   */
  ocultarB?: boolean;
}

export function ComparisonBarChart({
  data,
  labelA,
  labelB,
  colorA = '#f59e0b',
  colorB = '#10b981',
  height = 260,
  valueFormatter = (v) => `${v}`,
  ocultarB = false,
}: ComparisonBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={AXIS_LINE} vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT}
          labelStyle={TOOLTIP_LABEL}
          itemStyle={TOOLTIP_ITEM}
          formatter={(value) => valueFormatter(Number(value))}
        />
        <Legend wrapperStyle={LEGEND_WRAPPER} />
        <Bar
          dataKey="a"
          name={labelA}
          fill={colorA}
          radius={[4, 4, 0, 0]}
          isAnimationActive
          animationDuration={400}
        />
        {!ocultarB && (
          <Bar
            dataKey="b"
            name={labelB}
            fill={colorB}
            radius={[4, 4, 0, 0]}
            isAnimationActive
            animationDuration={400}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
