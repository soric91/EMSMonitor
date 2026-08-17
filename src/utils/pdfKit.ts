import type { jsPDF } from 'jspdf';

/**
 * Las primitivas compartidas de los informes en PDF, y la anatomía que los
 * tres comparten.
 *
 * Todo se dibuja vectorial (texto, líneas, rectángulos), nunca capturas de
 * pantalla: el PDF se puede buscar, seleccionar y no se pixela al imprimir.
 *
 * La estructura no es una decisión de gusto. Un informe de energía que alguien
 * archiva o le muestra a un tercero tiene que poder responder, sin que su
 * autor esté al lado:
 *
 * 1. **Qué se midió y dónde** — el alcance. En medición y verificación (IPMVP)
 *    la "frontera de medición" es parte obligatoria del reporte: acá se mide en
 *    la acometida, y con generación propia eso significa que solo se ve el
 *    balance neto. Un informe que omite eso invita a leer "consumo" donde dice
 *    "importación".
 * 2. **De cuándo** — periodo y fecha de emisión.
 * 3. **Qué tan completo está el dato** — ISO 50001:2018 exige un plan de
 *    recolección de datos; declarar la cobertura es el mínimo honesto, porque
 *    un hueco de medición y un ahorro se ven igual en un total.
 * 4. **Contra qué se compara** — la línea base. Sin ella, "bajó 8%" no
 *    significa nada.
 * 5. **Cómo se calculó** — la nota metodológica, para que el número sea
 *    reproducible y se distinga lo medido de lo estimado.
 *
 * Por eso `reportHeader` pide el alcance y `methodologyNote` cierra cada
 * informe: no son adornos, son las dos preguntas que un tercero hace primero.
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
 * Sangrado del texto dentro de una tarjeta, y del texto de una viñeta.
 *
 * Son constantes y no números sueltos porque la alineación se nota: con 8 en
 * un informe y 9 en otro, dos tarjetas iguales quedan con el texto corrido un
 * punto y el ojo lo lee como descuido, aunque no sepa por qué.
 */
export const PADDING_TARJETA = 9;
export const SANGRIA_VINETA = 12;

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
  // El mismo sangrado que las viñetas: leyenda y lista arrancan en la misma
  // columna, que es lo que hace que el bloque se vea alineado.
  pdf.text(t(label), x + SANGRIA_VINETA, y);
  return x + SANGRIA_VINETA + pdf.getTextWidth(label);
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

// ---------------------------------------------------------------------------
// La anatomía compartida de los informes
// ---------------------------------------------------------------------------

export interface ReportHeader {
  /** El título del informe. */
  titulo: string;
  /** Qué instalación se está reportando (sede · medidor). */
  sede?: string;
  /** El periodo cubierto, ya formateado. */
  periodo: string;
  /**
   * Qué mide el sistema y dónde, en una frase. Obligatorio a propósito: sin
   * frontera de medición declarada, "consumo" y "energía importada" se leen
   * como sinónimos y no lo son en una instalación con generación propia.
   */
  alcance: string;
}

/** Encabezado común: barra de color, título, identificación, periodo y alcance. */
export function reportHeader(pdf: jsPDF, header: ReportHeader, y: number): number {
  pdf.setFillColor(EXPORT);
  pdf.rect(MARGIN, y, 26, 4, 'F');
  let cursor = y + 18;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(19);
  pdf.setTextColor(INK);
  pdf.text(t(header.titulo), MARGIN, cursor);
  cursor += 15;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(MUTED);
  if (header.sede) {
    pdf.text(t(header.sede), MARGIN, cursor);
    cursor += 12;
  }
  pdf.text(t(`${header.periodo}  ·  Emitido: ${emitidoEn()} (hora Bogotá)`), MARGIN, cursor);
  cursor += 14;

  // El alcance va en gris pequeño y pegado al encabezado: es contexto de
  // lectura, no un hallazgo, pero tiene que estar antes que cualquier cifra.
  pdf.setFontSize(7.5);
  pdf.setTextColor(FAINT);
  const lineas = pdf.splitTextToSize(t(`Alcance: ${header.alcance}`), CONTENT_W) as string[];
  pdf.text(lineas, MARGIN, cursor);
  cursor += lineas.length * 9 + 12;

  pdf.setDrawColor(CARD_BORDER);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN, cursor - 6, PAGE_W - MARGIN, cursor - 6);
  return cursor + 8;
}

function emitidoEn(): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
}

export interface KpiCard {
  label: string;
  value: string;
  color: string;
  /** Segunda línea opcional: el contexto que hace legible la cifra. */
  hint?: string;
}

/**
 * La fila de tarjetas de KPI. Estaba copiada en los tres informes con tres
 * alturas distintas; acá se calcula según haya o no segunda línea, para que
 * las tarjetas de todos los informes se vean iguales.
 */
