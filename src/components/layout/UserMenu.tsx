import { LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

/**
 * Con quién entraste, y cómo salir.
 *
 * Extraído de `Topbar` para que la pantalla de proyectos lo use también. Esa
 * pantalla no puede montar el `Topbar` entero: depende de `useRealtime` y
 * `useDevice`, que necesitan una empresa elegida, y ahí todavía no hay
 * ninguna. Lo único que sí aplica en las dos es esto.
 */
export function UserMenu() {
  const { user, logout } = useAuth();

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        {(user?.email ?? '?').slice(0, 1).toUpperCase()}
      </div>
      <span className="hidden text-sm font-medium text-slate-700 sm:inline dark:text-slate-200">
        {user?.email}
      </span>
      <button
        onClick={() => void logout()}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-500 dark:text-slate-400"
        title="Cerrar sesión"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
