import { CalendarDays, Clock, TrendingUp } from 'lucide-react';
import type { PicoDiario, PicoHorario, SemanaDelPeriodo } from '../../domain/detalleDelPeriodo';
import { StatCard } from '../ui/StatCard';
import { formatKwh, formatLocalDateTime } from '../../utils/format';

interface PeakInsightsCardProps {
  diaPico: PicoDiario | null;
  horaPico: PicoHorario | null;
  semanaPico: { semana: SemanaDelPeriodo; deltaSobreMedia: number | null } | null;
}

/**
 * Los tres picos del periodo: el día, la hora y la semana.
 *
 * Cada recuadro se omite si su dato no existe. Un informe que alguien archiva
 * es peor con un "—" que sin la tarjeta: el guion se lee como "no hubo pico",
 * no como "no hay con qué calcularlo".
 */
export function PeakInsightsCard({ diaPico, horaPico, semanaPico }: PeakInsightsCardProps) {
  if (!diaPico && !horaPico && !semanaPico) return null;

  const delta = semanaPico?.deltaSobreMedia;

  return (
    <div className="rise-grid grid grid-cols-1 gap-4 sm:grid-cols-3">
      {diaPico && (
        <StatCard
          label="Día de mayor consumo"
          tone="import"
          icon={<CalendarDays className="h-5 w-5" />}
          value={formatLocalDateTime(diaPico.time, 'd MMM')}
          footer={formatKwh(diaPico.kwh)}
        />
      )}

      {horaPico && (
        <StatCard
          label="Hora pico"
          tone="import"
          icon={<Clock className="h-5 w-5" />}
          value={`${String(horaPico.hora).padStart(2, '0')}:00`}
          footer={
            horaPico.fecha
              ? `${formatKwh(horaPico.kwh)} · ${formatLocalDateTime(`${horaPico.fecha}T12:00:00Z`, 'd MMM')}`
              : formatKwh(horaPico.kwh)
          }
        />
      )}

      {semanaPico && (
        <StatCard
          label="Semana de mayor consumo"
          tone="import"
          icon={<TrendingUp className="h-5 w-5" />}
          value={semanaPico.semana.etiqueta}
          footer={
            // Sin al menos dos semanas no hay media contra la cual comparar, y
            // un "+0%" inventaría la referencia.
            delta == null
              ? formatKwh(semanaPico.semana.consumoKwh)
              : `${formatKwh(semanaPico.semana.consumoKwh)} · ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}% sobre el promedio`
          }
        />
      )}
    </div>
  );
}
