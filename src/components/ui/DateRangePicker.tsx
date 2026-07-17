import { hoursAgoLocalInput, localInputToUtcIso, nowLocalInput, utcIsoToLocalInput } from '../../utils/timezone';

interface DateRangePickerProps {
  fromIso: string;
  toIso: string;
  onChange: (fromIso: string, toIso: string) => void;
}

const PRESETS = [
  { label: 'Últimas 24h', hours: 24 },
  { label: 'Últimos 7 días', hours: 24 * 7 },
  { label: 'Últimos 30 días', hours: 24 * 30 },
] as const;

export function DateRangePicker({ fromIso, toIso, onChange }: DateRangePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="datetime-local"
        value={utcIsoToLocalInput(fromIso)}
        onChange={(e) => onChange(localInputToUtcIso(e.target.value), toIso)}
        className="rounded-lg border border-slate-900/10 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
      />
      <span className="text-xs text-slate-400">a</span>
      <input
        type="datetime-local"
        value={utcIsoToLocalInput(toIso)}
        onChange={(e) => onChange(fromIso, localInputToUtcIso(e.target.value))}
        className="rounded-lg border border-slate-900/10 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
      />
      <div className="flex gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() =>
              onChange(localInputToUtcIso(hoursAgoLocalInput(preset.hours)), localInputToUtcIso(nowLocalInput()))
            }
            className="rounded-lg border border-slate-900/10 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-900/5 hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
