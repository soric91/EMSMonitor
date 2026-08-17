import { Sun, Zap } from 'lucide-react';
import { useSiteMode } from '../../hooks/useSiteMode';

/**
 * Qué tipo de instalación se está mirando, con su capacidad si la declararon
 * en el CRM.
 *
 * Existe porque el modo cambia cómo hay que leer media pantalla —con
 * generación, el medidor de frontera solo ve el balance neto— y hasta ahora
 * eso solo se notaba indirectamente, por qué widgets aparecían.
 *
 * Cuando el modo se dedujo de los datos en vez de declararse, lo dice: no es
 * lo mismo "alguien revisó esta instalación" que "acá se exportó energía, así
 * que asumimos que hay paneles".
 */
export function SiteModeBadge() {
  const site = useSiteMode();
  if (site === null) return null;

  const conGeneracion = site.mode === 'generacion';
  const Icono = conGeneracion ? Sun : Zap;

  return (
    <span
      title={
        site.source === 'crm'
          ? 'Declarado en el CRM para esta sede.'
          : 'Deducido de la energía exportada del último mes: nadie lo declaró en el CRM.'
      }
      className={[
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
        conGeneracion
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
      ].join(' ')}
    >
      <Icono className="h-3.5 w-3.5" />
      {conGeneracion ? 'Generación propia' : 'Solo consumo'}
      {site.capacity_kwp !== null && (
        <span className="font-semibold">· {site.capacity_kwp} kWp</span>
      )}
      {site.source === 'detected' && <span className="font-normal opacity-70">(detectado)</span>}
    </span>
  );
}
