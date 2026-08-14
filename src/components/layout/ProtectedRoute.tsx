import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, mustChangePassword, necesitaElegirProyecto } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500/30 border-t-accent-500" />
      </div>
    );
  }

  // La contraseña pendiente no es "no autenticado": la sesión existe, pero su
  // token solo abre el cambio de contraseña. Mandarla al login la dejaría
  // dando vueltas —entra bien y vuelve a la misma pantalla— que es justo lo
  // que pasaba antes de que esta ruta existiera.
  if (mustChangePassword) {
    return <Navigate to="/cambiar-password" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Un administrador entra sin empresa: no hay tablero que mostrarle hasta
  // que elija cuál mirar. Mandarlo al dashboard le daría una pantalla de
  // errores 403, que es la forma más confusa posible de decir "elegí uno".
  if (necesitaElegirProyecto && location.pathname !== '/proyectos') {
    return <Navigate to="/proyectos" replace />;
  }

  return <Outlet />;
}
