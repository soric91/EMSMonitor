export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={[
        // El pulso dice "esto todavía no es un dato"; el barrido que lo cruza,
        // que algo está llegando. Un pulso solo se lee como un hueco muerto.
        'relative animate-pulse overflow-hidden rounded-lg bg-slate-900/5 dark:bg-white/5',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-[barrido_1.6s_infinite]',
        'after:bg-gradient-to-r after:from-transparent after:via-slate-900/5 after:to-transparent',
        'dark:after:via-white/10',
        className,
      ].join(' ')}
    />
  );
}