export function kpiCards(pdf: jsPDF, cards: KpiCard[], y: number): number {
  if (cards.length === 0) return y;
  const conHint = cards.some((c) => c.hint);
  const alto = conHint ? 62 : 52;
  const ancho = (CONTENT_W - (cards.length - 1) * 10) / cards.length;

  cards.forEach((card, i) => {
    const x = MARGIN + i * (ancho + 10);
    pdf.setDrawColor(CARD_BORDER);
    pdf.setLineWidth(0.75);
    pdf.roundedRect(x, y, ancho, alto, 4, 4, 'S');
    pdf.setFillColor(card.color);
    pdf.rect(x, y, 3, alto, 'F');

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(MUTED);
    pdf.text(
      pdf.splitTextToSize(t(card.label), ancho - PADDING_TARJETA * 2) as string[],
      x + PADDING_TARJETA,
      y + 13,
    );

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(INK);
    pdf.text(t(card.value), x + PADDING_TARJETA, y + (conHint ? alto - 21 : alto - 11));

    if (card.hint) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.setTextColor(FAINT);
      pdf.text(
        pdf.splitTextToSize(t(card.hint), ancho - PADDING_TARJETA * 2) as string[],
        x + PADDING_TARJETA,
        y + alto - 9,
      );
    }
  });
  pdf.setFont('helvetica', 'normal');
  return y + alto + 22;
}

/** Lista con viñetas, paginando sola cuando se acaba la hoja. */
export function bulletList(pdf: jsPDF, items: string[], y: number, color = EXPORT): number {
  let cursor = y;
  pdf.setFontSize(9);
  for (const item of items) {
    const lineas = pdf.splitTextToSize(t(item), CONTENT_W - SANGRIA_VINETA - 6) as string[];
    cursor = ensureSpace(pdf, cursor, lineas.length * 11 + 6);
    pdf.setFillColor(color);
    pdf.circle(MARGIN + 3, cursor - 2.5, 1.8, 'F');
    pdf.setTextColor(INK);
    pdf.text(lineas, MARGIN + SANGRIA_VINETA, cursor);
    cursor += lineas.length * 11 + 5;
  }
  return cursor + 8;
}

/** Aviso destacado (tarifa estimada, dato incompleto, cifra que es un tope). */
export function calloutNote(pdf: jsPDF, texto: string, y: number, color = IMPORT): number {
  const lineas = pdf.splitTextToSize(t(texto), CONTENT_W - 24) as string[];
  const alto = lineas.length * 10 + 14;
  const cursor = ensureSpace(pdf, y, alto + 6);

  pdf.setFillColor(AMBER_BG);
  pdf.rect(MARGIN, cursor, CONTENT_W, alto, 'F');
  pdf.setFillColor(color);
  pdf.rect(MARGIN, cursor, 3, alto, 'F');
  pdf.setFontSize(8);
  pdf.setTextColor(color);
  pdf.text(lineas, MARGIN + SANGRIA_VINETA, cursor + 12);
  return cursor + alto + 14;
}

/**
 * La nota metodológica del cierre: cómo se calculó lo que se acaba de leer.
 *
 * Va en todos los informes porque es lo que hace reproducible un número y lo
 * que separa lo medido de lo estimado. Un informe sin esto obliga a creerle.
 */
export function methodologyNote(pdf: jsPDF, notas: string[], y: number): number {
  let cursor = ensureSpace(pdf, y, 60);
  pdf.setDrawColor(CARD_BORDER);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN, cursor, PAGE_W - MARGIN, cursor);
  cursor += 14;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(MUTED);
  pdf.text(t('Nota metodológica'), MARGIN, cursor);
  cursor += 11;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(FAINT);
  for (const nota of notas) {
    const lineas = pdf.splitTextToSize(t(`· ${nota}`), CONTENT_W) as string[];
    cursor = ensureSpace(pdf, cursor, lineas.length * 9 + 4);
    pdf.text(lineas, MARGIN, cursor);
    cursor += lineas.length * 9 + 3;
  }
  return cursor + 6;
}

/** El nombre del archivo, con la fecha local para que ordene bien. */
export function nombreDeArchivo(prefijo: string, sufijo?: string): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  return `${prefijo}_${sufijo ?? hoy}.pdf`;
}

// ---------------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------------

export interface ColumnaTabla {
  /** Encabezado de la columna. Sin él, la tabla va sin fila de títulos. */
  titulo?: string;
  /** Peso relativo del ancho: las columnas se reparten el ancho útil. */
  peso: number;
  align?: 'left' | 'right';
  /** Color del texto de las celdas de esta columna. */
  color?: string;
}

