import type { jsPDF } from 'jspdf';

/**
 * Las primitivas compartidas de los informes en PDF.
 *
 * Vivían dentro de `analyticsSummaryPdf.ts` y el informe mensual las necesitaba
 * iguales: copiarlas habría dejado dos paletas y dos tipografías que se
 * separan en el primer retoque. Acá están una vez.
 *
 * Todo se dibuja vectorial (texto, líneas, rectángulos), nunca capturas de
 * pantalla: el PDF se puede buscar, seleccionar y no se pixela al imprimir.
 */

// Paleta: los mismos significados de color que la app.
export const INK = '#0f172a';
export const MUTED = '#64748b';
export const FAINT = '#94a3b8';
export const IMPORT = '#d97706';
export const EXPORT = '#059669';
export const AMBER_BG = '#fef3c7';
export const CARD_BORDER = '#e2e8f0';

export const PAGE_W = 595.28; // A4 en puntos
export const PAGE_H = 841.89;
export const MARGIN = 48;
export const CONTENT_W = PAGE_W - MARGIN * 2;
/** Desde acá abajo empieza el pie: nada de contenido por debajo. */
export const BOTTOM_LIMIT = PAGE_H - 56;

/**
 * Las fuentes estándar de jsPDF son WinAnsi: el espacio duro y el angosto que
 * mete el formateo es-CO salen como caracteres raros si no se reemplazan.
 */
export function t(s: string): string {
  return s.replace(/[\u00A0\u202F]/g, ' ');
}

export function sectionTitle(pdf: jsPDF, title: string, y: number): number {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(INK);
  pdf.text(t(title), MARGIN, y);
  pdf.setFont('helvetica', 'normal');
  return y + 16;
}

export function legendDot(pdf: jsPDF, x: number, y: number, color: string, label: string): number {
  pdf.setFillColor(color);
  pdf.circle(x + 3, y - 2.5, 3, 'F');
  pdf.setTextColor(MUTED);
  pdf.text(t(label), x + 10, y);
  return x + 10 + pdf.getTextWidth(label);
}

/** Texto de párrafo, con salto de línea automático. Devuelve la nueva `y`. */
export function paragraph(pdf: jsPDF, texto: string, y: number, size = 9): number {
  pdf.setFontSize(size);
  pdf.setTextColor(INK);
  const lines = pdf.splitTextToSize(t(texto), CONTENT_W) as string[];
  pdf.text(lines, MARGIN, y);
  return y + lines.length * (size + 2);
}

/**
 * Abre página nueva si lo que viene no cabe.
 *
 * Sin esto, una sección larga se dibuja encima del pie o directamente fuera de
 * la hoja: jsPDF no avisa, simplemente pinta donde se le diga.
 */
export function ensureSpace(pdf: jsPDF, y: number, needed: number): number {
  if (y + needed <= BOTTOM_LIMIT) return y;
  pdf.addPage();
  return MARGIN;
}

/** El pie con la numeración, en todas las páginas ya creadas. */
export function drawFooters(pdf: jsPDF, leyenda: string): void {
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(CARD_BORDER);
    pdf.setLineWidth(0.5);
    pdf.line(MARGIN, PAGE_H - 40, PAGE_W - MARGIN, PAGE_H - 40);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(FAINT);
    pdf.text(t(leyenda), MARGIN, PAGE_H - 28);
    pdf.text(`Página ${page} de ${total}`, PAGE_W - MARGIN, PAGE_H - 28, { align: 'right' });
  }
}
