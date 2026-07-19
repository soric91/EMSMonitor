import { Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HourProfilePoint } from '../../api/types';
import { formatWatts } from '../../utils/format';

const IMPORT_COLOR = '#f59e0b';
const EXPORT_COLOR = '#10b981';
const PEAK_STROKE = '#f8fafc';

interface HourlyProfileChartProps {
  profile: HourProfilePoint[];
  /** Hora 0-23 a resaltar como pico de importación; null = no resaltar. */
  peakConsumptionHour: number | null;
  /** Hora 0-23 a resaltar como pico de exportación; null = no resaltar. */
  peakExportHour: number | null;
  height?: number;
}

export function HourlyProfileChart({
  profile,
  peakConsumptionHour,
  peakExportHour,
  height = 260,
}: HourlyProfileChartProps) {
  const data = profile.map((p) => ({ hour: p.hour, value: p.power_avg_w }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
        <XAxis
          dataKey="hour"
          tickFormatter={(h: number) => `${h}h`}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={{ stroke: 'rgba(148,163,184,0.15)' }}
          tickLine={false}
          interval={1}
        />
        <YAxis
          tickFormatter={(v: number) => formatWatts(v)}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={70}
        />
        <ReferenceLine y={0} stroke="rgba(148,163,184,0.4)" />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.08)' }}
          contentStyle={{
            background: '#0f172a',
            border: 'none',
            borderRadius: 12,
            fontSize: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
          labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
          itemStyle={{ color: '#f1f5f9' }}
          formatter={(value) => {
            const v = Number(value);
            return [`${formatWatts(Math.abs(v))} ${v >= 0 ? 'importando' : 'exportando'}`, 'Promedio'];
          }}
          labelFormatter={(h) => `${h}:00 — ${h}:59`}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={400}>
          {data.map((p) => {
            const isPeak = p.hour === peakConsumptionHour || p.hour === peakExportHour;
            return (
              <Cell
                key={p.hour}
                fill={p.value >= 0 ? IMPORT_COLOR : EXPORT_COLOR}
                stroke={isPeak ? PEAK_STROKE : undefined}
                strokeWidth={isPeak ? 2 : 0}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
