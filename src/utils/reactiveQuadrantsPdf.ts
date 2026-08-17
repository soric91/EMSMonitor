import type { ReactiveQuadrantsResult } from '../api/types';
import { formatLocalDateTime, formatPercent, formatVariableValue } from './format';
import {
  CARD_BORDER,
  CONTENT_W,
  FAINT,
  INK,
  MARGIN,
  MUTED,
  PADDING_TARJETA,
  bulletList,
  drawFooters,
  ensureSpace,
  kpiCards,
  methodologyNote,
  nombreDeArchivo,
  reportHeader,
  sectionTitle,
  t,
} from './pdfKit';

// Los cuadrantes conservan su paleta propia: son cuatro categorías que se
// distinguen entre sí, no los significados de importación/exportación del
// resto de la app.
const IMPORT_COLOR = '#f59e0b';
const EXPORT_COLOR = '#10b981';
// Cuadrantes: un matiz por cuadrante, la misma paleta que la página — Q1 ámbar,
// Q2 cian, Q3 esmeralda, Q4 violeta.
const Q1_COLOR = IMPORT_COLOR;
const Q2_COLOR = '#06b6d4';
const Q3_COLOR = EXPORT_COLOR;
const Q4_COLOR = '#8b5cf6';

/** Los cuatro cuadrantes (IEC 60375) con su lectura en la acometida. */
const CUADRANTES: {
  key: 'q1_kvarh' | 'q2_kvarh' | 'q3_kvarh' | 'q4_kvarh';
  id: string;
  etiqueta: string;
  descripcion: string;
  color: string;
}[] = [
  {
    key: 'q1_kvarh',
    id: 'q1',
    etiqueta: 'Q1 · Importada inductiva',
    descripcion: 'Reactiva absorbida de la red con factor inductivo',
    color: Q1_COLOR,
  },
  {
    key: 'q2_kvarh',
    id: 'q2',
    etiqueta: 'Q2 · Importada capacitiva',
    descripcion: 'Reactiva absorbida de la red con factor capacitivo',
    color: Q2_COLOR,
  },
  {
    key: 'q3_kvarh',
    id: 'q3',
    etiqueta: 'Q3 · Exportada capacitiva',
    descripcion: 'Reactiva devuelta a la red con factor capacitivo',
    color: Q3_COLOR,
  },
  {
    key: 'q4_kvarh',
    id: 'q4',
    etiqueta: 'Q4 · Exportada inductiva',
    descripcion: 'Reactiva devuelta a la red con factor inductivo',
    color: Q4_COLOR,
  },
];

// La rejilla de cuadrantes: una tarjeta por cuadrante, dos por fila. Las
// medidas viven acá porque el alto que se reserva antes de dibujar y el que se
// avanza después TIENEN que ser el mismo — calcularlos por separado fue lo que
// dejó los rótulos de la segunda fila fuera de la hoja.
const ALTO_TARJETA = 118;
/** Sitio para las dos líneas de rótulo dentro de la tarjeta. */
const ALTO_ROTULOS = 26;
const COLUMNA_GAP = 12;
const FILA_GAP = 14;
const ALTO_REJILLA = 2 * ALTO_TARJETA + FILA_GAP;

const DOMINANTE_DESCRIPCION: Record<string, string> = Object.fromEntries(
  CUADRANTES.map((c) => [c.id, c.descripcion]),
);

/**
 * Informe de energía reactiva del periodo, en PDF vectorial.
 *
 * Mismo ADN que `analyticsSummaryPdf`: encabezado, tarjetas de KPIs, gráficas
 * dibujadas con primitivas de jsPDF (no capturas), explicaciones y pie. Todo
 * sale del `response` que la página de Reactiva ya cargó — ninguna consulta
 * extra.
 */
/**
 * Informe de energía reactiva del periodo, en PDF vectorial.
 *
 * Misma anatomía que los otros informes (`pdfKit`): identificación y alcance,
 * resumen ejecutivo, cuerpo, hallazgos, acciones y nota metodológica. Todo
 * sale del `response` que la página de Reactiva ya cargó — ninguna consulta
 * extra.
 */
