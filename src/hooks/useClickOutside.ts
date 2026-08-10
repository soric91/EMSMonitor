import { useEffect, useRef } from 'react';

/**
 * Cierra un panel al hacer click fuera (o Escape).
 *
 * Antes el efecto completo se copiaba en NoticeBell, AlertsBell y el
 * Desplegable del SelectorDeMedidor: mismo listener, mismo `contains`, con
 * variaciones de Escape pegadas a mano. Aquí vive una vez.
 */
export function useClickOutside<T extends HTMLElement>(
  onOutside: () => void,
  active = true,
): React.RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;

    const onClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOutside();
    };

    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [active, onOutside]);

  return ref;
}
