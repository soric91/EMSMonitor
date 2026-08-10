import { useEffect, useState } from 'react';
import { AlertTriangle, PiggyBank, Wallet } from 'lucide-react';
import { getCosts } from '../../api/costs';
import type { CostBreakdown, Period } from '../../api/types';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { formatCop, formatKwh } from '../../utils/format';
import { useVariablesDelMedidor } from '../../hooks/useVariablesDelMedidor';

interface CostoDelPeriodoProps {
  /** "hoy", "del mes" — se completa como "Importado hoy". */
  periodo: string;
  period: Period;
}

function monthLabel(month: string): string {
  // "2026-07" → "jul 2026" (mediodía UTC para esquivar corrimientos de zona)
  return new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00Z`),
  );
}

/**
 * Lo importado y lo exportado de un período, en dos tarjetas.
 *
 * Antes era una sola con el neto grande y el desglose en letra chica. El neto
 * responde "cuánto pago", pero esconde la pregunta que se hace quien tiene
 * paneles: cuánto entregué. Separarlos pone los dos números al mismo tamaño y
 * les da el color de lo que significan — ámbar lo que se paga, verde lo que se
 * acredita.
 *
 * Las dos salen de **una sola** petición: el backend ya devuelve importado,
 * exportado y neto juntos. Pedir dos veces sería traer el mismo cálculo por
 * duplicado, y con una latencia de ~190 ms contra la base eso se nota.
 *
 * La de exportado aparece solo si el medidor mide exportación. Un cliente sin
 * paneles no entrega nada nunca, y una tarjeta en cero permanente ocupa la
 * mitad del tablero para decir que no pasa nada. Es el mismo criterio que ya
 * gobierna las gráficas: no se dibuja lo que ese medidor no mide.
 *
 * Se decide por lo que el medidor **declara**, no por el valor del período: con
 * paneles, exportar cero de noche es normal, y una tarjeta que aparece y
 * desaparece según la hora sería peor que cualquiera de las dos opciones.
 */
export function CostoDelPeriodo({ periodo, period }: CostoDelPeriodoProps) {
  const [cost, setCost] = useState<CostBreakdown | null>(null);
  const [error, setError] = useState(false);
  const { porMagnitud } = useVariablesDelMedidor();
  const mideExportacion = porMagnitud.has('energia_exportada');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(false);
      try {
        const data = await getCosts(period);
        if (!cancelled) setCost(data);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [period]);

  if (error) {
    return <Card className="text-sm text-red-500">No se pudo cargar el costo {periodo}.</Card>;
  }

  if (!cost) {
    return (
      <>
        <Esqueleto />
        {mideExportacion && <Esqueleto />}
      </>
    );
  }

  // Negativo = el crédito por exportación superó al costo: saldo a favor.
  const aFavor = cost.net_cost_cop < 0;

  return (
    <>
      <Recuadro
        titulo={`Importado ${periodo}`}
        monto={cost.consumption_cost_cop}
        energia={cost.consumption_kwh}
        tono="importado"
        icono={<Wallet className="h-5 w-5" />}
        pie={
          // Sin exportación el neto es el mismo importe de arriba: repetirlo
          // solo agrega un número que hay que comparar para descubrir que es
          // igual.
          mideExportacion ? (
            <>
              Neto: {formatCop(Math.abs(cost.net_cost_cop))}
              {aFavor && ' a tu favor'}
            </>
          ) : (
            'Lo que tomaste de la red en el período'
          )
        }
        aviso={<AvisoDeTarifa cost={cost} />}
      />
      {mideExportacion && (
        <Recuadro
          titulo={`Exportado ${periodo}`}
          monto={cost.export_credit_cop}
          energia={cost.export_kwh}
          tono="exportado"
          icono={<PiggyBank className="h-5 w-5" />}
          pie="Crédito por lo que entregaste a la red"
        />
      )}
    </>
  );
}

const TONOS = {
  importado: {
    texto: 'text-slate-900 dark:text-white',
    fondo: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  exportado: {
    texto: 'text-emerald-600 dark:text-emerald-400',
    fondo: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
} as const;

interface RecuadroProps {
  titulo: string;
  monto: number;
  energia: number;
  tono: keyof typeof TONOS;
  icono: React.ReactNode;
  pie: React.ReactNode;
  aviso?: React.ReactNode;
}

function Recuadro({ titulo, monto, energia, tono, icono, pie, aviso }: RecuadroProps) {
  const { texto, fondo } = TONOS[tono];

  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{titulo}</p>
        <p className={`mt-1.5 text-2xl font-semibold ${texto}`}>{formatCop(monto)}</p>
        {/* La energía debajo del dinero: sin ella, un costo que sube no
            distingue entre haber consumido más y que subiera la tarifa. */}
        <p className="mt-1 text-xs text-slate-400">{formatKwh(energia)}</p>
        <p className="mt-1 text-xs text-slate-400">{pie}</p>
        {aviso}
      </div>
      <div className={`rounded-xl p-2 ${fondo}`}>{icono}</div>
    </Card>
  );
}

function AvisoDeTarifa({ cost }: { cost: CostBreakdown }) {
  // Va solo en la tarjeta de importado y no en las dos: es la misma advertencia
  // sobre el mismo período, y repetirla la convierte en ruido que se deja de
  // leer.
  const staleMonths = cost.stale_months ?? [];
  if (staleMonths.length === 0) return null;

  return (
    <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        Tarifa estimada con datos de {cost.months_used.map(monthLabel).join(', ')} — actualiza la
        tarifa de {staleMonths.map(monthLabel).join(', ')}
      </span>
    </p>
  );
}

function Esqueleto() {
  return (
    <Card>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-8 w-32" />
      <Skeleton className="mt-2 h-3 w-20" />
      <Skeleton className="mt-2 h-3 w-40" />
    </Card>
  );
}