export async function buildReactiveQuadrantsPdf(result: ReactiveQuadrantsResult): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  renderReactiveQuadrants(pdf, result);
  pdf.save(nombreDeArchivo('informe_reactiva'));
}

/**
 * Dibuja el informe y devuelve las secciones que quedaron en él.
 *
 * Separado de `build*` para que se pueda verificar sin descargar nada: el
 * manifiesto es lo que los tests revisan, y `pdf.save()` en un test solo
 * dispararía una descarga.
 */
export function renderReactiveQuadrants(
  pdf: import('jspdf').jsPDF,
  result: ReactiveQuadrantsResult,
): string[] {
  const secciones: string[] = [];
  const total = result.total_import_kvarh + result.total_export_kvarh;

  let y = reportHeader(
    pdf,
    {
      titulo: 'Informe de energía reactiva',
      periodo: `Periodo: ${formatLocalDateTime(result.period_start, 'd MMM yyyy')} — ${formatLocalDateTime(
        result.period_end,
        'd MMM yyyy',
      )}`,
      alcance:
        'contadores de energía reactiva por cuadrante (Q1–Q4, IEC 60375) del medidor bidireccional ' +
        'instalado en la acometida. Q1/Q2 es reactiva que la instalación absorbe de la red; Q3/Q4 la que devuelve.',
    },
    MARGIN,
  );

  // ---------- Resumen ejecutivo ----------
  secciones.push('resumen');
  y = sectionTitle(pdf, 'Resumen del periodo', y);
  y = kpiCards(
    pdf,
    [
      {
        label: 'Reactiva importada (Q1+Q2)',
        value: formatVariableValue('kvarh', result.total_import_kvarh),
        color: IMPORT_COLOR,
        hint: 'absorbida de la red',
      },
      {
        label: 'Reactiva exportada (Q3+Q4)',
        value: formatVariableValue('kvarh', result.total_export_kvarh),
        color: EXPORT_COLOR,
        hint: 'devuelta a la red',
      },
      {
        label: 'Balance neto',
        value: `${result.balance_kvarh >= 0 ? '+' : ''}${formatVariableValue('kvarh', result.balance_kvarh)}`,
        color: INK,
        hint: result.balance_kvarh >= 0 ? 'la red le entrega' : 'la instalación devuelve',
      },
      {
        label: 'Cuadrante dominante',
        value: result.dominant
          ? `Q${result.dominant.slice(1)} · ${formatVariableValue('kvarh', result.dominant_kvarh)}`
          : 'Sin reactiva',
        color: CUADRANTES.find((c) => c.id === result.dominant)?.color ?? FAINT,
        hint: result.dominant ? DOMINANTE_DESCRIPCION[result.dominant] : 'ninguna ventana con dato',
      },
    ],
    y,
  );

  // ---------- Comportamiento por cuadrante (4 gráficas) ----------
  secciones.push('cuadrantes');
  // Las cuatro gráficas van juntas o no van: partirlas entre dos páginas deja
  // media rejilla arriba y media abajo, que es peor que empezar en la siguiente.
  y = ensureSpace(pdf, y, ALTO_REJILLA + 40);
  y = sectionTitle(pdf, 'Comportamiento por cuadrante', y);
  pdf.setFontSize(8);
  pdf.setTextColor(MUTED);
  pdf.text(
    t('Cada gráfica muestra la reactiva de ese cuadrante por ventana del periodo (kvarh).'),
    MARGIN,
    y,
  );
  y += 12;

  const anchoTarjeta = (CONTENT_W - COLUMNA_GAP) / 2;
  CUADRANTES.forEach((c, i) => {
    const columna = i % 2;
    const fila = Math.floor(i / 2);
    const x = MARGIN + columna * (anchoTarjeta + COLUMNA_GAP);
    const top = y + fila * (ALTO_TARJETA + FILA_GAP);
    const value = result[c.key];
    const share = total > 0 ? value / total : 0;

    pdf.setDrawColor(CARD_BORDER);
    pdf.setLineWidth(0.75);
    pdf.roundedRect(x, top, anchoTarjeta, ALTO_TARJETA, 4, 4, 'S');
    // Las barras ocupan la tarjeta menos el sitio de los dos rótulos: así el
    // texto siempre cae DENTRO de su tarjeta, sin depender de dónde terminó
    // de dibujar la gráfica.
    drawMiniTrend(
      pdf,
      x + PADDING_TARJETA,
      top + 8,
      anchoTarjeta - PADDING_TARJETA * 2,
      ALTO_TARJETA - ALTO_ROTULOS - 8,
      valuesOf(result, c.key),
      c.color,
    );

    const rotuloY = top + ALTO_TARJETA - ALTO_ROTULOS + 10;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(INK);
    pdf.text(t(c.etiqueta), x + PADDING_TARJETA, rotuloY);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(MUTED);
    pdf.text(
      t(`${formatVariableValue('kvarh', value)} · ${formatPercent(share)} del total`),
      x + PADDING_TARJETA,
      rotuloY + 10,
    );
  });
  y += ALTO_REJILLA + 10;

  // ---------- Lectura ----------
  secciones.push('lectura');
  y = ensureSpace(pdf, y, 90);
  y = sectionTitle(pdf, 'Qué muestran estos cuadrantes', y);
  y = bulletList(pdf, buildExplicacion(result), y);

  // ---------- Acciones ----------
  const recomendaciones = buildRecomendaciones(result);
  if (recomendaciones.length > 0) {
    secciones.push('acciones');
    y = ensureSpace(pdf, y, 70);
    y = sectionTitle(pdf, 'Qué hacer con esto', y);
    y = bulletList(pdf, recomendaciones, y);
  }

  // ---------- Nota metodológica ----------
  secciones.push('metodologia');
  methodologyNote(
    pdf,
    [
      'Los cuadrantes son contadores acumulativos: la energía del periodo es la diferencia entre el ' +
        'valor final y el inicial de cada uno, nunca un promedio.',
      'Las gráficas por cuadrante muestran la reactiva de cada ventana del periodo; con más de 24 ' +
        'ventanas la serie se submuestrea para dibujarla, pero los totales usan todos los puntos.',
      'Este informe describe lo medido en la acometida. No calcula penalización tarifaria: el umbral y ' +
        'el precio del kvarh dependen de la regulación vigente y del tipo de usuario, y no están cargados ' +
        'en el sistema.',
    ],
    y,
  );

  drawFooters(
    pdf,
    'EMS Monitor · Informe de energía reactiva generado desde el panel de monitoreo',
  );
  return secciones;
}

