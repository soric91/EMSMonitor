import { createContext, useCallback, useState, type ReactNode } from 'react';
import type { Variable } from '../api/types';
import { hoursAgoLocalInput, localInputToUtcIso, nowLocalInput } from '../utils/timezone';

interface DashboardFiltersValue {
  variable: Variable;
  fromIso: string;
  toIso: string;
  setVariable: (variable: Variable) => void;
  setRange: (fromIso: string, toIso: string) => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const DashboardFiltersContext = createContext<DashboardFiltersValue | null>(null);

export function DashboardFiltersProvider({ children }: { children: ReactNode }) {
  // Potencia activa total: lo que casi siempre se quiere ver primero. Si este
  // medidor no la reporta, la pantalla cambia a la primera que sí tenga —el
  // default es una preferencia, no una promesa de que exista.
  const [variable, setVariable] = useState<Variable>('TotW');
  const [fromIso, setFromIso] = useState(() => localInputToUtcIso(hoursAgoLocalInput(24)));
  const [toIso, setToIso] = useState(() => localInputToUtcIso(nowLocalInput()));

  const setRange = useCallback((nextFrom: string, nextTo: string) => {
    setFromIso(nextFrom);
    setToIso(nextTo);
  }, []);

  return (
    <DashboardFiltersContext.Provider value={{ variable, fromIso, toIso, setVariable, setRange }}>
      {children}
    </DashboardFiltersContext.Provider>
  );
}
