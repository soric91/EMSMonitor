import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { listVariables } from '../api/variables';
import { agruparPorMagnitud } from '../types/variable';
import type { Magnitud, Variable, VariableDisponible } from '../api/types';

// Qué se puede graficar, para toda la app.
//
// Antes cada pantalla partía de `VARIABLE_META`, una tabla escrita a mano con
// las catorce variables que existían el día que se escribió. Eso traía dos
// problemas al mismo tiempo: un medidor que reporta menos mostraba gráficas
// vacías —la fase C de un monofásico— y uno que reporta más no mostraba lo
// que sí tenía, porque no estaba en la tabla.
//
// Ahora la lista llega del backend, ya cruzada contra InfluxDB: si está acá,
// tiene datos. Las etiquetas vienen del catálogo de CRMBackend, así que el
// nombre técnico (`PhV_phsA`) nunca se le muestra a nadie y no hay una
// segunda traducción que se pueda desincronizar.
//
// Se pide una sola vez: es una lista corta que cambia cuando alguien da de
// alta una variable en el CRM, no entre pantalla y pantalla.

interface VariablesContextValue {
  /** Solo las que tienen datos: es lo único que se puede graficar. */
  variables: VariableDisponible[];
  /**
   * Cuántas declara el CRM, tengan datos o no.
   *
   * Separa dos fallas que antes se veían idénticas —lista vacía en ambas— y
   * se arreglan en lados opuestos: `0` es que falta configurar el medidor en
   * el CRM; mayor que `0` con `variables` vacío es que el CRM está bien y lo
   * que falla es la adquisición o el almacenamiento.
   */
  declaradas: number;
  /** Por nombre canónico, para resolver una etiqueta o una unidad. */
  porNombre: ReadonlyMap<Variable, VariableDisponible>;
  /** Agrupadas por lo que miden. El orden de fases dentro de cada grupo es A, B, C. */
  porMagnitud: ReadonlyMap<Magnitud, VariableDisponible[]>;
  cargando: boolean;
  /** La petición falló. Distinto de "no hay variables", que es una lista vacía. */
  error: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export const VariablesContext = createContext<VariablesContextValue | null>(null);

export function VariablesProvider({ children }: { children: ReactNode }) {
  // Se guarda la respuesta entera y el filtro se aplica al derivar: el conteo
  // de declaradas se pierde si se filtra al recibir.
  const [declaradas, setDeclaradas] = useState<VariableDisponible[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function cargar() {
      try {
        const disponibles = await listVariables();
        if (cancelled) return;
        setDeclaradas(disponibles);
        setError(false);
      } catch {
        // Se distingue de una lista vacía a propósito: sin datos todavía es un
        // estado normal, no poder preguntar no lo es, y la pantalla debería
        // decir cosas distintas en cada caso.
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setCargando(false);
      }
    }

    void cargar();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<VariablesContextValue>(() => {
    // El filtro vive acá y no en el backend: el panel dibuja solo lo que tiene
    // datos, pero necesita saber que las otras existen para no acusar al CRM.
    const variables = declaradas.filter((v) => v.con_datos);
    const porNombre = new Map(variables.map((v) => [v.nombre, v]));
    const porMagnitud = agruparPorMagnitud(variables);

    return {
      variables,
      declaradas: declaradas.length,
      porNombre,
      porMagnitud,
      cargando,
      error,
    };
  }, [declaradas, cargando, error]);

  return <VariablesContext.Provider value={value}>{children}</VariablesContext.Provider>;
}
