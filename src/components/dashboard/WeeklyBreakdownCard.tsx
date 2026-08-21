import type { SemanaDelPeriodo } from '../../domain/detalleDelPeriodo';
import { Card } from '../ui/Card';
import { ComparisonBarChart } from '../charts/ComparisonBarChart';
import { formatKwh } from '../../utils/format';

interface WeeklyBreakdownCardProps {
  semanas: SemanaDelPeriodo[];
}

/**
 * Cómo se movió el consumo semana a semana.
 *
 * Es la pregunta que se le hace a un mes y que la barra por día no responde:
 * treinta columnas muestran el ruido diario, no la tendencia. Las semanas
 * parciales de las puntas entran con su etiqueta de fechas, así que una semana
 * corta no se lee como una semana floja.
 *
 * Solo energía. El costo por semana no se puede sumar acá: el crédito por
 * exportar se reparte contra lo importado del mes entero.
 */
export function WeeklyBreakdownCard({ semanas }: WeeklyBreakdownCardProps) {
  if (semanas.length < 2) return null;

  return (
    <Card>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Consumo por semana</p>
      <p className="mt-0.5 mb-4 text-[11px] text-slate-400">
        De lunes a domingo. Las semanas de los extremos pueden ser parciales — la etiqueta dice qué
        días abarcan.
      </p>
      <ComparisonBarChart
        data={semanas.map((s) => ({
          label: s.etiqueta,
          a: s.consumoKwh,
          b: s.exportacionKwh,
        }))}
        labelA="Importado"
        labelB="Exportado"
        valueFormatter={(v) => formatKwh(v)}
      />
    </Card>
  );
}
