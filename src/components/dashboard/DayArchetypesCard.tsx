import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getDayArchetypes } from '../../api/analytics';
import type { DayArchetypesResult } from '../../api/types';
import { useDevice } from '../../hooks/useDevice';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatKwh, formatLocalDateTime } from '../../utils/format';

/**
 * Los tipos de día de la instalación.
 *
 * Las curvas van en % de la energía del día y no en kWh: es la FORMA lo que
 * distingue un tipo de día de otro, y en kWh un laboral caluroso taparía al
 * laboral normal aunque sean el mismo día de la semana con la misma rutina.
 *
 * Debajo, cada día del periodo pintado con el color de su grupo: es donde se
 * ve que el patrón se cumple —o que la última semana se rompió.
 */

const COLORES = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'];

export function DayArchetypesCard() {
  const { selectedDeviceId } = useDevice();
  const [data, setData] = useState<DayArchetypesResult | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(false);
      try {
        const result = await getDayArchetypes({ device_id: selectedDeviceId ?? undefined });
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedDeviceId]);

  if (error) {
    return <Card className="text-sm text-red-500">No se pudieron calcular los tipos de día.</Card>;
  }

  if (data === null) {
    return (
      <Card>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-[220px] w-full" />
      </Card>
    );
  }

  if (data.archetypes.length === 0) {
    return (
      <Card>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Tipos de día</p>
        <p className="mt-2 text-sm text-slate-400">
          {data.days_analyzed === 0
            ? 'Todavía no hay días completos suficientes para agrupar.'
            : `Tus ${data.days_analyzed} días se parecen entre sí: no hay tipos de día distinguibles.`}
        </p>
      </Card>
    );
  }

  // Una fila por hora, una columna por arquetipo — la forma que Recharts
  // espera para dibujar varias líneas sobre el mismo eje.
  const curvas = Array.from({ length: 24 }, (_, hora) => {
    const fila: Record<string, number> = { hora };
    data.archetypes.forEach((arquetipo, i) => {
      fila[`a${i}`] = Math.round((arquetipo.hourly_share[hora] ?? 0) * 1000) / 10;
    });
    return fila;
  });

  return (
    <Card>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
        Tipos de día <span className="text-slate-400">· {data.days_analyzed} días analizados</span>
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {data.archetypes.map((arquetipo, i) => (
          <span key={arquetipo.label} className="flex items-center gap-1.5 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORES[i % COLORES.length] }}
            />
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {arquetipo.label}
            </span>
            <span className="text-slate-400">
              {arquetipo.day_count} días · {formatKwh(arquetipo.avg_kwh)}/día
            </span>
          </span>
        ))}
      </div>

      <div className="mt-3">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={curvas} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="text-slate-500/15"
            />
            <XAxis
              dataKey="hora"
              tickFormatter={(v: number) => `${v}h`}
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-slate-400"
            />
            <YAxis
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11 }}
              width={44}
              stroke="currentColor"
              className="text-slate-400"
            />
            <Tooltip
              formatter={(value, name) => [
                `${String(value)}% del día`,
                data.archetypes[Number(String(name).slice(1))]?.label ?? '',
              ]}
              labelFormatter={(label) => `${String(label)}:00`}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            {data.archetypes.map((arquetipo, i) => (
              <Line
                key={arquetipo.label}
                type="monotone"
                dataKey={`a${i}`}
                stroke={COLORES[i % COLORES.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-[3px]">
        {data.assignments.map((dia) => (
          <span
            key={dia.date}
            title={`${formatLocalDateTime(`${dia.date}T12:00:00Z`, 'd MMM')} · ${data.archetypes[dia.archetype]?.label ?? ''} · ${formatKwh(dia.kwh)}`}
            className="h-3 w-3 rounded-[2px]"
            style={{ backgroundColor: COLORES[dia.archetype % COLORES.length] }}
          />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        Cada cuadro es un día del periodo, con el color de su tipo.
      </p>
    </Card>
  );
}
