import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Las tres alturas del panel.
 *
 * Antes toda superficie era la misma tarjeta con el mismo borde y la misma
 * sombra, así que nada resaltaba y el ojo no sabía por dónde entrar. Ahora la
 * elevación dice qué mirar primero:
 *
 *   instrumento — la lectura principal de la pantalla. Lleva bisel y una sola
 *                 por vista; dos instrumentos compiten y ninguno gana.
 *   normal      — el cuerpo del panel: gráficas, listas, indicadores.
 *   hundida     — lo que envuelve a otra cosa (encabezados de panel, rieles):
 *                 se mete hacia adentro en vez de flotar.
 */
type Elevacion = 'instrumento' | 'normal' | 'hundida';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  elevacion?: Elevacion;
  /** Levanta la tarjeta al pasar el cursor. Para lo que se puede abrir o filtrar. */
  interactiva?: boolean;
}

const ELEVACION: Record<Elevacion, string> = {
  instrumento:
    'rounded-2xl border border-slate-200 bezel p-5 shadow-lg shadow-slate-900/5 dark:border-slate-700/70 dark:shadow-black/30',
  normal:
    'rounded-2xl border border-slate-900/5 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-slate-900',
  hundida:
    'rounded-2xl border border-slate-900/5 bg-slate-50 p-5 dark:border-white/5 dark:bg-slate-950/60',
};

export function Card({
  children,
  className = '',
  elevacion = 'normal',
  interactiva = false,
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        ELEVACION[elevacion],
        interactiva
          ? 'transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5 dark:hover:border-slate-600 dark:hover:shadow-black/40'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
