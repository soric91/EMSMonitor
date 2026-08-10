import { useMemo } from 'react';
import { useDevice } from './useDevice';
import { useVariables } from './useVariables';
import { agruparPorMagnitud } from '../types/variable';
import type { Variable, VariableDisponible } from '../api/types';

/**
 * Las variables que reporta **el medidor elegido**, no las de toda la empresa.
 *
 * `GET /variables` devuelve la unión de todos los medidores del cliente: si uno
 * mide frecuencia y otro no, la frecuencia aparece en la lista con el equipo
 * que la reporta anotado en `equipos`. El panel ignoraba ese campo y dibujaba
 * la unión, así que al elegir un medidor se ofrecían magnitudes que ese medidor
 * no mide y la gráfica quedaba vacía para siempre.
 *
 * Es el mismo error que la fase C de un monofásico, un nivel más arriba: con un
 * solo medidor la unión y el subconjunto coinciden, y por eso no se veía.
 *
 * Sin medidor elegido devuelve todo, que es lo correcto: no se puede filtrar
 * por algo que todavía no se decidió.
 *
 * Vive en un hook y no dentro de `VariablesProvider` porque ese provider está
 * por fuera de `DeviceProvider` —el orden lo decide quién necesita a quién al
 * abrir el WebSocket— y un contexto no puede leer a otro que lo envuelve.
 */
export function useVariablesDelMedidor() {
  const { variables, porNombre, cargando, error, declaradas } = useVariables();
  const { selectedDeviceId } = useDevice();

  return useMemo(() => {
    const propias =
      selectedDeviceId === null
        ? variables
        : variables.filter((v) => v.equipos.includes(selectedDeviceId));

    const porNombreFiltrado: ReadonlyMap<Variable, VariableDisponible> =
      selectedDeviceId === null ? porNombre : new Map(propias.map((v) => [v.nombre, v]));

    const porMagnitud = agruparPorMagnitud(propias);

    return {
      variables: propias,
      porNombre: porNombreFiltrado,
      porMagnitud,
      cargando,
      error,
      declaradas,
    };
  }, [variables, porNombre, selectedDeviceId, cargando, error, declaradas]);
}
