import { WifiOff } from 'lucide-react';
import { useDevice } from '../../hooks/useDevice';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';

/**
 * El estado de los dispositivos (OPERACIÓN): cada gateway con sus medidores y
 * si está reportando. Sin petición propia: lee el inventario que DeviceProvider
 * ya trajo —agregar otra llamada sería el error que /devices vino a resolver.
 */
export function DeviceStatus() {
  const { gateways, cargando, error } = useDevice();

  if (error) {
    return <Card className="text-sm text-red-500">No se pudo cargar el inventario.</Card>;
  }

  if (cargando) {
    return (
      <Card className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </Card>
    );
  }

  if (gateways.length === 0) {
    return <Card className="text-sm text-slate-400">Sin dispositivos.</Card>;
  }

  return (
    <Card className="space-y-3">
      <p className="stencil text-slate-500 dark:text-slate-400">Dispositivos</p>
      <ul className="divide-y divide-slate-900/5 dark:divide-white/5">
        {gateways.map((gateway) => (
          <li key={gateway.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                  {gateway.serie}
                </p>
                <p className="text-[11px] text-slate-400">{gateway.sede}</p>
              </div>
              <Badge tone={gateway.enLinea ? 'emerald' : 'red'}>
                {gateway.enLinea ? 'en línea' : 'sin conexión'}
              </Badge>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {gateway.medidores.map((medidor) => (
                <li
                  key={medidor.device_id}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-900/10 px-2 py-0.5 text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400"
                >
                  {medidor.nombre}
                  {!gateway.enLinea && <WifiOff className="h-3 w-3 shrink-0 text-amber-500" />}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}
