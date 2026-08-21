import { useId } from 'react';

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
  const id = useId();
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  // Un rango cero (todos los valores iguales) dividiría por cero: se dibuja
  // como una línea recta a media altura, que es exactamente lo que es.
  const rango = max - min || 1;

  const coords = values.map((valor, i) => ({
    x: (i / (values.length - 1)) * ANCHO,
    // Un pelo de aire arriba y abajo: la línea pegada al borde se corta.
    y: ALTO - 1.5 - ((valor - min) / rango) * (ALTO - 3),
  }));
  const puntos = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const ultimo = coords[coords.length - 1]!;
  const gradiente = `spark-${id.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      preserveAspectRatio="none"
      className="h-6 w-full"
      role={label ? 'img' : 'presentation'}
      aria-label={label}
    >
      {/* El área bajo la curva da cuerpo a una línea de un píxel; el degradado
          la disuelve hacia abajo para que no se lea como una segunda serie. */}
      <defs>
        <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${ALTO} ${puntos} ${ANCHO},${ALTO}`} fill={`url(#${gradiente})`} />
      <polyline
        points={puntos}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* El extremo vivo: dónde está la medida de hoy. */}
      <circle cx={ultimo.x} cy={ultimo.y} r={1.6} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
