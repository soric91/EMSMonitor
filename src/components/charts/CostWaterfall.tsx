import type { CostBreakdown } from '../../api/types';
import { formatCop, formatKwh } from '../../utils/format';

/**
 * De dónde sale el neto de la factura, paso a paso.
 *
 * Responde la pregunta que el cliente sí se hace —"¿por qué pago esto?"— y en
 * particular la parte que más confunde de este mercado: exportar 150 kWh no
 * acredita 150 kWh al precio del excedente. Lo exportado hasta lo importado en
 * el MISMO mes (tramo 1) se paga al precio al que se compra, y solo lo que
 * sobra (tramo 2) al precio de excedente, que es bastante menor.
 *
 * Barras en SVG y no una librería: son cuatro pasos con etiquetas, y una
 * cascada real en Recharts pide barras apiladas con series invisibles que
 * cuestan más de mantener que dibujar cuatro rectángulos.
 */

const IMPORTE = '#d97706';
const CREDITO = '#059669';
const NETO_PAGAR = '#0f172a';
const NETO_FAVOR = '#059669';

interface Paso {
  label: string;
  detalle: string;
  cop: number;
  color: string;
  /** El último paso es el resultado, no un movimiento más. */
  esTotal?: boolean;
}

export function CostWaterfall({ costs }: { costs: CostBreakdown }) {
  const aFavor = costs.net_cost_cop < 0;
  const pasos: Paso[] = [
    {
      label: 'Costo de lo importado',
      detalle: formatKwh(costs.consumption_kwh),
      cop: costs.consumption_cost_cop,
      color: IMPORTE,
    },
    {
      label: 'Crédito tramo 1',
      detalle: `${formatKwh(costs.export_tier1_kwh)} · al precio de compra`,
      cop: -costs.export_tier1_credit_cop,
      color: CREDITO,
    },
    {
      label: 'Crédito tramo 2',
      detalle: `${formatKwh(costs.export_tier2_kwh)} · al precio de excedente`,
      cop: -costs.export_tier2_credit_cop,
      color: CREDITO,
    },
    {
      label: aFavor ? 'Saldo a tu favor' : 'Neto a pagar',
      detalle: 'resultado del periodo',
      cop: costs.net_cost_cop,
      color: aFavor ? NETO_FAVOR : NETO_PAGAR,
      esTotal: true,
    },
  ];

  // Escala común a todos los pasos: si cada barra se midiera contra sí misma,
  // un crédito chico se vería igual de grande que el costo del que se resta.
  const mayor = Math.max(...pasos.map((p) => Math.abs(p.cop)), 1);

  return (
    <ul className="space-y-2">
      {pasos.map((paso) => (
        <li
          key={paso.label}
          className={paso.esTotal ? 'border-t border-slate-900/10 pt-2 dark:border-white/10' : ''}
        >
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span
              className={
                paso.esTotal
                  ? 'font-semibold text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }
            >
              {paso.label}
              <span className="ml-1.5 text-[11px] text-slate-400">{paso.detalle}</span>
            </span>
            <span
              className={[
                'shrink-0 tabular-nums',
                paso.esTotal
                  ? 'font-semibold text-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400',
              ].join(' ')}
            >
              {paso.cop < 0 && !paso.esTotal ? '−' : ''}
              {formatCop(Math.abs(paso.cop))}
            </span>
          </div>
          <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-slate-900/5 dark:bg-white/5">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.max(1, (Math.abs(paso.cop) / mayor) * 100)}%`,
                backgroundColor: paso.color,
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
