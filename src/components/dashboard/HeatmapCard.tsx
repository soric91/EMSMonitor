import { useEffect, useMemo, useState } from 'react';
import { getHeatmap } from '../../api/analytics';
import type { HeatmapMetric, HeatmapResult } from '../../api/types';
import { useDevice } from '../../hooks/useDevice';
import { useSiteMode } from '../../hooks/useSiteMode';
import { CalendarHeatmap } from '../charts/CalendarHeatmap';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { TabPills } from '../ui/TabPills';
import { formatCop, formatKwh } from '../../utils/format';

/**
 * El mapa de calor del rango, con su selector de métrica.
 *
 * Exportación y balance neto solo se ofrecen en sedes con generación propia:
 * en una instalación de consumo puro serían dos pestañas condenadas a estar
 * siempre en cero (ver `useSiteMode`).
 */

// Etiquetas distintas a las de las tarjetas de totales de la página
// ("Importado"/"Exportado"): son otra cosa —el reparto por hora, no el total—
// y repetir la palabra deja dos cosas iguales en pantalla que no lo son.
const METRICAS: { key: HeatmapMetric; label: string; soloConGeneracion: boolean }[] = [
  { key: 'import', label: 'Consumo', soloConGeneracion: false },
  { key: 'cost', label: 'Costo', soloConGeneracion: false },
  { key: 'export', label: 'Exportación', soloConGeneracion: true },
  { key: 'net', label: 'Neto', soloConGeneracion: true },
];

interface HeatmapCardProps {
  fromIso: string;
  toIso: string;
}

export function HeatmapCard({ fromIso, toIso }: HeatmapCardProps) {
  const { selectedDeviceId } = useDevice();
  const siteMode = useSiteMode();
  const [metric, setMetric] = useState<HeatmapMetric>('import');
  const [data, setData] = useState<HeatmapResult | null>(null);
  const [error, setError] = useState(false);

  const opciones = useMemo(
    () =>
      METRICAS.filter((m) => !m.soloConGeneracion || siteMode?.mode === 'generacion').map(
        ({ key, label }) => ({ key, label }),
      ),
    [siteMode],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setError(false);
      try {
        const result = await getHeatmap({
          from: fromIso,
          to: toIso,
          metric,
          device_id: selectedDeviceId ?? undefined,
        });
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [fromIso, toIso, metric, selectedDeviceId]);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="stencil text-slate-500 dark:text-slate-400">Mapa de calor por hora</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Cada fila es un día y cada columna una hora: acá saltan los patrones que una línea
            esconde.
          </p>
        </div>
        <TabPills
          layoutId="heatmap-metric-pill"
          size="sm"
          options={opciones}
          value={metric}
          onChange={setMetric}
        />
      </div>

      {error && <p className="text-sm text-red-500">No se pudo cargar el mapa de calor.</p>}
      {!error && data === null && <Skeleton className="h-[240px] w-full" />}
      {!error && data !== null && (
        <CalendarHeatmap
          data={data}
          valueFormatter={(value) => (data.unit === 'COP' ? formatCop(value) : formatKwh(value))}
        />
      )}
    </Card>
  );
}
