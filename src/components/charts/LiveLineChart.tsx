import { useEffect, useMemo, useRef } from 'react';
import {
  AreaSeries,
  ColorType,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type IRange,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { formatInTimeZone } from 'date-fns-tz';
import { useTheme } from '../../hooks/useTheme';

const TIME_ZONE = 'America/Bogota';

function bogotaTime(time: Time, pattern: string): string {
  return formatInTimeZone(new Date((time as number) * 1000), TIME_ZONE, pattern);
}

export interface LiveChartPoint {
  time: number; // epoch ms
  value: number;
}

export interface LiveChartSeries {
  key: string;
  label: string;
  color: string;
  data: LiveChartPoint[];
}

interface LiveLineChartProps {
  series: LiveChartSeries[];
  /** Identifica el grupo activo (ej. la pestaña seleccionada). Al cambiar, se conserva el rango visible. */
  seriesKey: string;
  /**
   * Fuerza un fitContent() real en este cambio de seriesKey en vez de restaurar el
   * último rango visible capturado. Necesario cuando el rango previo fue un
   * autoencuadre sobre datos aún incompletos (p. ej. antes de que el backfill de
   * histórico terminara de llegar): sin esto, ese encuadre diminuto se reaplica
   * y el histórico recién cargado queda invisible fuera de la vista.
   */
  forceFit?: boolean;
  height?: number;
  valueFormatter?: (value: number) => string;
}

const THEME = {
  dark: { text: '#94a3b8', grid: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.15)' },
  light: { text: '#64748b', grid: 'rgba(15,23,42,0.06)', border: 'rgba(15,23,42,0.1)' },
};

function toChartPoints(data: LiveChartPoint[]) {
  const bySecond = new Map<number, number>();
  for (const p of data) {
    bySecond.set(Math.floor(p.time / 1000), p.value);
  }
  return Array.from(bySecond.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, value]) => ({ time: time as UTCTimestamp, value }));
}

