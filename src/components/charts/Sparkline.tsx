/**
 * Una miniserie sin ejes ni tooltip, para acompañar un número.
 *
 * SVG a mano y no Recharts: son 14 puntos dentro de una tarjeta, y montar un
 * contenedor responsivo con escalas para eso cuesta más render que dibujar la
 * polilínea. Tampoco lleva interacción a propósito — el detalle está en el
 * Histórico; acá solo se responde "¿viene subiendo o bajando?".
 */

const ANCHO = 100;
const ALTO = 24;

interface SparklineProps {
  /** Valores en orden cronológico. Menos de dos puntos no dibuja nada. */
  values: number[];
  color?: string;
  /** Descripción para lectores de pantalla; sin ella el gráfico se oculta. */
  label?: string;
}

export function Sparkline({ values, color = 'currentColor', label }: SparklineProps) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  // Un rango cero (todos los valores iguales) dividiría por cero: se dibuja
  // como una línea recta a media altura, que es exactamente lo que es.
  const rango = max - min || 1;

  const puntos = values
    .map((valor, i) => {
      const x = (i / (values.length - 1)) * ANCHO;
      const y = ALTO - ((valor - min) / rango) * ALTO;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      preserveAspectRatio="none"
      className="h-6 w-full"
      role={label ? 'img' : 'presentation'}
      aria-label={label}
    >
      <polyline
        points={puntos}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
