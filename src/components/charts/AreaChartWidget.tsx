import { Area, AreaChart, Brush, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
        <XAxis
          dataKey="time"
          domain={['dataMin', 'dataMax']}
          type="number"
          tickFormatter={(t: number) => timeFormatter(t)}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={{ stroke: 'rgba(148,163,184,0.15)' }}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          domain={['auto', 'auto']}
          tickFormatter={(v: number) => valueFormatter(v)}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={68}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--tooltip-bg, #0f172a)',
            border: 'none',
            borderRadius: 12,
            fontSize: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
          labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
          itemStyle={{ color: '#f1f5f9' }}
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
