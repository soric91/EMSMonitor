import type { ReactiveQuadrantsResult } from '../api/types';
import { formatLocalDateTime, formatPercent, formatVariableValue } from './format';

// Paleta del informe (los mismos significados de color de la página Reactiva).
const INK = '#0f172a';
const MUTED = '#64748b';
const FAINT = '#94a3b8';
const CARD_BORDER = '#e2e8f0';
// Importada / exportada agregadas (KPIs del encabezado).
const IMPORT_COLOR = '#f59e0b';
const EXPORT_COLOR = '#10b981';
// Cuadrantes: un matiz por cuadrante, la misma paleta que la página — Q1 ámbar,
// Q2 cian, Q3 esmeralda, Q4 violeta.
const Q1_COLOR = IMPORT_COLOR;
const Q2_COLOR = '#06b6d4';
const Q3_COLOR = EXPORT_COLOR;
const Q4_COLOR = '#8b5cf6';

const PAGE_W = 595.28; // A4 pt
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

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

const DOMINANTE_DESCRIPCION: Record<string, string> = Object.fromEntries(
  CUADRANTES.map((c) => [c.id, c.descripcion]),
);

/** Las fuentes estándar de jsPDF son WinAnsi: sin NBSP/espacio angosto de es-CO. */
function t(s: string): string {
  return s.replace(/[\u00A0\u202F]/g, ' ');
}

/**
 * Informe de energía reactiva del periodo, en PDF vectorial.
 *
 * Mismo ADN que `analyticsSummaryPdf`: encabezado, tarjetas de KPIs, gráficas
 * dibujadas con primitivas de jsPDF (no capturas), explicaciones y pie. Todo
 * sale del `response` que la página de Reactiva ya cargó — ninguna consulta
 * extra.
 */