/** La serie de un cuadrante dentro de la tendencia (q1_kvarh…q4_kvarh). */
function valuesOf(
  result: ReactiveQuadrantsResult,
  key: 'q1_kvarh' | 'q2_kvarh' | 'q3_kvarh' | 'q4_kvarh',
): number[] {
  return result.trend.map((point) => point[key]);
}

/**
 * Dibuja barras verticales de la serie (hasta 24, submuestreadas si el periodo
 * trae más) dentro del rectángulo que se le indica.
 *
 * No devuelve coordenadas a propósito: antes devolvía posiciones ABSOLUTAS que
 * el llamador volvía a sumar a la esquina de la tarjeta, así que el rótulo se
 * dibujaba a un `top` de distancia de donde debía — encima de la sección
 * siguiente en la primera fila, y fuera de la hoja en la segunda.
 */
function drawMiniTrend(
  pdf: import('jspdf').jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  values: number[],
  color: string,
): void {
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length === 0) {
    pdf.setDrawColor(CARD_BORDER);
    pdf.setLineWidth(0.5);
    pdf.line(x, y + h, x + w, y + h);
    return;
  }

  const sampled = sample(values, 24);
  const max = Math.max(...nonZero);
  const slot = w / sampled.length;
  const barW = slot * 0.6;

  sampled.forEach((value, i) => {
    const barX = x + i * slot + (slot - barW) / 2;
    const barHeight = (Math.max(value, 0) / max) * h;
    if (value > 0) {
      pdf.setFillColor(color);
      pdf.rect(barX, y + h - barHeight, barW, barHeight, 'F');
    }
  });

  pdf.setDrawColor(CARD_BORDER);
  pdf.setLineWidth(0.5);
  pdf.line(x, y + h, x + w, y + h);
}

