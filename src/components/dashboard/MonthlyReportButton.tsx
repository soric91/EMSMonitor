import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { getAlertsHistory } from '../../api/alerts';
import { getBenchmark, getBaseloadTrend, getDayArchetypes, getHeatmap } from '../../api/analytics';
import { getCoverage } from '../../api/analytics';
import { getBillForecast } from '../../api/forecast';
import { getCustomReport } from '../../api/reports';
import type { DatosInformeMensual } from '../../domain/informeMensual';
import { useDevice } from '../../hooks/useDevice';
import { startOfLocalMonth } from '../../utils/timezone';

/**
 * Arma el informe del periodo en pantalla y lo descarga.
 *
 * Las ocho consultas van juntas y solo al hacer clic: es una descarga que el
 * usuario pidió, no algo que la página deba pagar al abrirse. Las accesorias
 * se piden con `catch(() => null)` — que falte el ranking de sedes no puede
 * impedir que el cliente se lleve su informe.
 *
 * El rango llega por props. Antes el botón calculaba SIEMPRE el mes en curso,
 * así que quien estaba mirando julio se bajaba un informe de agosto sin que
 * nada en pantalla lo avisara. Sin rango —la página todavía no cargó ningún
 * reporte— cae al mes en curso, que es el único supuesto razonable.
 */

interface MonthlyReportButtonProps {
  /** El periodo del reporte que se está viendo, en ISO UTC. */
  desde?: string;
  hasta?: string;
}

function mesEnCurso(): { desde: string; hasta: string } {
  return { desde: startOfLocalMonth(0).toISOString(), hasta: new Date().toISOString() };
}

export function MonthlyReportButton({ desde, hasta }: MonthlyReportButtonProps) {
  const { selectedDeviceId, devices } = useDevice();
  const [generando, setGenerando] = useState(false);

  const generar = async () => {
    if (generando || !selectedDeviceId) return;
    setGenerando(true);
    try {
      const periodo = desde && hasta ? { desde, hasta } : mesEnCurso();
      const rango = { from: periodo.desde, to: periodo.hasta, device_id: selectedDeviceId };
      const sede = devices.find((d) => d.device_id === selectedDeviceId);

      const [
        reporte,
        proyeccion,
        cobertura,
        cargaBase,
        heatmap,
        historial,
        arquetipos,
        comparacion,
      ] = await Promise.all([
        getCustomReport(rango),
        getBillForecast({ device_id: selectedDeviceId }).catch(() => null),
        getCoverage(rango).catch(() => null),
        getBaseloadTrend(rango).catch(() => null),
        getHeatmap({ ...rango, metric: 'import' }).catch(() => null),
        getAlertsHistory({ device_id: selectedDeviceId }).catch(() => null),
        getDayArchetypes({ device_id: selectedDeviceId }).catch(() => null),
        getBenchmark({ device_id: selectedDeviceId }).catch(() => null),
      ]);

      const datos: DatosInformeMensual = {
        sede: sede ? `${sede.sede} · ${sede.nombre}` : 'Instalación',
        reporte,
        proyeccion,
        cobertura,
        cargaBase,
        heatmap,
        historial,
        arquetipos,
        comparacion,
      };

      // Import diferido: jsPDF pesa más que toda la página y solo hace falta
      // cuando alguien pide el informe.
      const { buildMonthlyReportPdf } = await import('../../utils/monthlyReportPdf');
      await buildMonthlyReportPdf(datos);
    } finally {
      setGenerando(false);
    }
  };

  return (
    <button
      onClick={() => void generar()}
      disabled={generando || !selectedDeviceId}
      className="flex items-center gap-1.5 rounded-lg border border-slate-900/10 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 disabled:opacity-60 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
    >
      <FileDown className="h-3.5 w-3.5" />
      {generando ? 'Generando informe…' : 'Informe del periodo (PDF)'}
    </button>
  );
}
