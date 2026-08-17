import { jsPDF } from 'jspdf';
import { BOTTOM_LIMIT, MARGIN, PAGE_H, PAGE_W } from '../src/utils/pdfKit';

/**
 * Un banco de pruebas geométrico para los informes en PDF.
 *
 * Mirar el archivo generado no escala y depender del ojo tampoco: los defectos
 * que aparecen en un PDF —dos textos encima del otro, una línea que se sale por
 * la derecha, una sección que pisa el pie— son geométricos y se pueden medir.
 *
 * En vez de leer el archivo terminado, se envuelve el documento y se anota cada
 * llamada a `text()` con su posición, su tamaño y su ancho real (calculado por
 * el mismo jsPDF, con la fuente que va a usar). Con eso se reconstruye la caja
 * de cada línea y se pueden comprobar cosas que a simple vista se escapan.
 */

export interface CajaDeTexto {
  pagina: number;
  texto: string;
  /** Borde izquierdo y derecho ya resueltos según la alineación. */
  x0: number;
  x1: number;
  /** Borde superior e inferior, medidos desde arriba de la hoja. */
  y0: number;
  y1: number;
  size: number;
}

/** jsPDF separa las líneas de un array por este factor por defecto. */
const LINE_HEIGHT = 1.15;

interface Instrumentado {
  pdf: jsPDF;
  cajas: CajaDeTexto[];
  paginas: () => number;
}

/**
 * Crea un documento que anota todo lo que se le dibuja.
 *
 * Se intercepta `text`, y también `setFontSize`/`setPage`/`addPage`, porque el
 * tamaño y la página activa son estado del documento: sin seguirlos, las cajas
 * saldrían todas del mismo tamaño y en la misma hoja.
 */
export function documentoInstrumentado(): Instrumentado {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const cajas: CajaDeTexto[] = [];
  let size = 16;
  let pagina = 1;

  const textoOriginal = pdf.text.bind(pdf);
  const setFontSizeOriginal = pdf.setFontSize.bind(pdf);
  const setPageOriginal = pdf.setPage.bind(pdf);
  const addPageOriginal = pdf.addPage.bind(pdf);

  pdf.setFontSize = (valor: number) => {
    size = valor;
    return setFontSizeOriginal(valor);
  };
  pdf.setPage = (numero: number) => {
    pagina = numero;
    return setPageOriginal(numero);
  };
  pdf.addPage = ((...args: Parameters<typeof addPageOriginal>) => {
    pagina += 1;
    return addPageOriginal(...args);
  }) as typeof pdf.addPage;

  pdf.text = ((texto: string | string[], x: number, y: number, opciones?: { align?: string }) => {
    const lineas = Array.isArray(texto) ? texto : [texto];
    lineas.forEach((linea, i) => {
      if (linea === '') return;
      const ancho = pdf.getTextWidth(linea);
      const alineacion = opciones?.align ?? 'left';
      const x0 = alineacion === 'right' ? x - ancho : alineacion === 'center' ? x - ancho / 2 : x;
      const base = y + i * size * LINE_HEIGHT;
      cajas.push({
        pagina,
        texto: linea,
        x0,
        x1: x0 + ancho,
        // La `y` de jsPDF es la línea base: el texto sube casi todo su tamaño
        // por encima y baja un poco por debajo.
        y0: base - size * 0.8,
        y1: base + size * 0.25,
        size,
      });
    });
    return textoOriginal(texto as string, x, y, opciones);
  }) as typeof pdf.text;

  return { pdf, cajas, paginas: () => pdf.getNumberOfPages() };
}

/** Dos cajas se pisan si comparten página y sus rectángulos se cruzan. */
export function seSuperponen(a: CajaDeTexto, b: CajaDeTexto, holgura = 0.5): boolean {
  if (a.pagina !== b.pagina) return false;
  const cruzaX = a.x0 < b.x1 - holgura && b.x0 < a.x1 - holgura;
  const cruzaY = a.y0 < b.y1 - holgura && b.y0 < a.y1 - holgura;
  return cruzaX && cruzaY;
}

/** Todos los pares de texto que quedaron uno encima del otro. */
export function solapamientos(cajas: CajaDeTexto[]): [CajaDeTexto, CajaDeTexto][] {
  const pares: [CajaDeTexto, CajaDeTexto][] = [];
  for (let i = 0; i < cajas.length; i += 1) {
    for (let j = i + 1; j < cajas.length; j += 1) {
      if (seSuperponen(cajas[i]!, cajas[j]!)) pares.push([cajas[i]!, cajas[j]!]);
    }
  }
  return pares;
}

/** Texto que se sale de la caja útil de la hoja. */
export function desbordes(cajas: CajaDeTexto[]): CajaDeTexto[] {
  return cajas.filter(
    (caja) =>
      caja.x0 < MARGIN - 0.5 || caja.x1 > PAGE_W - MARGIN + 0.5 || caja.y0 < 0 || caja.y1 > PAGE_H,
  );
}

/** La banda del pie: ahí solo puede haber pie. */
export const PIE_DESDE = PAGE_H - 44;

/** Contenido que invadió la zona reservada al pie. */
export function invadenElPie(cajas: CajaDeTexto[]): CajaDeTexto[] {
  return cajas.filter((caja) => caja.y1 > BOTTOM_LIMIT && caja.y0 < PIE_DESDE);
}

/** Los bordes izquierdos distintos que se usaron, redondeados a un punto. */
export function margenesIzquierdos(cajas: CajaDeTexto[]): number[] {
  return [...new Set(cajas.map((caja) => Math.round(caja.x0)))].sort((a, b) => a - b);
}

/** Resumen legible de una caja, para que un fallo diga qué texto se rompió. */
export function describir(caja: CajaDeTexto): string {
  return `p${caja.pagina} y=${caja.y0.toFixed(0)}-${caja.y1.toFixed(0)} x=${caja.x0.toFixed(
    0,
  )}-${caja.x1.toFixed(0)} "${caja.texto.slice(0, 42)}"`;
}
