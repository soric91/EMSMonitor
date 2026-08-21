import { useMemo, useState } from 'react';
import type { HeatmapResult } from '../../api/types';
import { formatLocalDateTime } from '../../utils/format';

/**
 * La cuadrícula hora x día en SVG propio.
 *
 * Recharts no trae heatmap y envolverlo en un scatter con celdas cuadradas
 * cuesta más código que dibujarlo, igual que `HourlyProfileChart`.
 *
 * La escala de color va por CUANTILES, no lineal: en energía casi siempre hay
 * una hora atípica que multiplica al resto (un arranque, un día de fiesta), y
 * con una escala lineal esa sola casilla aplana todas las demás a un mismo
 * tono claro y el mapa deja de decir nada.
 */

const NIVELES = 5;

/**
 * Ámbar (importación/costo) y esmeralda (exportación), de menos a más.
 *
 * Los pasos salen de variables CSS y no de literales porque la rampa tiene que
 * arrancar desde el fondo del tema: sobre una superficie oscura, una rampa que
 * empieza en crema hace que la casilla más floja brille más que la más cargada
 * — el mapa se leía invertido.
 */
const PALETA_IMPORT = [
  'var(--celda-0)',
  'var(--celda-1)',
  'var(--celda-2)',
  'var(--celda-3)',
  'var(--celda-4)',
];
const PALETA_EXPORT = [
  'var(--celda-0)',
  'var(--celda-e1)',
  'var(--celda-e2)',
  'var(--celda-e3)',
  'var(--celda-e4)',
];
/** Divergente para el neto: exporta (verde) ← 0 → importa (ámbar). */
const PALETA_NET = [
  'var(--celda-e4)',
  'var(--celda-e2)',
  'var(--celda-0)',
  'var(--celda-3)',
  'var(--celda-4)',
];

const SIN_DATO = 'transparent';

interface CalendarHeatmapProps {
  data: HeatmapResult;
  /** Formatea el valor de una casilla para el tooltip. */
  valueFormatter: (value: number) => string;
}

function cuantiles(valores: number[], cortes: number): number[] {
  const ordenados = [...valores].sort((a, b) => a - b);
  return Array.from({ length: cortes }, (_, i) => {
    const posicion = ((i + 1) / (cortes + 1)) * (ordenados.length - 1);
    return ordenados[Math.round(posicion)] ?? 0;
  });
}

function paletaDe(metric: HeatmapResult['metric']): string[] {
  if (metric === 'export') return PALETA_EXPORT;
  if (metric === 'net') return PALETA_NET;
  return PALETA_IMPORT;
}

export function CalendarHeatmap({ data, valueFormatter }: CalendarHeatmapProps) {
  const [activa, setActiva] = useState<{ fecha: string; hora: number; valor: number } | null>(null);

  const escala = useMemo(() => {
    const valores = data.values.flat().filter((v): v is number => v !== null);
    if (valores.length === 0) return null;
    const paleta = paletaDe(data.metric);
    // El neto se corta alrededor del cero (exportando vs. importando); el
    // resto, por cuantiles de sus propios valores.
    const cortes =
      data.metric === 'net'
        ? [Math.min(...valores) / 2, -0.001, 0.001, Math.max(...valores) / 2].slice(0, NIVELES - 1)
        : cuantiles(valores, NIVELES - 1);
    return { paleta, cortes };
  }, [data]);

  if (data.dates.length === 0 || escala === null) {
    return <p className="text-sm text-slate-400">Sin datos suficientes.</p>;
  }

  // El neto se lee alrededor del cero (exportando vs. importando), no de menos
  // a más.
  const divergente = data.metric === 'net';

  const color = (valor: number | null): string => {
    if (valor === null) return SIN_DATO;
    const nivel = escala.cortes.filter((corte) => valor > corte).length;
    return escala.paleta[nivel] ?? escala.paleta[escala.paleta.length - 1]!;
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[2px]">
          <thead>
            <tr>
              <th className="w-16" />
              {Array.from({ length: 24 }, (_, hora) => (
                <th
                  key={hora}
                  scope="col"
                  className="text-[9px] font-normal text-slate-400 tabular-nums"
                >
                  {hora % 3 === 0 ? hora : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.dates.map((fecha, fila) => (
              <tr key={fecha}>
                <th
                  scope="row"
                  className="pr-2 text-right text-[10px] font-normal whitespace-nowrap text-slate-400"
                >
                  {formatLocalDateTime(`${fecha}T12:00:00Z`, 'd MMM')}
                </th>
                {Array.from({ length: 24 }, (_, hora) => {
                  const valor = data.values[fila]?.[hora] ?? null;
                  return (
                    <td key={hora} className="p-0">
                      <div
                        role="gridcell"
                        aria-label={`${fecha} ${hora}:00 — ${
                          valor === null ? 'sin datos' : valueFormatter(valor)
                        }`}
                        onMouseEnter={() => {
                          if (valor !== null) setActiva({ fecha, hora, valor });
                        }}
                        onMouseLeave={() => {
                          setActiva(null);
                        }}
                        className={[
                          'h-4 w-4 rounded-[2px]',
                          // Una hora sin dato se ve como hueco (rayado), no
                          // como consumo cero: la diferencia es justo lo que
                          // el indicador de cobertura viene a contar.
                          valor === null
                            ? 'border border-dashed border-slate-300 dark:border-slate-700'
                            : '',
                        ].join(' ')}
                        style={valor === null ? undefined : { backgroundColor: color(valor) }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] text-slate-400">
        <span>
          {activa
            ? `${formatLocalDateTime(`${activa.fecha}T12:00:00Z`, 'd MMM')} · ${activa.hora}:00 — ${valueFormatter(activa.valor)}`
            : 'Cada casilla es una hora. Pasa el cursor para ver el valor.'}
        </span>

        {/* La leyenda decía "menos […] más" y nada más: cinco tonos sin una
            sola cifra, así que el color no se podía traducir a consumo. Ahora
            cada frontera lleva su valor. */}
        <span className="flex flex-wrap items-center gap-1">
          <span>{divergente ? 'exporta' : 'menos'}</span>
          {escala.paleta.map((tono, i) => (
            <span key={tono} className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-[2px]" style={{ backgroundColor: tono }} />
              {/* En el neto los cortes son artificiales (±0.001 alrededor del
                  cero): el número no diría nada y el extremo ya lo explica. */}
              {!divergente && i < escala.cortes.length && (
                <span className="tabular-nums">{valueFormatter(escala.cortes[i]!)}</span>
              )}
            </span>
          ))}
          <span>{divergente ? 'importa' : 'más'}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[2px] border border-dashed border-slate-300 dark:border-slate-700" />
          Sin lectura (no es consumo cero)
        </span>
        {!divergente && (
          // Sin decirlo, el mapa engaña: dos tonos seguidos pueden separar
          // 0.2 kWh o 3 kWh, según cómo se repartan las horas.
          <span>Los cortes van por cuantiles: cada tono agrupa la misma cantidad de horas.</span>
        )}
      </div>
    </div>
  );
}
