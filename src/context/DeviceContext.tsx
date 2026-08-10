import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { listDevices } from '../api/devices';
import type { DeviceDisponible } from '../api/types';

// Qué medidores existen, para toda la app.
//
// Antes salía de `GET /realtime/latest`, que devuelve el último valor en
// memoria de cada equipo que publicó **desde que ApiEMS arrancó**. Con esa
// fuente pasaban tres cosas:
//
//   * Al reiniciar ApiEMS el selector quedaba vacío hasta que llegara la
//     primera lectura de cada equipo.
//   * Un gateway caído hacía desaparecer sus medidores. No se podían elegir ni
//     consultar su histórico, que sí está guardado en InfluxDB.
//   * No había con qué agrupar: el estado en memoria no sabe de sedes ni de
//     gateways, solo de equipos sueltos.
//
// Ahora sale de `GET /devices`, que es el inventario del CRM — donde los
// equipos se dan de alta. Un medidor aparece porque existe, no porque haya
// hablado hace poco.
//
// Se pide una sola vez: el inventario cambia cuando alguien da de alta un
// equipo en el CRM, no entre pantalla y pantalla.

export interface GatewayDisponible {
  id: string;
  /** Su número de serie, que es como lo nombra quien lo instaló. */
  serie: string;
  sede: string;
  enLinea: boolean;
  medidores: DeviceDisponible[];
}

interface DeviceContextValue {
  devices: DeviceDisponible[];
  /** Los gateways del cliente, cada uno con sus medidores. */
  gateways: GatewayDisponible[];
  /** El gateway elegido. Arranca en el primero: no hay nada que decidir. */
  selectedGatewayId: string | null;
  setSelectedGatewayId: (gatewayId: string) => void;
  /**
   * El medidor elegido, siempre uno del gateway elegido.
   *
   * `null` solo mientras carga el inventario. En cuanto llega se elige el
   * primero: dejarlo sin elegir haría que el panel muestre la mezcla de todos
   * los medidores, que es justo lo que no queremos — cada medidor mide su
   * propia acometida.
   */
  selectedDeviceId: string | null;
  setSelectedDeviceId: (deviceId: string) => void;
  cargando: boolean;
  /** La petición falló. Distinto de "no tiene medidores", que es lista vacía. */
  error: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [devices, setDevices] = useState<DeviceDisponible[]>([]);
  const [selectedGatewayId, setSelectedGatewayIdState] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function cargar() {
      try {
        const inventario = await listDevices();
        if (cancelled) return;
        setDevices(inventario);
        setError(false);
        // Elegir el primero acá y no en el selector: cualquier pantalla puede
        // pedir datos apenas monta, y sin medidor elegido pediría los de toda
        // la empresa mezclados.
        const primero = inventario[0];
        if (primero !== undefined) {
          setSelectedGatewayIdState(primero.gateway_id);
          setSelectedDeviceIdState(primero.device_id);
        }
      } catch {
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

  const gateways = useMemo(() => {
    // El backend ya ordena por sede, gateway y nombre, así que agrupar es
    // recorrer una vez. Reordenar acá arriesgaría que el panel del cliente y
    // el del operador muestren la misma instalación en distinto orden.
    const salida: GatewayDisponible[] = [];
    for (const medidor of devices) {
      const ultimo = salida[salida.length - 1];
      if (ultimo !== undefined && ultimo.id === medidor.gateway_id) {
        ultimo.medidores.push(medidor);
        continue;
      }
      salida.push({
        id: medidor.gateway_id,
        serie: medidor.gateway,
        sede: medidor.sede,
        enLinea: medidor.gateway_en_linea,
        medidores: [medidor],
      });
    }
    return salida;
  }, [devices]);

  const setSelectedGatewayId = useCallback(
    (gatewayId: string) => {
      setSelectedGatewayIdState(gatewayId);
      // Cambiar de gateway mueve el medidor al primero del nuevo. Dejar el
      // anterior elegido mostraría datos de un gateway distinto del que dice
      // el selector de arriba — dos indicadores contradiciéndose.
      const gateway = gateways.find((g) => g.id === gatewayId);
      const primero = gateway?.medidores[0];
      if (primero !== undefined) setSelectedDeviceIdState(primero.device_id);
    },
    [gateways],
  );

  const setSelectedDeviceId = useCallback((deviceId: string) => {
    setSelectedDeviceIdState(deviceId);
  }, []);

  const value = useMemo<DeviceContextValue>(
    () => ({
      devices,
      gateways,
      selectedGatewayId,
      setSelectedGatewayId,
      selectedDeviceId,
      setSelectedDeviceId,
      cargando,
      error,
    }),
    [
      devices,
      gateways,
      selectedGatewayId,
      setSelectedGatewayId,
      selectedDeviceId,
      setSelectedDeviceId,
      cargando,
      error,
    ],
  );

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}
