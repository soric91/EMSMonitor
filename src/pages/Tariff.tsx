import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CircleAlert, Coins, Save } from 'lucide-react';
import { getTariff, updateTariff } from '../api/tariff';
import type { TariffConfig, TariffPeriod } from '../api/types';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { formatCop } from '../utils/format';

const INPUT_CLASS =
  'w-full rounded-lg border border-slate-900/10 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-white';

function currentMonth(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' })
    .format(new Date())
    .slice(0, 7);
}

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00Z`),
  );
}

export default function Tariff() {
  const [config, setConfig] = useState<TariffConfig | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [excedente, setExcedente] = useState('');
  const [umbral, setUmbral] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const [cu, setCu] = useState('');
  const [cargoFijo, setCargoFijo] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'ok' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const data = await getTariff();
        if (cancelled) return;
        setConfig(data);
        setExcedente(String(data.excedente_cop_kwh));
        setUmbral(String(data.umbral_cs_kwh));
        const existing = data.periods.find((p) => p.month === currentMonth());
        if (existing) {
          setCu(String(existing.cu_cop_kwh));
          setCargoFijo(String(existing.cargo_fijo_cop));
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Al elegir un mes que ya tiene tarifa, precargar sus valores para editarlos.
  const handleMonthChange = (nextMonth: string) => {
    setMonth(nextMonth);
    const existing = config?.periods.find((p) => p.month === nextMonth);
    if (existing) {
      setCu(String(existing.cu_cop_kwh));
      setCargoFijo(String(existing.cargo_fijo_cop));
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!config || saving) return;
    setSaving(true);
    setSaveState('idle');
    try {
      // GET fresco antes del PUT: el PUT reemplaza TODO, así que se parte del
      // estado más reciente del servidor y se superponen solo los cambios
      // locales por mes — nunca se pierde historial ajeno.
      const fresh = await getTariff();
      const byMonth = new Map<string, TariffPeriod>(fresh.periods.map((p) => [p.month, p]));
      byMonth.set(month, {
        month,
        cu_cop_kwh: Number(cu),
        cargo_fijo_cop: Number(cargoFijo),
      });
      const merged: TariffConfig = {
        excedente_cop_kwh: Number(excedente),
        umbral_cs_kwh: Number(umbral),
        periods: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)),
      };
      const saved = await updateTariff(merged);
      setConfig(saved);
      setSaveState('ok');
    } catch {
      setSaveState('error');
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return <Card className="text-sm text-red-500">No se pudo cargar la configuración de tarifa.</Card>;
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <Card>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-10 w-full" />
        </Card>
        <Card>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-32 w-full" />
        </Card>
      </div>
    );
  }

  const sortedPeriods = [...config.periods].sort((a, b) => b.month.localeCompare(a.month));
  const canSubmit = excedente !== '' && umbral !== '' && cu !== '' && cargoFijo !== '';

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Coins className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Parámetros generales</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Crédito por kWh exportado (COP)
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={excedente}
                onChange={(e) => setExcedente(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Umbral CS (kWh)
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={umbral}
                onChange={(e) => setUmbral(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
          </div>
        </Card>

        <Card>
          <p className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">Tarifa del mes</p>
          <p className="mb-4 text-xs text-slate-400">
            Si el mes ya tiene tarifa registrada, se precargan sus valores y guardar los actualiza.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">Mes</span>
              <input
                type="month"
                required
                value={month}
                onChange={(e) => handleMonthChange(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Costo por kWh importado (COP)
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={cu}
                onChange={(e) => setCu(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Cargo fijo mensual (COP)
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={cargoFijo}
                onChange={(e) => setCargoFijo(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={!canSubmit || saving}
              className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <AnimatePresence>
              {saveState === 'ok' && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                >
                  <Check className="h-3.5 w-3.5" /> Tarifa guardada
                </motion.span>
              )}
              {saveState === 'error' && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-500"
                >
                  <CircleAlert className="h-3.5 w-3.5" /> No se pudo guardar
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </Card>
      </form>

      <Card className="p-0">
        <div className="border-b border-slate-900/5 px-5 py-4 dark:border-white/5">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Historial de tarifas</p>
        </div>
        {sortedPeriods.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">Aún no hay meses registrados.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3 font-medium">Mes</th>
                <th className="px-5 py-3 font-medium">Costo kWh</th>
                <th className="px-5 py-3 font-medium">Cargo fijo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/5 dark:divide-white/5">
              {sortedPeriods.map((p) => (
                <tr key={p.month}>
                  <td className="px-5 py-2.5 capitalize text-slate-700 dark:text-slate-200">
                    {monthLabel(p.month)}
                  </td>
                  <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-white">
                    {formatCop(p.cu_cop_kwh)}
                  </td>
                  <td className="px-5 py-2.5 text-slate-700 dark:text-slate-200">
                    {formatCop(p.cargo_fijo_cop)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
