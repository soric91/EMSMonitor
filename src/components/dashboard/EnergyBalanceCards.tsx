import { ArrowDownToLine, ArrowUpFromLine, Scale } from 'lucide-react';
import { StatCard } from '../ui/StatCard';
import { formatKwh } from '../../utils/format';

interface EnergyBalanceCardsProps {
  /** `undefined` = todavía cargando (esqueleto); `null` = el periodo no lo trae. */
  consumptionKwh?: number | null;
  exportKwh?: number | null;
  netKwh?: number | null;
  /**
   * `true` en una sede sin generación propia: ahí exportado y balance neto no
   * son "todavía sin datos", son dos recuadros que nunca van a tener nada.
   */
  soloImporta?: boolean;
}

/**
 * Los tres totales de energía del periodo: importado, exportado y el balance.
 *
 * Estaban escritos dos veces —Reports y la vieja página de Consumo/Exportación—
 * con una diferencia que no era deliberada: una toleraba que el balance viniera
 * nulo y la otra asumía número, así que un periodo sin datos la reventaba. Acá
 * queda la versión tolerante.
 *
 * El balance se pinta por signo, no en gris: exportador neto en verde (plata a
 * favor), importador neto en ámbar. Un solo color para los dos casos obligaría
 * a leer la letra chica para saber cuál de los dos es.
 *
 * En una sede de consumo puro —el caso mayoritario— queda una sola tarjeta:
 * exportado y balance no se muestran en cero, se omiten. Ver `useSiteMode`.
 */
export function EnergyBalanceCards({
  consumptionKwh,
  exportKwh,
  netKwh,
  soloImporta = false,
}: EnergyBalanceCardsProps) {
  // `undefined` se propaga como tal: StatCard lo dibuja como esqueleto.
  const kwh = (v: number | null | undefined) =>
    v === undefined ? undefined : v === null ? '—' : formatKwh(v);

  const exportador = netKwh != null && netKwh < 0;
  const tonoNeto = netKwh == null ? 'neutral' : exportador ? 'export' : 'import';
  const colorNeto =
    netKwh == null
      ? 'text-slate-900 dark:text-white'
      : exportador
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-amber-600 dark:text-amber-400';

  // La mayoría de las sedes solo importa; la que tiene solar es el caso
  // especial. Con una sola tarjeta la fila no se estira a lo ancho.
  if (soloImporta) {
    return (
      <div className="rise-grid grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Consumo del periodo"
          tone="import"
          icon={<ArrowDownToLine className="h-5 w-5" />}
          value={kwh(consumptionKwh)}
        />
      </div>
    );
  }

  return (
    <div className="rise-grid grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Importado"
        tone="import"
        icon={<ArrowDownToLine className="h-5 w-5" />}
        value={kwh(consumptionKwh)}
      />
      <StatCard
        label="Exportado"
        tone="export"
        icon={<ArrowUpFromLine className="h-5 w-5" />}
        value={kwh(exportKwh)}
      />
      <StatCard
        label="Balance neto"
        tone={tonoNeto}
        icon={<Scale className="h-5 w-5" />}
        value={
          netKwh === undefined ? undefined : (
            <span className={colorNeto}>{netKwh === null ? '—' : formatKwh(Math.abs(netKwh))}</span>
          )
        }
        footer={
          netKwh == null ? null : (
            <span
              className={
                exportador
                  ? 'text-emerald-600/80 dark:text-emerald-400/80'
                  : 'text-amber-600/80 dark:text-amber-400/80'
              }
            >
              {exportador ? 'Exportador neto' : 'Importador neto'}
            </span>
          )
        }
      />
    </div>
  );
}
