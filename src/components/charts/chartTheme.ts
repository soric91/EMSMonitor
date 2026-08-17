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

/** Texto de los ejes. */
export const AXIS_TICK = { fontSize: 11, fill: '#94a3b8' } as const;

/** Línea del eje y de la grilla: apenas visible en ambos temas. */
export const AXIS_LINE = 'rgba(148,163,184,0.15)';

export const TOOLTIP_CONTENT = {
  background: 'var(--tooltip-bg, #0f172a)',
  border: 'none',
  borderRadius: 12,
  fontSize: 12,
  boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
} as const;

/** El encabezado del tooltip (la etiqueta del punto). */
export const TOOLTIP_LABEL = { color: '#94a3b8', marginBottom: 4 } as const;

/** Los valores dentro del tooltip. */
export const TOOLTIP_ITEM = { color: '#f1f5f9' } as const;

/**
 * La leyenda. El texto de cada serie lo colorea Recharts con el color de la
 * serie, pero el contenedor —y cualquier texto suelto— hereda el del padre:
 * fijarlo acá evita que quede casi negro sobre fondo oscuro.
 */
export const LEGEND_WRAPPER = { fontSize: 12, color: '#94a3b8' } as const;
