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
} from 'lightweight-charts';
import { formatInTimeZone } from 'date-fns-tz';
import { es } from 'date-fns/locale';
import { useTheme } from '../../hooks/useTheme';
import { toChartPoints } from './chartPoints';

const TIME_ZONE = 'America/Bogota';

function bogotaTime(time: Time, pattern: string): string {
  return formatInTimeZone(new Date((time as number) * 1000), TIME_ZONE, pattern, { locale: es });
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

/**
 * Corre una operación sobre la gráfica sin dejar que su fallo salga del
 * componente.
 *
 * lightweight-charts lanza "Value is null" desde sus propios recálculos —el
 * stack ni siquiera pasa por código nuestro— cuando el modelo queda a medias:
 * pasa al montar mientras el contenedor todavía no tiene tamaño, y al navegar
 * a otra página con datos en vuelo. Dentro de un efecto de React, esa
 * excepción desmonta el árbol entero y la página queda en blanco.
 *
 * Una gráfica que no se actualiza es un problema; una página en blanco, sin
 * barra lateral y sin manera de volver, es otro mucho peor.
 */
function sinReventar(que: string, accion: () => void): void {
  try {
    accion();
  } catch (error) {
    console.warn(`Gráfica: ${que} falló y se ignoró.`, error);
  }
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
  // Una gráfica ya destruida sigue teniendo métodos: llamarlos revienta desde
  // dentro. Pasa al cambiar de página con datos en vuelo.
  const destruidaRef = useRef(false);
  const seriesMapRef = useRef(
    new Map<
      string,
      { api: ISeriesApi<'Area'>; minLine: IPriceLine | null; maxLine: IPriceLine | null }
    >(),
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
    destruidaRef.current = false;

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
      // Tooltip construido con nodos, nunca con innerHTML: la etiqueta de cada
      // serie viene del catálogo del backend y el formatter puede mostrar
      // texto; inyectarla como HTML convertiría esa cadena en un sink XSS.
      tooltip.replaceChildren();
      const timeLabel = document.createElement('div');
      timeLabel.style.opacity = '0.6';
      timeLabel.style.marginBottom = '2px';
      timeLabel.textContent = bogotaTime(param.time as Time, 'd MMM, HH:mm:ss');
      tooltip.appendChild(timeLabel);

      let rows = 0;
      for (const spec of currentSeries) {
        const entry = seriesMapRef.current.get(spec.key);
        if (!entry) continue;
        const point = param.seriesData.get(entry.api) as { value?: number } | undefined;
        if (point?.value === undefined) continue;
        rows += 1;

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '6px';

        const dot = document.createElement('span');
        dot.style.width = '6px';
        dot.style.height = '6px';
        dot.style.borderRadius = '9999px';
        dot.style.background = spec.color;
        row.appendChild(dot);

        if (currentSeries.length > 1) {
          const label = document.createElement('span');
          label.style.opacity = '0.7';
          label.textContent = spec.label;
          row.appendChild(label);
        }

        const value = document.createElement('span');
        value.style.fontWeight = '600';
        value.textContent = format(point.value);
        row.appendChild(value);

        tooltip.appendChild(row);
      }
      if (rows === 0) {
        tooltip.style.display = 'none';
        return;
      }
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
      destruidaRef.current = true;
      chartRef.current = null;
      seriesMap.clear();
      sinReventar('destruir', () => chart.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || destruidaRef.current) return;
    sinReventar('aplicar el tema', () => {
      chart.applyOptions({
        layout: { textColor: THEME[theme].text },
        grid: { vertLines: { color: THEME[theme].grid }, horzLines: { color: THEME[theme].grid } },
        timeScale: { borderColor: THEME[theme].border },
      });
    });
  }, [theme]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || destruidaRef.current) return;
    const seriesMap = seriesMapRef.current;

    // Todo el volcado de datos va dentro de una sola guarda: cualquiera de
    // estas llamadas dispara el recálculo interno que puede lanzar, y ninguna
    // vale una página en blanco.
    sinReventar('dibujar las series', () => {
      const activeKeys = new Set(series.map((s) => s.key));
      for (const [key, entry] of seriesMap) {
        if (!activeKeys.has(key)) {
          chart.removeSeries(entry.api);
          seriesMap.delete(key);
        }
      }

      let anyBars = false;

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
          entry.api.applyOptions({
            lineColor: spec.color,
            topColor: `${spec.color}33`,
            bottomColor: `${spec.color}00`,
          });
        }

        const points = toChartPoints(spec.data);
        if (points.length === 0) continue;
        anyBars = true;
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
        // fitContent()/setVisibleRange() lanzan "Value is null" en
        // lightweight-charts cuando no hay barras todavía, o cuando el rango
        // guardado no aplica a los datos nuevos (p. ej. al cambiar de pestaña).
        // Sin barras se sale sin marcar la clave: cuando lleguen, se reintenta.
        if (!anyBars) return;
        lastSeriesKeyRef.current = seriesKey;
        try {
          if (visibleRangeRef.current && !forceFit) {
            chart.timeScale().setVisibleRange(visibleRangeRef.current);
          } else {
            chart.timeScale().fitContent();
          }
        } catch {
          // un encuadre fallido no debe tumbar la gráfica ni la página
        }
      }
    });
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
        <div className="pointer-events-none absolute left-2 top-1 flex max-w-full flex-wrap gap-x-3 gap-y-1">
          {series.map((s) => (
            <span
              key={s.key}
              className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[10px] font-medium text-slate-400"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {/* La etiqueta se recorta: un nombre largo no debe empujar la
                  leyenda más allá de la tarjeta (desborde horizontal). */}
              <span className="max-w-[6rem] truncate">{s.label}</span>
              {s.data.length > 0 && (
                <span className="shrink-0 text-slate-500 dark:text-slate-300">
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
