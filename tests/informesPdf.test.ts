/**
 * Los tres informes en PDF: anatomía, geometría y alineación.
 *
 * No se puede "mirar" un PDF desde un test, pero los defectos que se ven al
 * abrirlo son medibles: dos textos encima del otro, una línea que se sale de
 * la hoja, contenido pisando el pie, o columnas que arrancan cada una en un
 * borde distinto. `pdfInspector` anota cada `text()` con su caja real y estas
 * pruebas afirman sobre esa geometría.
 *
 * Con este banco aparecieron dos defectos que ya estaban en el panel: los
 * rótulos de los cuadrantes se dibujaban a un `top` de distancia de su tarjeta
 * —encima de la sección siguiente en la primera fila, fuera de la hoja en la
 * segunda— y las tarjetas usaban dos sangrados distintos según el informe.
 */

import { describe, expect, test } from '@rstest/core';
import type { jsPDF } from 'jspdf';
import { renderAnalyticsSummary } from '../src/utils/analyticsSummaryPdf';
import { renderMonthlyReport } from '../src/utils/monthlyReportPdf';
import { renderReactiveQuadrants } from '../src/utils/reactiveQuadrantsPdf';
import {
  BOTTOM_LIMIT,
  MARGIN,
  PADDING_TARJETA,
  PAGE_H,
  PAGE_W,
  SANGRIA_VINETA,
  t,
} from '../src/utils/pdfKit';
import type { CajaDeTexto } from './pdfInspector';
import {
  desbordes,
  describir,
  documentoInstrumentado,
  invadenElPie,
  solapamientos,
} from './pdfInspector';
import { MENSUAL_CARGADO, REACTIVA, RESUMEN } from './fixturesInformes';

/**
 * Los tres bordes en los que puede arrancar un texto de la primera columna: el
 * margen, el sangrado de tarjeta y el de viñeta. Cualquier otro valor cerca del
 * margen es una columna corrida.
 */
const BORDES_VALIDOS = [MARGIN, MARGIN + PADDING_TARJETA, MARGIN + SANGRIA_VINETA];

function dibujar(render: (pdf: jsPDF) => unknown): { cajas: CajaDeTexto[]; paginas: number } {
  const { pdf, cajas, paginas } = documentoInstrumentado();
  render(pdf);
  return { cajas, paginas: paginas() };
}

/** Los bordes izquierdos usados por el texto de la primera columna. */
function bordesDeLaPrimeraColumna(cajas: CajaDeTexto[]): number[] {
  return [
    ...new Set(
      cajas
        .map((caja) => Math.round(caja.x0))
        .filter((x) => x >= MARGIN - 1 && x <= MARGIN + SANGRIA_VINETA + 4),
    ),
  ].sort((a, b) => a - b);
}

const INFORMES: { nombre: string; render: (pdf: jsPDF) => unknown }[] = [
  { nombre: 'ejecutivo', render: (pdf) => renderAnalyticsSummary(pdf, RESUMEN) },
  { nombre: 'reactiva', render: (pdf) => renderReactiveQuadrants(pdf, REACTIVA) },
  { nombre: 'mensual', render: (pdf) => renderMonthlyReport(pdf, MENSUAL_CARGADO) },
];

for (const { nombre, render } of INFORMES) {
  describe(`el informe ${nombre}`, () => {
    test('ningún texto queda encima de otro', () => {
      const { cajas } = dibujar(render);

      const pares = solapamientos(cajas);
      expect(pares.map(([a, b]) => `${describir(a)} || ${describir(b)}`)).toEqual([]);
    });

    test('ningún texto se sale de la caja útil de la hoja', () => {
      const { cajas } = dibujar(render);

      expect(desbordes(cajas).map(describir)).toEqual([]);
    });

    test('nada invade la banda reservada al pie', () => {
      const { cajas } = dibujar(render);

      expect(invadenElPie(cajas).map(describir)).toEqual([]);
    });

    test('la primera columna arranca siempre en el mismo sitio', () => {
      const { cajas } = dibujar(render);

      for (const borde of bordesDeLaPrimeraColumna(cajas)) {
        expect(BORDES_VALIDOS).toContain(borde);
      }
    });

    test('el pie numera todas las páginas', () => {
      const { pdf, paginas } = documentoInstrumentado();
      render(pdf);

      const contenido = (pdf.internal as unknown as { pages: string[][] }).pages;
      for (let page = 1; page <= paginas(); page += 1) {
        expect(contenido[page]?.join('\n')).toContain('gina');
      }
    });
  });
}

