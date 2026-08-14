import {
  hoursAgoLocalInput,
  localInputToUtcIso,
  nowLocalInput,
  utcIsoToLocalInput,
} from '../../utils/timezone';
import { RANGE_PRESETS } from '../../domain/periods';

interface DateRangePickerProps {
  fromIso: string;
  toIso: string;
  onChange: (fromIso: string, toIso: string) => void;
}

export function DateRangePicker({ fromIso, toIso, onChange }: DateRangePickerProps) {
  const inputClases =
    'min-w-0 flex-1 rounded-lg border border-slate-900/10 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none transition focus:border-accent-500/60 focus:ring-2 focus:ring-accent-500/20 sm:flex-none sm:w-44 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200';

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <input
        type="datetime-local"
        value={utcIsoToLocalInput(fromIso)}
        onChange={(e) => onChange(localInputToUtcIso(e.target.value), toIso)}
        className={inputClases}
      />
      <span className="text-xs text-slate-400">a</span>
      <input
        type="datetime-local"
        value={utcIsoToLocalInput(toIso)}
        onChange={(e) => onChange(fromIso, localInputToUtcIso(e.target.value))}
        className={inputClases}
      />
      {/* En celular los presets bajan a su propia fila, completa; así la fila de
          fechas no se parte en tres pedazos de ancho arbitrario. */}
      <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() =>
              onChange(
                localInputToUtcIso(hoursAgoLocalInput(preset.hours)),
                localInputToUtcIso(nowLocalInput()),
              )
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