export async function buildReactiveQuadrantsPdf(result: ReactiveQuadrantsResult): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  let y = MARGIN;

  // ---------- Encabezado ----------
  pdf.setFillColor(EXPORT_COLOR);
  pdf.rect(MARGIN, y, 26, 4, 'F');
  y += 18;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(19);
  pdf.setTextColor(INK);
  pdf.text('Informe de energía reactiva', MARGIN, y);
  y += 16;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(MUTED);
  const total = result.total_import_kvarh + result.total_export_kvarh;
  pdf.text(
    t(
      `Periodo: ${formatLocalDateTime(result.period_start, 'd MMM yyyy')} — ${formatLocalDateTime(
        result.period_end,
        'd MMM yyyy',
      )}  ·  Generado: ${formatLocalDateTime(new Date().toISOString(), 'd MMM yyyy, HH:mm')} (hora Bogotá)`,
    ),
    MARGIN,
    y,
  );
  y += 24;

  // ---------- KPIs del periodo ----------
  y = sectionTitle(pdf, 'Resumen del periodo', y);
  const kpis: { label: string; value: string; color: string }[] = [
    {
      label: 'Reactiva importada (Q1+Q2)',
      value: formatVariableValue('kvarh', result.total_import_kvarh),
      color: IMPORT_COLOR,
    },
    {
      label: 'Reactiva exportada (Q3+Q4)',
      value: formatVariableValue('kvarh', result.total_export_kvarh),
      color: EXPORT_COLOR,
    },
    {
      label: 'Balance (importada - exportada)',
      value: `${result.balance_kvarh >= 0 ? '+' : ''}${formatVariableValue('kvarh', result.balance_kvarh)}`,
      color: INK,
    },
    {
      label: 'Cuadrante dominante',
      value: result.dominant
        ? `Q${result.dominant.slice(1)} · ${formatVariableValue('kvarh', result.dominant_kvarh)}`
        : 'Sin reactiva',
      color: CUADRANTES.find((c) => c.id === result.dominant)?.color ?? FAINT,
    },
  ];
  const boxW = (CONTENT_W - 3 * 10) / 4;
  const boxH = 56;
  kpis.forEach((kpi, i) => {
    const x = MARGIN + i * (boxW + 10);
    pdf.setDrawColor(CARD_BORDER);
    pdf.setLineWidth(0.75);
    pdf.roundedRect(x, y, boxW, boxH, 4, 4, 'S');
    pdf.setFillColor(kpi.color);
    pdf.rect(x, y, 3, boxH, 'F');
    pdf.setFontSize(6.5);
    pdf.setTextColor(MUTED);
    pdf.text(pdf.splitTextToSize(t(kpi.label), boxW - 14) as string[], x + 9, y + 13);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(INK);
    pdf.text(t(kpi.value), x + 9, y + boxH - 12);
    pdf.setFont('helvetica', 'normal');
  });
  y += boxH + 26;

  // ---------- Comportamiento por cuadrante (4 gráficas) ----------
  y = sectionTitle(pdf, 'Comportamiento por cuadrante', y);
  pdf.setFontSize(8);
  pdf.setTextColor(MUTED);
  pdf.text(
    t('Cada gráfica muestra la reactiva de ese cuadrante por ventana del periodo (kvarh).'),
    MARGIN,
    y,
  );
  y += 12;

  const chartW = (CONTENT_W - 12) / 2;
  const chartH = 118;
  const gap = 12;
  CUADRANTES.forEach((c, i) => {
    const col = i % 2;
    const rowType = Math.floor(i / 2);
    const x = MARGIN + col * (chartW + gap);
    const top = y + rowType * (chartH + 22);
    const value = result[c.key];
    const share = total > 0 ? value / total : 0;

    pdf.setDrawColor(CARD_BORDER);
    pdf.setLineWidth(0.75);
    pdf.roundedRect(x, top, chartW, chartH, 4, 4, 'S');
    const { barH, barTop } = drawMiniTrend(
      pdf,
      x + 8,
      top + 6,
      chartW - 16,
      chartH - 26,
      valuesOf(result, c.key),
      c.color,
    );

    const titleY = top + barTop + barH + 14;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(INK);
    pdf.text(t(c.etiqueta), x + 8, titleY);
    pdf.setTextColor(MUTED);
    pdf.text(
      t(`${formatVariableValue('kvarh', value)} · ${formatPercent(share)} del total`),
      x + 8,
      titleY + 10,
    );
  });
  y += 2 * (chartH + 22) - 6;

  // ---------- Explicación de los cuadrantes ----------
  y = sectionTitle(pdf, 'Lectura de los cuadrantes', y);
  const explicacion = buildExplicacion(result);
  pdf.setFontSize(9);
  for (const line of explicacion) {
    const lines = pdf.splitTextToSize(t(line), CONTENT_W - 22) as string[];
    pdf.setFillColor(EXPORT_COLOR);
    pdf.circle(MARGIN + 3, y - 2.5, 1.8, 'F');
    pdf.setTextColor(INK);
    pdf.text(lines, MARGIN + 12, y);
    y += lines.length * 11 + 5;
  }
  y += 8;

  // ---------- Recomendaciones ----------
  const recomendaciones = buildRecomendaciones(result);
  if (recomendaciones.length > 0) {
    y = sectionTitle(pdf, 'Recomendaciones', y);
    pdf.setFontSize(9);
    for (const rec of recomendaciones) {
      const lines = pdf.splitTextToSize(t(rec), CONTENT_W - 18) as string[];
      pdf.setFillColor(EXPORT_COLOR);
      pdf.circle(MARGIN + 3, y - 2.5, 1.8, 'F');
      pdf.setTextColor(INK);
      pdf.text(lines, MARGIN + 12, y);
      y += lines.length * 11 + 5;
    }
    y += 8;
  }

  // Si la lectura + recomendaciones se pasan del alto, la última sección puede
  // quedar cortada; el informe completo de 24h/7d/30d cabe en una hoja.
  if (y > pdf.internal.pageSize.getHeight() - 60) {
    pdf.addPage();
    y = MARGIN + 12;
  }

  // ---------- Pie ----------
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setDrawColor(CARD_BORDER);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN, pageH - 40, PAGE_W - MARGIN, pageH - 40);
  pdf.setFontSize(7.5);
  pdf.setTextColor(FAINT);
  pdf.text(
    'EMS Monitor · Informe generado automáticamente desde el panel de monitoreo',
    MARGIN,
    pageH - 28,
  );
  pdf.text(
    `Página ${pdf.getNumberOfPages()} de ${pdf.getNumberOfPages()}`,
    PAGE_W - MARGIN,
    pageH - 28,
    {
      align: 'right',
    },
  );

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  pdf.save(`informe_reactiva_${today}.pdf`);
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
 * trae más) y devuelve dónde terminó la gráfica para pegar el título abajo.
 */
function drawMiniTrend(
  pdf: import('jspdf').jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  values: number[],
  color: string,
): { barH: number; barTop: number } {
  const nonZero = values.filter((v) => v > 0);
  if (nonZero.length === 0) {
    pdf.setDrawColor(CARD_BORDER);
    pdf.setLineWidth(0.5);
    pdf.line(x, y, x + w, y);
    return { barH: 0, barTop: y };
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
  return { barH: h, barTop: y };
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

function sectionTitle(pdf: import('jspdf').jsPDF, title: string, y: number): number {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(INK);
  pdf.text(t(title), MARGIN, y);
  pdf.setFont('helvetica', 'normal');
  return y + 16;
}
