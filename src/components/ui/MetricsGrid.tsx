import { Battery, Gauge, TrendingUp } from 'lucide-react';
import type { BaseLoadResult, LoadFactorResult, MaxDemandResult } from '../../api/types';
import { formatLocalDateTime, formatPercent, formatWatts } from '../../utils/format';
import { NOT_APPLICABLE } from '../../utils/labels';
import { Card } from './Card';

interface DemandaFactorCarga {
  max_demand: MaxDemandResult;
  load_factor: LoadFactorResult;
  base_load: BaseLoadResult;
}

// F0.5: los tres indicadores se calculan SOLO sobre las muestras de
// importación (TotW > 0). Con generación solar, durante la exportación no hay
// consumo medible en la acometida —no hay medidor en el inversor— y esas
// ventanas se excluyen en vez de inventar un proxy. Sin decirlo, "carga base"
// se lee como el consumo de la casa, que es otra cosa.
const SOLO_IMPORTACION = 'Calculado solo sobre las horas en que se importa de la red.';
const AYUDA = {
  max_demand: `La potencia más alta importada del periodo. ${SOLO_IMPORTACION} La hora indicada es el inicio de la ventana donde ocurrió el pico.`,
  load_factor: `Importación media dividida por la demanda pico: qué tan pareja es la carga. ${SOLO_IMPORTACION}`,
  base_load: `El consumo de fondo que nunca baja de ahí. ${SOLO_IMPORTACION}`,
};

/**
 * Demanda máxima, factor de carga y carga base.
 *
 * El grid completo estaba copiado entre `Analytics.tsx` y `Reports.tsx` con las
 * mismas tres tarjetas y los mismos tres estados (`null` → "No aplica").
 * Recibe los tres resultados calculados por el backend y los pinta en su grid.
 */
export function MetricsGrid({ max_demand, load_factor, base_load }: DemandaFactorCarga) {
  return (
    <div className="rise-grid grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card>
        <div
          title={AYUDA.max_demand}
          className="flex items-center gap-1.5 stencil text-slate-500 dark:text-slate-400"
        >
          <TrendingUp className="h-3.5 w-3.5" /> Demanda máxima
        </div>
        {max_demand.peak_power_w !== null ? (
          <>
            <p className="mt-1.5 readout text-xl text-slate-900 dark:text-white">
              {formatWatts(max_demand.peak_power_w)}
            </p>
            {max_demand.peak_at && (
              <p className="text-xs text-slate-400">{formatLocalDateTime(max_demand.peak_at)}</p>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-sm text-slate-400">{NOT_APPLICABLE}</p>
        )}
      </Card>
      <Card>
        <div
          title={AYUDA.load_factor}
          className="flex items-center gap-1.5 stencil text-slate-500 dark:text-slate-400"
        >
          <Gauge className="h-3.5 w-3.5" /> Factor de carga
        </div>
        {load_factor.load_factor !== null ? (
          <p className="mt-1.5 readout text-xl text-slate-900 dark:text-white">
            {formatPercent(load_factor.load_factor)}
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-slate-400">{NOT_APPLICABLE}</p>
        )}
      </Card>
      <Card>
        <div
          title={AYUDA.base_load}
          className="flex items-center gap-1.5 stencil text-slate-500 dark:text-slate-400"
        >
          <Battery className="h-3.5 w-3.5" /> Carga base
        </div>
        {base_load.base_load_w !== null ? (
          <p className="mt-1.5 readout text-xl text-slate-900 dark:text-white">
            {formatWatts(base_load.base_load_w)}
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-slate-400">{NOT_APPLICABLE}</p>
        )}
      </Card>
    </div>
  );
}
