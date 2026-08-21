/**
 * El estilo compartido de las gráficas de Recharts.
 *
 * Recharts pinta los textos con SVG, no con CSS: una clase de Tailwind sobre
 * el eje colorea la línea, pero NO las etiquetas, que siguen su propio `fill`.
 * Sin ese `fill`, el valor por defecto de la librería es un gris oscuro casi
 * negro: legible sobre fondo claro y prácticamente invisible en modo oscuro.
 *
 * Los mismos valores estaban copiados en cuatro gráficas y faltaban en las
 * tres nuevas — que es exactamente por donde apareció el texto ilegible. Acá
 * viven una sola vez.
 *
 * El gris elegido (slate-400) es el único que se lee bien en los dos temas sin
 * cambiar de color: sobre blanco queda suave pero nítido, sobre oscuro no se
 * apaga. El tooltip va siempre oscuro con texto claro, también en tema claro:
 * es una superficie flotante, y un globo blanco sobre tarjeta blanca se
 * confunde con la tarjeta.
 */

/** Texto de los ejes: en la fuente de las etiquetas grabadas, no en la de la interfaz. */
export const AXIS_TICK = {
  fontSize: 10,
  fill: '#8fa0bc',
  fontFamily: "'Chivo Mono', ui-monospace, monospace",
} as const;

/** Línea del eje y de la grilla: se hunde, no se dibuja. La grilla es una
    referencia para el ojo, no una parte del dato. */
export const AXIS_LINE = 'rgba(143,160,188,0.14)';

export const TOOLTIP_CONTENT = {
  background: 'var(--tooltip-bg, #101827)',
  border: '1px solid rgba(143,160,188,0.18)',
  borderRadius: 12,
  fontSize: 12,
  padding: '8px 11px',
  boxShadow: '0 14px 36px rgba(0,0,0,0.38)',
} as const;

/** El encabezado del tooltip (la etiqueta del punto). */
export const TOOLTIP_LABEL = {
  color: '#8fa0bc',
  marginBottom: 5,
  fontFamily: "'Chivo Mono', ui-monospace, monospace",
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
} as const;

/** Los valores dentro del tooltip: cifra tabular, como toda lectura del panel. */
export const TOOLTIP_ITEM = {
  color: '#eaf0fa',
  fontFamily: "'Archivo', system-ui, sans-serif",
  fontVariantNumeric: 'tabular-nums',
} as const;

/**
 * La leyenda. El texto de cada serie lo colorea Recharts con el color de la
 * serie, pero el contenedor —y cualquier texto suelto— hereda el del padre:
 * fijarlo acá evita que quede casi negro sobre fondo oscuro.
 */
export const LEGEND_WRAPPER = { fontSize: 11.5, color: '#8fa0bc', paddingTop: 6 } as const;

/**
 * El degradado que le da cuerpo a un área o a una barra.
 *
 * Recharts no acepta un `fill` con degradado sin un `<defs>` propio, así que
 * cada gráfica declara el suyo con `gradienteVertical(id, color)` y lo usa como
 * `fill={`url(#${id})`}`. Es lo que separa una barra plana de 2015 de una que
 * tiene volumen.
 */
export const GRADIENTE_ARRIBA = 0.9;
export const GRADIENTE_ABAJO = 0.35;
