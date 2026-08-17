import { useEffect, useMemo, useState } from 'react';
import { getHistoryDownsample } from '../api/history';
import type { Magnitud } from '../api/types';
import { useDevice } from './useDevice';
import { useVariablesDelMedidor } from './useVariablesDelMedidor';

/**
 * Los kWh de cada uno de los últimos días, para las miniseries de los KPIs.
 *
 * Sale de `/history/downsample`, que va cacheado (TTL corto) y ya lo usa el
 * backfill de la gráfica en vivo: pedirlo acá no agrega presión nueva sobre
 * InfluxDB.
 *
 * Los nombres de los contadores NO se escriben acá: se buscan por magnitud en
 * el catálogo del medidor. Escribir `TotWh_import` en el panel sería la
 * segunda lista de variables que el proyecto ya pagó caro una vez.
 */

const DIA_MS = 86_400_000;

export interface EnergiaDiaria {
  importado: number[];
  exportado: number[];
}

export function useEnergiaDiaria(dias: number, activo: boolean): EnergiaDiaria {
  const { selectedDeviceId } = useDevice();
  const { porMagnitud } = useVariablesDelMedidor();
  const [energia, setEnergia] = useState<EnergiaDiaria>({ importado: [], exportado: [] });

  const nombreDe = useMemo(
    () =>
      (magnitud: Magnitud): string | null =>
        porMagnitud.get(magnitud)?.[0]?.nombre ?? null,
    [porMagnitud],
  );

  const importada = nombreDe('energia_importada');
  const exportada = nombreDe('energia_exportada');

  useEffect(() => {
    if (!activo || !selectedDeviceId || importada === null) return;
    let cancelled = false;

    async function run() {
      const to = new Date();
      const from = new Date(to.getTime() - dias * DIA_MS);
      const rango = {
        from: from.toISOString(),
        to: to.toISOString(),
        target_points: dias,
        device_id: selectedDeviceId ?? undefined,
      };

      const [imp, exp] = await Promise.all([
        getHistoryDownsample({ ...rango, variable: importada! }).catch(() => null),
        exportada === null
          ? Promise.resolve(null)
          : getHistoryDownsample({ ...rango, variable: exportada }).catch(() => null),
      ]);
      if (cancelled) return;
      setEnergia({
        importado: imp?.points.map((p) => p.value) ?? [],
        exportado: exp?.points.map((p) => p.value) ?? [],
      });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [activo, dias, selectedDeviceId, importada, exportada]);

  return energia;
}
