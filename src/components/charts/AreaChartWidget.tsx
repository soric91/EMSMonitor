import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AXIS_LINE, AXIS_TICK, TOOLTIP_CONTENT, TOOLTIP_ITEM, TOOLTIP_LABEL } from './chartTheme';

export interface AreaChartPoint {
  time: number;
  value: number;
}

interface AreaChartWidgetProps {
  data: AreaChartPoint[];
  color: string;
  height?: number;
  valueFormatter?: (value: number) => string;
  timeFormatter?: (time: number) => string;
  /** Muestra un scrubber inferior para navegar el historial acumulado con el mouse. */
  showBrush?: boolean;
  /** Cuántos puntos recientes mostrar por defecto antes de que el usuario arrastre el scrubber. */
  initialVisiblePoints?: number;
}

export function AreaChartWidget({
  data,
  color,
  height = 220,
  valueFormatter = (v) => `${v}`,
  timeFormatter = (t) => new Date(t).toLocaleTimeString(),
  showBrush = false,
  initialVisiblePoints = 60,
}: AreaChartWidgetProps) {
  const gradientId = `area-gradient-${color.replace('#', '')}`;
  const brushStartIndex = Math.max(0, data.length - initialVisiblePoints);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={AXIS_LINE} vertical={false} />
        <XAxis
          dataKey="time"
          domain={['dataMin', 'dataMax']}
          type="number"
          tickFormatter={(t: number) => timeFormatter(t)}
          tick={AXIS_TICK}
          axisLine={{ stroke: AXIS_LINE }}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          domain={['auto', 'auto']}
          tickFormatter={(v: number) => valueFormatter(v)}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
          width={68}
        />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT}
          labelStyle={TOOLTIP_LABEL}
          itemStyle={TOOLTIP_ITEM}
          formatter={(value) => [valueFormatter(Number(value)), 'Valor']}
          labelFormatter={(time) => timeFormatter(Number(time))}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          isAnimationActive
          animationDuration={400}
          animationEasing="ease-out"
        />
        {showBrush && data.length > 1 && (
          <Brush
            key={data.length <= initialVisiblePoints ? 'brush-live' : 'brush-scrub'}
            dataKey="time"
            height={22}
            stroke={color}
            fill="transparent"
            travellerWidth={8}
            startIndex={brushStartIndex}
            tickFormatter={(t: number) => timeFormatter(t)}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
