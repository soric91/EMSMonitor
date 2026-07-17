import type { ReactNode } from 'react';

type BadgeTone = 'emerald' | 'amber' | 'slate' | 'red';

const TONE_CLASSES: Record<BadgeTone, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export function Badge({ tone = 'slate', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        TONE_CLASSES[tone],
      ].join(' ')}
    >
      {children}
    </span>
  );
}
