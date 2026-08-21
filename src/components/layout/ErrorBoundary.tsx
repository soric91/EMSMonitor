import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Qué se estaba mostrando, para que el aviso diga algo útil. */
  titulo?: string;
  /** Cambia este valor para volver a intentar el render (p. ej. la ruta). */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Contiene el error de un subárbol para que no se lleve la página entera.
 *
 * Sin esto, cualquier excepción durante un render o un efecto —una gráfica que
 * revienta al cambiar de pestaña, por ejemplo— hace que React desmonte TODO el
 * árbol y el cliente se queda mirando una pantalla en blanco, sin barra
 * lateral, sin menú y sin manera de volver: solo recargando.
 *
 * Es lo último que ataja, no la primera línea: quien pueda prever su fallo
 * debe manejarlo donde ocurre. Acá se cae lo que nadie previó.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Se registra en consola porque el aviso en pantalla no puede llevar el
    // detalle: al cliente no le sirve un stack, y a quien depura sí.
    console.error('Error contenido por ErrorBoundary:', error, info.componentStack);
  }

  componentDidUpdate(previos: ErrorBoundaryProps): void {
    // Al navegar a otro lado se limpia el error: lo que falló fue lo de antes.
    if (this.state.error !== null && previos.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (this.state.error === null) return this.props.children;

    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-red-500/10 p-2 text-red-500">
            <TriangleAlert className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {this.props.titulo ?? 'No se pudo mostrar esta sección'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              El resto del panel sigue funcionando. Puedes reintentar o cambiar de sección.
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-slate-900/10 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
