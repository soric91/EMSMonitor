import type { Magnitud, VariableDisponible } from '../api/types';

// Acá queda solo lo que es decisión del panel: cómo se pinta y cómo se llama
// un grupo. La etiqueta, la unidad y qué variables existen vienen del backend
// —son datos, no presentación— y duplicarlos acá fue lo que dejó a la fase C
// fuera de los grupos durante meses.

export type VariableColorMode = 'power' | 'import' | 'export' | 'neutral';

/**
 * Cómo colorear una serie.
 *
 * `power` es un caso aparte: la potencia activa total viene con signo en una
 * acometida bidireccional, así que el color depende del valor —importando o
 * exportando— y no de la magnitud sola.
 */
export function colorModeFor(magnitud: Magnitud | null): VariableColorMode {
  switch (magnitud) {
    case 'potencia_activa':
      return 'power';
    case 'energia_importada':
    case 'energia_reactiva_importada':
      return 'import';
    case 'energia_exportada':
    case 'energia_reactiva_exportada':
      return 'export';
    default:
      return 'neutral';
  }
}

/** Nombre corto del grupo, para las pestañas. La etiqueta de cada variable ya viene del backend. */
const ETIQUETA_MAGNITUD: Record<Magnitud, string> = {
  tension: 'Voltaje',
  tension_compuesta: 'Voltaje L-L',
  corriente: 'Corriente',
  potencia_activa: 'Potencia',
  potencia_reactiva: 'Reactiva',
  potencia_aparente: 'Aparente',
  factor_potencia: 'F. potencia',
  frecuencia: 'Frecuencia',
  energia_importada: 'Energía importada',
  energia_exportada: 'Energía exportada',
  energia_reactiva_importada: 'Reactiva importada',
  energia_reactiva_exportada: 'Reactiva exportada',
  estado_digital: 'Estados',
};

export function etiquetaMagnitud(magnitud: Magnitud): string {
  return ETIQUETA_MAGNITUD[magnitud];
}

/**
 * En qué orden se ofrecen los grupos. Lo que se mira todo el día primero.
 *
 * Una magnitud que no esté acá igual se muestra, al final: el catálogo puede
 * crecer sin que haya que tocar esta lista, y omitir una variable que el
 * cliente sí tiene sería peor que ponerla en un orden discutible.
 */
const ORDEN_MAGNITUD: Magnitud[] = [
  'potencia_activa',
  'tension',
  'corriente',
  'factor_potencia',
  'frecuencia',
  'potencia_reactiva',
  'potencia_aparente',
  'tension_compuesta',
];

export function ordenarMagnitudes(magnitudes: Magnitud[]): Magnitud[] {
  return [...magnitudes].sort((a, b) => {
    const ia = ORDEN_MAGNITUD.indexOf(a);
    const ib = ORDEN_MAGNITUD.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/**
 * Los contadores acumulados no se grafican en vivo: crecen monótonos y la
 * serie es una recta sin información. El consumo real ya se muestra como
 * diferencias en Consumo/Exportación.
 */
export function esGraficableEnVivo(variable: VariableDisponible): boolean {
  return !variable.acumulativa && variable.magnitud !== 'estado_digital';
}
