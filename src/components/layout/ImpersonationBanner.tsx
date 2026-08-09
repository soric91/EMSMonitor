import { useState } from 'react';
import { Eye, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

/**
 * El aviso de que estos números son de otra empresa.
 *
 * No es decoración. Todas las pantallas se ven exactamente igual que para un
 * cliente —esa es la idea— así que sin este aviso nada distingue "mi consumo"
 * de "el consumo de una empresa que estoy revisando", y un administrador
 * termina decidiendo sobre los datos equivocados.
 *
 * Por eso va arriba de todo, no se puede cerrar, y trae la salida al lado: si
 * volver costara buscar en un menú, la tentación sería quedarse.
 */
export function ImpersonationBanner() {
  const { suplantando, salirDelProyecto } = useAuth();
  const [saliendo, setSaliendo] = useState(false);

  if (!suplantando) return null;

  async function salir() {
    setSaliendo(true);
    try {
      await salirDelProyecto();
    } catch {
      setSaliendo(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-1.5 text-xs font-medium text-amber-950">
      <span className="flex items-center gap-1.5">
        <Eye className="h-3.5 w-3.5" />
        Estás viendo los datos de otra empresa
      </span>
      <button
        onClick={() => void salir()}
        disabled={saliendo}
        className="flex items-center gap-1 rounded-md bg-amber-950/10 px-2 py-0.5 transition hover:bg-amber-950/20 disabled:opacity-60"
      >
        <LogOut className="h-3 w-3" />
        {saliendo ? 'saliendo…' : 'Volver a proyectos'}
      </button>
    </div>
  );
}
