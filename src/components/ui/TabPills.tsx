import { motion } from 'framer-motion';
import { useId, useRef, type KeyboardEvent } from 'react';

interface TabPillsProps<T extends string> {
  options: { key: T; label: string }[];
  /**
   * La tab activa. `null` deja todas sin píldora (p. ej. cuando otra vista
   * temporal reemplaza la selección, como la variable extra de LiveVariableChart).
   */
  value: T | null;
  onChange: (key: T) => void;
  /**
   * Imprescindible y único por instancia: framer-motion anima el "píldora"
   * compartiendo layoutId entre renders. Dos instancias con el mismo id
   * intercambian sus animaciones. El test exige que no se repita.
   */
  layoutId: string;
  /** Clases de la píldora activa (por defecto el acento azul). */
  pillClassName?: string;
  className?: string;
  size?: 'sm' | 'md';
}

const SIZE = {
  sm: 'rounded-md px-3 py-1.5 text-xs',
  md: 'rounded-lg px-4 py-1.5 text-sm',
} as const;

/**
 * El grupo de tabs con la "píldora" (`motion.span layoutId`) que estaba
 * copiado en Reports y LiveVariableChart.
 *
 * Navegable por teclado: las flechas izquierda/derecha mueven la selección y
 * Enter/disparador por defecto del <button> la confirma.
 */
export function TabPills<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  pillClassName = 'bg-accent-500',
  className = '',
  size = 'md',
}: TabPillsProps<T>) {
  const autoId = useId();
  const pillId = layoutId || `tab-pills-${autoId}`;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const noSeleccion = value === null;

  const move = (event: KeyboardEvent, delta: number) => {
    const idx = options.findIndex((o) => o.key === value);
    const next = options[idx + delta];
    if (!next) return;
    event.preventDefault();
    refs.current[next.key]?.focus();
    onChange(next.key);
  };

  return (
    <div
      role="tablist"
      className={`inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-slate-900/10 bg-slate-900/[0.03] p-1 dark:border-white/10 dark:bg-white/5 ${className}`}
    >
      {options.map((option, i) => {
        const selected = option.key === value;
        return (
          <button
            key={option.key}
            ref={(el) => {
              refs.current[option.key] = el;
            }}
            role="tab"
            aria-selected={selected}
            tabIndex={selected || (noSeleccion && i === 0) ? 0 : -1}
            onClick={() => onChange(option.key)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') move(e, 1);
              if (e.key === 'ArrowLeft') move(e, -1);
            }}
            className={[
              'relative font-medium transition-colors',
              SIZE[size],
              selected
                ? 'text-slate-950'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
            ].join(' ')}
          >
            {selected && (
              <motion.span
                layoutId={pillId}
                className={`absolute inset-0 ${pillClassName}`}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
