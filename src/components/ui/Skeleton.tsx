export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={['animate-pulse rounded-lg bg-slate-900/5 dark:bg-white/5', className].join(' ')}
    />
  );
}
