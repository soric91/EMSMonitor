import { motion } from 'framer-motion';

type DotTone = 'emerald' | 'amber' | 'red' | 'slate';

const TONE_CLASS: Record<DotTone, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  slate: 'bg-slate-400',
};

interface OnlineDotProps {
  tone?: DotTone;
  /** La onda que se expande detrás del punto (conectado/encendido). */
  pulse?: boolean;
  /** Texto accesible que describe el estado, para lectores de pantalla. */
  label?: string;
  /** Tamaño del punto: `md` 8px (default), `sm` 6px, `lg` 10px (badge de campana). */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const DOT_SIZE = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
  lg: 'h-2.5 w-2.5',
} as const;

/**
 * El punto que transmite estado de un vistazo.
 *
 * Copiado a mano en cuatro lugares distintos (Topbar, NoticeBell, AlertsBell,
 * LiveVariableChart) con las mismas clases y el mismo `motion.span` de
 * expansión. Cada copia tenía un tamaño y un color propios; este componente
 * los parametriza en vez de volver a escribirlos.
 */
export function OnlineDot({
  tone = 'emerald',
  pulse = false,
  label,
  size = 'md',
  className,
}: OnlineDotProps) {
  const base = TONE_CLASS[tone];
  const dotSize = DOT_SIZE[size];
  return (
    <span className={`relative flex ${dotSize} ${className ?? ''}`}>
      {pulse && (
        <motion.span
          className={`absolute inline-flex h-full w-full rounded-full ${base}`}
          animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <span
        role={label ? 'status' : undefined}
        aria-label={label}
        className={`relative inline-flex h-full w-full rounded-full ${base}`}
      />
    </span>
  );
}