export function LiveLineChart({
  series,
  seriesKey,
  forceFit = false,
  height = 260,
  valueFormatter = (v) => `${v}`,
}: LiveLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMapRef = useRef(
    new Map<string, { api: ISeriesApi<'Area'>; minLine: IPriceLine | null; maxLine: IPriceLine | null }>(),
  );
  const lastSeriesKeyRef = useRef<string | null>(null);
  const visibleRangeRef = useRef<IRange<Time> | null>(null);
  // El handler del crosshair se suscribe una sola vez al montar; lee las props
  // vigentes (labels/colores/formatter cambian al cambiar de pestaña) vía ref.
  const hoverPropsRef = useRef({ series, valueFormatter });
  useEffect(() => {
    hoverPropsRef.current = { series, valueFormatter };
  }, [series, valueFormatter]);
  const { theme } = useTheme();

  const combinedRange = useMemo(() => {
    const values = series.flatMap((s) => s.data.map((p) => p.value));
    if (values.length === 0) return null;
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [series]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: THEME[theme].text,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: THEME[theme].grid },
        horzLines: { color: THEME[theme].grid },
      },
      rightPriceScale: { visible: false },
      // La fecha ya se muestra en el tooltip flotante; la etiqueta del crosshair
      // sobre el eje inferior sería redundante.
      crosshair: { vertLine: { labelVisible: false } },
      timeScale: {
        borderColor: THEME[theme].border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => bogotaTime(time, 'HH:mm'),
      },
      localization: {
        priceFormatter: valueFormatter,
        timeFormatter: (time: Time) => bogotaTime(time, 'd MMM, HH:mm:ss'),
      },
    });

    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      visibleRangeRef.current = range;
    });

    // Tooltip flotante: solo visible mientras el mouse está sobre la gráfica.
    chart.subscribeCrosshairMove((param) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      if (!param.time || !param.point) {
        tooltip.style.display = 'none';
        return;
      }
      const { series: currentSeries, valueFormatter: format } = hoverPropsRef.current;
      const rows: string[] = [];
      for (const spec of currentSeries) {
        const entry = seriesMapRef.current.get(spec.key);
        if (!entry) continue;
        const point = param.seriesData.get(entry.api) as { value?: number } | undefined;
        if (point?.value === undefined) continue;
        rows.push(
          `<div style="display:flex;align-items:center;gap:6px;">` +
            `<span style="width:6px;height:6px;border-radius:9999px;background:${spec.color};"></span>` +
            (currentSeries.length > 1 ? `<span style="opacity:.7">${spec.label}</span>` : '') +
            `<span style="font-weight:600">${format(point.value)}</span>` +
          `</div>`,
        );
      }
      if (rows.length === 0) {
        tooltip.style.display = 'none';
        return;
      }
      tooltip.innerHTML =
        `<div style="opacity:.6;margin-bottom:2px">${bogotaTime(param.time as Time, 'd MMM, HH:mm:ss')}</div>` +
        rows.join('');
      tooltip.style.display = 'block';
      const containerWidth = container.clientWidth;
      const tooltipWidth = tooltip.offsetWidth;
      const x = Math.min(Math.max(param.point.x + 12, 0), containerWidth - tooltipWidth - 4);
      const y = Math.max(param.point.y - tooltip.offsetHeight - 10, 0);
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    });

    chartRef.current = chart;
    const seriesMap = seriesMapRef.current;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesMap.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: { textColor: THEME[theme].text },
      grid: { vertLines: { color: THEME[theme].grid }, horzLines: { color: THEME[theme].grid } },
      timeScale: { borderColor: THEME[theme].border },
    });
  }, [theme]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const seriesMap = seriesMapRef.current;

    const activeKeys = new Set(series.map((s) => s.key));
    for (const [key, entry] of seriesMap) {
      if (!activeKeys.has(key)) {
        chart.removeSeries(entry.api);
        seriesMap.delete(key);
      }
    }

    for (const spec of series) {
      let entry = seriesMap.get(spec.key);
      if (!entry) {
        const api = chart.addSeries(AreaSeries, {
          lineColor: spec.color,
          topColor: `${spec.color}33`,
          bottomColor: `${spec.color}00`,
          lineWidth: 2,
          priceFormat: { type: 'custom', formatter: valueFormatter, minMove: 0.01 },
        });
        entry = { api, minLine: null, maxLine: null };
        seriesMap.set(spec.key, entry);
      } else {
        entry.api.applyOptions({ lineColor: spec.color, topColor: `${spec.color}33`, bottomColor: `${spec.color}00` });
      }

      const points = toChartPoints(spec.data);
      if (points.length === 0) continue;
      entry.api.setData(points);

      if (series.length === 1) {
        if (entry.minLine) entry.api.removePriceLine(entry.minLine);
        if (entry.maxLine) entry.api.removePriceLine(entry.maxLine);
        const min = Math.min(...points.map((p) => p.value));
        const max = Math.max(...points.map((p) => p.value));
        entry.minLine = entry.api.createPriceLine({
          price: min,
          color: spec.color,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
          title: '',
        });
        entry.maxLine = entry.api.createPriceLine({
          price: max,
          color: spec.color,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
          title: '',
        });
      } else if (entry.minLine || entry.maxLine) {
        if (entry.minLine) entry.api.removePriceLine(entry.minLine);
        if (entry.maxLine) entry.api.removePriceLine(entry.maxLine);
        entry.minLine = null;
        entry.maxLine = null;
      }
    }

    if (lastSeriesKeyRef.current !== seriesKey) {
      lastSeriesKeyRef.current = seriesKey;
      if (visibleRangeRef.current && !forceFit) {
        chart.timeScale().setVisibleRange(visibleRangeRef.current);
      } else {
        chart.timeScale().fitContent();
      }
    }
  }, [series, seriesKey, forceFit, valueFormatter]);

  return (
    <div className="relative">
      <div ref={containerRef} style={{ height }} className="w-full" />
      <div
        ref={tooltipRef}
        style={{ display: 'none' }}
        className="pointer-events-none absolute z-10 rounded-lg bg-slate-900/95 px-2.5 py-1.5 font-mono text-[11px] text-slate-100 shadow-xl shadow-black/30 dark:bg-slate-800/95"
      />
      {series.length === 1 && combinedRange && (
        <>
          <span className="pointer-events-none absolute left-2 top-1 font-mono text-[10px] text-slate-400">
            máx {valueFormatter(combinedRange.max)}
          </span>
          <span className="pointer-events-none absolute bottom-1 left-2 font-mono text-[10px] text-slate-400">
            mín {valueFormatter(combinedRange.min)}
          </span>
        </>
      )}
      {series.length > 1 && (
        <div className="pointer-events-none absolute left-2 top-1 flex gap-3">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
              {s.data.length > 0 && (
                <span className="text-slate-500 dark:text-slate-300">
                  {valueFormatter(s.data[s.data.length - 1]!.value)}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
