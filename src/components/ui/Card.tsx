import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <div
      className={[
        'rounded-2xl border border-slate-900/5 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-slate-900',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
