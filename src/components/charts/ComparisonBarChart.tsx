import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
}

export function ComparisonBarChart({
  data,
  labelA,
  labelB,
  colorA = '#f59e0b',
  colorB = '#10b981',
  height = 260,
  valueFormatter = (v) => `${v}`,
}: ComparisonBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-900/5 dark:text-white/5" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
        <Tooltip
          contentStyle={{
            background: '#0f172a',
            border: 'none',
            borderRadius: 12,
            fontSize: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
          labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
          formatter={(value) => valueFormatter(Number(value))}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="a" name={labelA} fill={colorA} radius={[4, 4, 0, 0]} isAnimationActive animationDuration={400} />
        <Bar dataKey="b" name={labelB} fill={colorB} radius={[4, 4, 0, 0]} isAnimationActive animationDuration={400} />
      </BarChart>
    </ResponsiveContainer>
  );
}