export interface OpcionesTabla {
  /** Resalta la última fila con línea arriba y negrita: el total. */
  totalAlFinal?: boolean;
  size?: number;
}

/**
 * Una tabla con anchos de columna fijos.
 *
 * Existe porque colocar pares etiqueta/valor "a mano" —la etiqueta desde el
 * margen, el valor alineado a la derecha— aguanta hasta que una etiqueta crece:
 * ahí los dos textos se cruzan en el medio y el PDF sale con palabras
 * encimadas. Con columnas de ancho conocido eso no puede pasar: lo que no cabe
 * se recorta con puntos suspensivos, y el corte se ve como corte en vez de como
 * un choque.
 *
 * Cada fila comprueba que quepa antes de dibujarse, y al abrir página repite el
 * encabezado: una tabla partida sin títulos obliga a volver a la hoja anterior
 * para saber qué se está leyendo.
 */
export function table(
  pdf: jsPDF,
  columnas: ColumnaTabla[],
  filas: string[][],
  y: number,
  opciones: OpcionesTabla = {},
): number {
  const size = opciones.size ?? 9;
  const altoFila = size + 6;
  const pesoTotal = columnas.reduce((suma, columna) => suma + columna.peso, 0);
  const anchos = columnas.map((columna) => (columna.peso / pesoTotal) * CONTENT_W);
  const inicios = anchos.map((_, i) => MARGIN + anchos.slice(0, i).reduce((a, b) => a + b, 0));
  const hayEncabezado = columnas.some((columna) => columna.titulo);

  let cursor = y;
  const dibujarEncabezado = (): void => {
    if (!hayEncabezado) return;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(size - 1);
    pdf.setTextColor(MUTED);
    columnas.forEach((columna, i) => {
      if (!columna.titulo) return;
      celda(pdf, columna.titulo, inicios[i]!, anchos[i]!, cursor, columna.align);
    });
    pdf.setFont('helvetica', 'normal');
    cursor += 6;
    pdf.setDrawColor(CARD_BORDER);
    pdf.setLineWidth(0.5);
    pdf.line(MARGIN, cursor, PAGE_W - MARGIN, cursor);
    cursor += altoFila;
  };

  cursor = ensureSpace(pdf, cursor, altoFila * 2);
  dibujarEncabezado();

  filas.forEach((fila, indice) => {
    const esTotal = opciones.totalAlFinal === true && indice === filas.length - 1;
    const anterior = cursor;
    cursor = ensureSpace(pdf, cursor, altoFila + (esTotal ? 10 : 0));
    if (cursor !== anterior) dibujarEncabezado();

    if (esTotal) {
      pdf.setDrawColor(CARD_BORDER);
      pdf.setLineWidth(0.5);
      pdf.line(MARGIN, cursor - altoFila + 4, PAGE_W - MARGIN, cursor - altoFila + 4);
      pdf.setFont('helvetica', 'bold');
    }

    pdf.setFontSize(size);
    columnas.forEach((columna, i) => {
      pdf.setTextColor(esTotal ? INK : (columna.color ?? INK));
      celda(pdf, fila[i] ?? '', inicios[i]!, anchos[i]!, cursor, columna.align);
    });
    if (esTotal) pdf.setFont('helvetica', 'normal');
    cursor += altoFila;
  });

  return cursor + 8;
}

/**
 * Una celda: el texto recortado al ancho de su columna.
 *
 * El recorte es lo que convierte un choque de textos en un corte legible.
 *
 * La primera columna arranca EXACTAMENTE en el margen y la última termina en
 * el borde derecho del contenido, sin sangrado propio: así una tabla queda a
 * plomo con los párrafos y los títulos de su alrededor en vez de aparecer
 * corrida unos puntos. El aire entre columnas sale de reservar ancho, no de
 * mover el texto.
 */
function celda(
  pdf: jsPDF,
  texto: string,
  x: number,
  ancho: number,
  y: number,
  align: 'left' | 'right' = 'left',
): void {
  const recortado = recortar(pdf, t(texto), ancho - AIRE_ENTRE_COLUMNAS);
  if (align === 'right') {
    pdf.text(recortado, x + ancho, y, { align: 'right' });
    return;
  }
  pdf.text(recortado, x, y);
}

/** Ancho que se reserva para que dos columnas llenas no se toquen. */
const AIRE_ENTRE_COLUMNAS = 10;

/** Recorta con puntos suspensivos hasta que el texto entra en el ancho dado. */
export function recortar(pdf: jsPDF, texto: string, ancho: number): string {
  if (pdf.getTextWidth(texto) <= ancho) return texto;
  let corto = texto;
  while (corto.length > 1 && pdf.getTextWidth(`${corto}…`) > ancho) {
    corto = corto.slice(0, -1);
  }
  return `${corto.trimEnd()}…`;
}
