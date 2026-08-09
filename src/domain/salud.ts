import type { Proyecto } from '../api/types';

/**
 * Qué le falta a un proyecto para estar midiendo.
 *
 * La cadena tiene que estar completa de punta a punta: una empresa necesita
 * una sede, la sede un gateway, el gateway un medidor, y el medidor variables
 * cargadas. Cortada en cualquier eslabón no llega un solo dato, y hasta ahora
 * eso solo se descubría entrando al proyecto y viendo un tablero en cero —
 * indistinguible de un medidor apagado.
 *
 * Todo sale de los conteos de `/fleet/summary`. No se consulta InfluxDB: la
 * pregunta "¿está configurado?" se responde entera con lo que hay en el CRM.
 */

export type Nivel = 'incompleto' | 'atencion' | 'ok';

export interface Diagnostico {
  nivel: Nivel;
  /** Una línea, la que hay que leer. No una lista de todo lo que falta. */
  mensaje: string;
}

export function diagnosticar(proyecto: Proyecto): Diagnostico {
  // El orden es el de la cadena, no el de gravedad. Decirle a alguien que su
  // gateway está sin conexión cuando todavía no cargó ninguna sede lo manda a
  // buscar un problema que no tiene: lo que falta es lo primero que falta.
  if (proyecto.sedes === 0) {
    return { nivel: 'incompleto', mensaje: 'Sin sedes cargadas' };
  }
  if (proyecto.gateways === 0) {
    return { nivel: 'incompleto', mensaje: 'Sin gateway instalado' };
  }
  if (proyecto.equipos === 0) {
    return { nivel: 'incompleto', mensaje: 'Sin medidores' };
  }
  if (proyecto.variables === 0) {
    // El caso silencioso: todo el hardware está, y no mide nada.
    return { nivel: 'incompleto', mensaje: 'Medidores sin variables' };
  }
  if (proyecto.gateways_en_linea === 0) {
    return { nivel: 'atencion', mensaje: 'Sin conexión' };
  }
  if (proyecto.gateways_en_linea < proyecto.gateways) {
    const caidos = proyecto.gateways - proyecto.gateways_en_linea;
    return {
      nivel: 'atencion',
      mensaje: caidos === 1 ? '1 gateway sin conexión' : `${caidos} gateways sin conexión`,
    };
  }
  return { nivel: 'ok', mensaje: 'Operando' };
}

// Los que hay que atender primero. Una lista ordenada por nombre esconde el
// proyecto roto entre veinte que andan bien.
const PRIORIDAD: Record<Nivel, number> = { incompleto: 0, atencion: 1, ok: 2 };

export function porUrgencia(a: Proyecto, b: Proyecto): number {
  const diferencia = PRIORIDAD[diagnosticar(a).nivel] - PRIORIDAD[diagnosticar(b).nivel];
  // Empate: alfabético, para que el orden no cambie entre recargas.
  return diferencia !== 0 ? diferencia : a.nombre_empresa.localeCompare(b.nombre_empresa);
}

/**
 * Hace cuánto que no se conecta ningún gateway, en texto corto.
 *
 * `null` cuando ninguno reportó nunca: eso no es "hace mucho", es que la
 * instalación todavía no arrancó, y decir "hace 56 años" sería absurdo.
 */
export function desdeUltimaConexion(iso: string | null, ahora = Date.now()): string | null {
  if (iso === null) return null;

  const minutos = Math.floor((ahora - Date.parse(iso)) / 60_000);
  if (minutos < 1) return 'recién';
  if (minutos < 60) return `hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}