function sample(values: number[], limit: number): number[] {
  if (values.length <= limit) return values;
  const out: number[] = [];
  for (let i = 0; i < limit; i += 1) {
    out.push(values[Math.floor((i / (limit - 1)) * (values.length - 1))] ?? 0);
  }
  return out;
}

/** Explicación de qué muestran los datos del periodo — nada inventado. */
function buildExplicacion(result: ReactiveQuadrantsResult): string[] {
  const resumenImport = result.total_import_kvarh;
  const resumenExport = result.total_export_kvarh;
  const importaMas = resumenImport > resumenExport;
  const lineas: string[] = [
    `Los cuadrantes Q1/Q2 miden la reactiva que el cliente absorbida de la red y Q3/Q4 la que devuelve ` +
      `(convención IEC 60375). Este periodo la reactiva importada fue ${formatVariableValue('kvarh', resumenImport)} ` +
      `y la exportada ${formatVariableValue('kvarh', resumenExport)}; la red le ${importaMas ? 'entregó' : 'recibió del cliente'} ` +
      `reactiva por ${formatVariableValue('kvarh', Math.abs(result.balance_kvarh))}.`,
  ];
  if (result.dominant) {
    lineas.push(
      `El cuadrante dominante fue ${CUADRANTES.find((c) => c.id === result.dominant)?.etiqueta ?? result.dominant} ` +
        `con ${formatVariableValue('kvarh', result.dominant_kvarh)}: ${DOMINANTE_DESCRIPCION[result.dominant]} — ` +
        `es el que concentró la mayor parte de la reactiva del periodo.`,
    );
  } else {
    lineas.push('El medidor no reportó reactiva en ninguna ventana del periodo seleccionado.');
  }
  return lineas;
}

function buildRecomendaciones(result: ReactiveQuadrantsResult): string[] {
  const recs: string[] = [];
  const importaMas = result.total_import_kvarh > result.total_export_kvarh;

  if (importaMas) {
    recs.push(
      `La red le entregó reactiva al cliente (Q1+Q2 supera Q3+Q4). Si el factor de potencia se mantiene ` +
        `por debajo del umbral del contrato, la compensación (bancos de condensadores) suele ser más barata ` +
        `que la penalización reactiva de la factura; verificar la lectura con el distribuidor.`,
    );
  } else {
    recs.push(
      `El cliente devolvió reactiva a la red (Q3+Q4 supera Q1+Q2): hay exceso de capacitancia instalada o ` +
        `cargas generadoras. Revisar si la compensación está sobredimensionada — devolver reactiva tampoco es neutral.`,
    );
  }

  if (result.dominant === 'q1' || result.dominant === 'q4') {
    recs.push(
      `El cuadrante dominante es inductivo: si se trata de motores o transformadores sin compensar, evaluar ` +
        `corrección del factor de potencia en la acometida.`,
    );
  }
  if (result.dominant === 'q2' || result.dominant === 'q3') {
    recs.push(
      `El cuadrante dominante es capacitivo: un factor de potencia en adelanto suele indicar compensación ` +
        `excesiva o inversores de generación entregando reactiva sin control — revisar la configuración.`,
    );
  }

  recs.push(
    'Revisar este informe mensualmente: la evolución del cuadrante dominante o del balance anticipa cambios en ' +
      'las cargas que justifican mover la compensación reactiva.',
  );
  return recs;
}
