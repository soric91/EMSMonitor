import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Download, Lightbulb } from 'lucide-react';
import { getAnalyticsSummary } from '../../api/analytics';
import type { AnalyticsSummary as AnalyticsSummaryData } from '../../api/types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { HourlyProfileChart } from '../charts/HourlyProfileChart';
import { formatCop, formatKwh } from '../../utils/format';
import { utcHourToBogota } from '../../utils/timezone';

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00Z`),
  );
}

const STAT_CARDS: { key: keyof AnalyticsSummaryData; label: string; tone: 'import' | 'export' }[] = [
  { key: 'consumption_daily_kwh', label: 'Consumo diario (prom.)', tone: 'import' },
  { key: 'consumption_weekly_kwh', label: 'Consumo semanal (prom.)', tone: 'import' },
  { key: 'consumption_monthly_kwh', label: 'Consumo mensual', tone: 'import' },
  { key: 'export_daily_kwh', label: 'Exportación diaria (prom.)', tone: 'export' },
  { key: 'export_monthly_kwh', label: 'Exportación mensual', tone: 'export' },
];

export function AnalyticsSummary() {
  const [summary, setSummary] = useState<AnalyticsSummaryData | null>(null);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  const exportPdf = async () => {
    const element = sectionRef.current;
    if (!element || exporting) return;
    setExporting(true);
    try {
      // Carga diferida: jspdf + html2canvas-pro solo se descargan al exportar.
      // Se usa el fork -pro porque el html2canvas original no soporta los
      // colores oklch() que genera Tailwind v4.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);
      const isDark = document.documentElement.classList.contains('dark');
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: isDark ? '#020617' : '#f8fafc',
      });
      // Página única a la medida del contenido (evita cortes feos de multipágina).
      const pdf = new jsPDF({
        orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height],
      });
      // JPEG: con fondo sólido no hay pérdida visible y el archivo baja de ~8MB a <1MB.
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, canvas.width, canvas.height);
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
      pdf.save(`resumen_analitica_${today}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Sin from/to: el backend usa los últimos 30 días por defecto.
        const data = await getAnalyticsSummary();
        if (!cancelled) setSummary(data);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <Card className="text-sm text-red-500">No se pudo cargar el resumen general.</Card>;
  }

  if (!summary) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-7 w-20" />
            </Card>
          ))}
        </div>
        <Card>
          <Skeleton className="h-[260px] w-full" />
        </Card>
      </div>
    );
  }

  const eff = summary.efficiency;

  // Los buckets de hora del backend vienen en UTC; se muestran en hora Bogotá.
  const localProfile = summary.hourly_profile
    .map((p) => ({ ...p, hour: utcHourToBogota(p.hour) }))
    .sort((a, b) => a.hour - b.hour);
  const peakConsumptionLocal =
    summary.peak_consumption_hour !== null ? utcHourToBogota(summary.peak_consumption_hour) : null;
  const peakExportLocal =
    summary.peak_export_hour !== null ? utcHourToBogota(summary.peak_export_hour) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          Resumen general <span className="font-normal text-slate-400">· últimos 30 días</span>
        </p>
        <button
          onClick={() => void exportPdf()}
          disabled={exporting}
          className="flex items-center gap-1.5 rounded-lg border border-slate-900/10 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 disabled:opacity-60 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <Download className="h-3.5 w-3.5" />
          {exporting ? 'Exportando…' : 'Exportar resumen'}
        </button>
      </div>

      <div ref={sectionRef} className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {STAT_CARDS.map(({ key, label, tone }) => (
          <Card key={key} className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
              <p className="mt-1.5 text-xl font-semibold text-slate-900 dark:text-white">
                {formatKwh(summary[key] as number)}
              </p>
            </div>
            <div
              className={[
                'rounded-xl p-1.5',
                tone === 'import'
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              ].join(' ')}
            >
              {tone === 'import' ? (
                <ArrowDownToLine className="h-4 w-4" />
              ) : (
                <ArrowUpFromLine className="h-4 w-4" />
              )}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Perfil horario promedio (últimos 30 días)
          </p>
          <div className="flex gap-2 text-[11px] text-slate-400">
            {peakConsumptionLocal !== null && (
              <span className="text-amber-600 dark:text-amber-400">
                pico de consumo: {peakConsumptionLocal}:00
              </span>
            )}
            {peakExportLocal !== null && (
              <span className="text-emerald-600 dark:text-emerald-400">
                pico de exportación: {peakExportLocal}:00
              </span>
            )}
          </div>
        </div>
        <HourlyProfileChart
          profile={localProfile}
          peakConsumptionHour={peakConsumptionLocal}
          peakExportHour={peakExportLocal}
        />
      </Card>

      {eff && (
        <Card className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Oportunidad de eficiencia
              </p>
              {eff.stale && (
                <Badge tone="amber">
                  <AlertTriangle className="h-3 w-3" /> tarifa desactualizada ({monthLabel(eff.tariff_month)})
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Podrías haber ahorrado <strong>hasta ~{formatCop(eff.potential_savings_cop)}</strong> este
              mes si hubieras desplazado consumo a tus horas de mayor generación
              {peakExportLocal !== null && <> (alrededor de las {peakExportLocal}:00)</>}.
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Estimación tope: asume autoconsumir los {formatKwh(eff.export_kwh)} exportados del mes en
              vez de venderlos a {formatCop(eff.excedente_cop_kwh)}/kWh (compras a{' '}
              {formatCop(eff.cu_cop_kwh)}/kWh). El ahorro real depende de qué consumos puedas mover.
            </p>
          </div>
        </Card>
      )}
      </div>
    </div>
  );
}