describe('la anatomía de cada informe', () => {
  test('el ejecutivo trae energía, perfil, eficiencia, acciones y metodología', () => {
    const { pdf } = documentoInstrumentado();

    expect(renderAnalyticsSummary(pdf, RESUMEN)).toEqual([
      'energia',
      'perfil',
      'eficiencia',
      'acciones',
      'metodologia',
    ]);
  });

  test('el de reactiva trae resumen, cuadrantes, lectura, acciones y metodología', () => {
    const { pdf } = documentoInstrumentado();

    expect(renderReactiveQuadrants(pdf, REACTIVA)).toEqual([
      'resumen',
      'cuadrantes',
      'lectura',
      'acciones',
      'metodologia',
    ]);
  });

  test('un periodo sin reactiva no rompe el informe', () => {
    const { pdf } = documentoInstrumentado();

    expect(() =>
      renderReactiveQuadrants(pdf, {
        ...REACTIVA,
        q1_kvarh: 0,
        q2_kvarh: 0,
        q3_kvarh: 0,
        q4_kvarh: 0,
        total_import_kvarh: 0,
        total_export_kvarh: 0,
        balance_kvarh: 0,
        dominant: null,
        dominant_kvarh: 0,
        trend: [],
      }),
    ).not.toThrow();
  });

  test('un mes cargado pagina en vez de amontonarse', () => {
    const { paginas } = dibujar((pdf) => renderMonthlyReport(pdf, MENSUAL_CARGADO));

    expect(paginas).toBeGreaterThan(1);
  });
});

describe('con datos largos de verdad', () => {
  /**
   * El caso que rompe cualquier maquetado hecho a mano: nombres y mensajes que
   * no caben. Con columnas de ancho fijo el texto se recorta; sin ellas, la
   * etiqueta y su valor se cruzan en el medio de la hoja.
   */
  const MENSUAL_DESBORDADO = {
    ...MENSUAL_CARGADO,
    sede: 'Planta de tratamiento de aguas residuales del municipio · Tablero general de baja tensión',
    comparacion: {
      ...MENSUAL_CARGADO.comparacion!,
      peers: MENSUAL_CARGADO.comparacion!.peers.map((sede, i) => ({
        ...sede,
        name: `Sede ${i + 1} — bodega de almacenamiento refrigerado y oficinas administrativas anexas`,
        kwh_per_day: 12345.678,
      })),
    },
    arquetipos: {
      ...MENSUAL_CARGADO.arquetipos!,
      archetypes: MENSUAL_CARGADO.arquetipos!.archetypes.map((arquetipo) => ({
        ...arquetipo,
        label: `${arquetipo.label} con jornada extendida, turno nocturno y mantenimiento programado`,
        avg_kwh: 98765.4,
      })),
    },
    historial: {
      ...MENSUAL_CARGADO.historial!,
      anomalies: MENSUAL_CARGADO.historial!.anomalies.map((anomalia) => ({
        ...anomalia,
        message: `${anomalia.message} — y una explicación larguísima que ningún maquetado a mano soportaría sin cruzarse con la columna de al lado`,
      })),
    },
  };

  test('los textos largos se recortan en vez de cruzarse', () => {
    const { cajas } = dibujar((pdf) => renderMonthlyReport(pdf, MENSUAL_DESBORDADO));

    expect(solapamientos(cajas).map(([a, b]) => `${describir(a)} || ${describir(b)}`)).toEqual([]);
    expect(desbordes(cajas).map(describir)).toEqual([]);
  });

  test('tampoco se salen de la hoja ni pisan el pie', () => {
    const { cajas } = dibujar((pdf) => renderMonthlyReport(pdf, MENSUAL_DESBORDADO));

    expect(invadenElPie(cajas).map(describir)).toEqual([]);
  });
});

/**
 * Los caracteres que la fuente estándar de jsPDF (WinAnsi/CP1252) sabe
 * dibujar. Cualquier otro sale como basura en el PDF.
 */
function fueraDeLaFuente(texto: string): string[] {
  const EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ\u2018\u2019\u201C\u201D•–—˜™š›œžŸ';
  return [...texto].filter((caracter) => {
    const codigo = caracter.codePointAt(0) ?? 0;
    if (codigo >= 0x20 && codigo <= 0x7e) return false;
    if (codigo >= 0xa0 && codigo <= 0xff) return false;
    return !EXTRA.includes(caracter);
  });
}

describe('el texto de los informes', () => {
  for (const { nombre, render } of INFORMES) {
    test(`el ${nombre} no escribe caracteres que la fuente no tiene`, () => {
      // El signo menos matemático se imprimía como `"␒` en la cascada de la
      // factura: la fuente no lo tiene y jsPDF no avisa, dibuja basura.
      const { cajas } = dibujar(render);

      const rotos = cajas.flatMap((caja) =>
        fueraDeLaFuente(caja.texto).map((caracter) => `${caracter} en "${caja.texto}"`),
      );
      expect(rotos).toEqual([]);
    });
  }

  test('los espacios que la fuente no tiene se reemplazan', () => {
    // Las fuentes estándar de jsPDF son WinAnsi: un espacio duro o angosto
    // —que el formateo es-CO mete en "$ 1.234"— sale como un carácter raro.
    expect(t('$ 1.234')).toBe('$ 1.234');
    expect(t('12 %')).toBe('12 %');
    expect(t('$ 1.234')).not.toContain(' ');
  });

  test('el límite inferior deja sitio para el pie', () => {
    expect(BOTTOM_LIMIT).toBeLessThan(PAGE_H - 40);
    expect(PAGE_W).toBeGreaterThan(MARGIN * 2);
  });
});
