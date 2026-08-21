import type { DatosInformeMensual, SeccionInforme } from '../domain/informeMensual';
import {
  etiquetaDelPeriodo,
  seccionesDelInforme,
  semanasDelInforme,
  sufijoDeArchivo,
} from '../domain/informeMensual';
import { diaDeMayorConsumo, horaDeMayorConsumo } from '../domain/detalleDelPeriodo';
import { mergeSeries } from './mergeSeries';
import { formatCop, formatKwh, formatLocalDateTime, formatWatts } from './format';
import { monthLabel } from './labels';
import {
  BOTTOM_LIMIT,
  CARD_BORDER,
  CONTENT_W,
  EXPORT,
  FAINT,
  IMPORT,
  INK,
  MARGIN,
  MUTED,
  drawFooters,
  ensureSpace,
  calloutNote,
  methodologyNote,
  nombreDeArchivo,
  paragraph,
  reportHeader,
  sectionTitle,
  table,
  t,
} from './pdfKit';
import type { ColumnaTabla } from './pdfKit';

/**
 * El informe mensual: lo que el cliente archiva o reenvía una vez al mes.
 *
 * Todo el contenido ya existe como endpoints; acá se ensambla. Qué secciones
 * entran lo decide `seccionesDelInforme`, que vive aparte porque esa decisión
 * —omitir lo que el dato no sostiene— es la que hay que poder revisar.
 *
 * Todo vectorial, ninguna captura: el PDF se busca, se selecciona y no se
 * pixela al imprimirlo.
 */

/** Cuántas anomalías se listan antes de resumir el resto. */
const MAXIMO_ANOMALIAS = 6;

const PIE = 'EMS Monitor · Informe mensual generado desde el panel de monitoreo';

export async function buildMonthlyReportPdf(datos: DatosInformeMensual): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  renderMonthlyReport(pdf, datos);
  pdf.save(
    nombreDeArchivo(
      'informe_energia',
      sufijoDeArchivo(datos.reporte.period_start, datos.reporte.period_end),
    ),
  );
}

/** Dibuja el informe y devuelve las secciones que quedaron en él. */
export function renderMonthlyReport(
  pdf: import('jspdf').jsPDF,
  datos: DatosInformeMensual,
): SeccionInforme[] {
  let y = encabezado(pdf, datos, MARGIN);

  const dibujo: Record<SeccionInforme, () => void> = {
    resumen: () => {
      y = ensureSpace(pdf, y, 110);
      y = seccionResumen(pdf, datos, y);
    },
    cascada: () => {
      y = ensureSpace(pdf, y, 120);
      y = seccionCascada(pdf, datos, y);
    },
    semanas: () => {
      y = ensureSpace(pdf, y, 120);
      y = seccionSemanas(pdf, datos, y);
    },
    cobertura: () => {
      y = ensureSpace(pdf, y, 60);
      y = seccionCobertura(pdf, datos, y);
    },
    heatmap: () => {
      y = ensureSpace(pdf, y, altoDelHeatmap(datos.heatmap?.dates.length ?? 0));
      y = seccionHeatmap(pdf, datos, y);
    },
    carga_base: () => {
      y = ensureSpace(pdf, y, 80);
      y = seccionCargaBase(pdf, datos, y);
    },
    anomalias: () => {
      y = ensureSpace(pdf, y, 100);
      y = seccionAnomalias(pdf, datos, y);
    },
    tipos_de_dia: () => {
      y = ensureSpace(pdf, y, 90);
      y = seccionTiposDeDia(pdf, datos, y);
    },
    sedes: () => {
      y = ensureSpace(pdf, y, 90);
      y = seccionSedes(pdf, datos, y);
    },
  };

  const secciones = seccionesDelInforme(datos);
  for (const seccion of secciones) {
    dibujo[seccion]();
  }

  // La nota metodológica cierra siempre: es lo que hace reproducible cada
  // cifra de arriba y separa lo medido de lo estimado.
  methodologyNote(pdf, notasMetodologicas(datos), y);
  drawFooters(pdf, PIE);
  return secciones;
}

/** Cómo se calculó lo que se acaba de leer, y qué parte es estimación. */
function notasMetodologicas(datos: DatosInformeMensual): string[] {
  const notas = [
    'La energía sale de los contadores acumulativos del medidor de frontera (diferencia entre lectura ' +
      'final e inicial de cada ventana), nunca de promediar potencia.',
    'El costo usa la tarifa del mes correspondiente. El crédito por exportar se reparte en dos tramos: ' +
      'lo exportado hasta lo importado en el mismo mes se paga al precio de compra, y solo el excedente ' +
      'restante al precio de excedente.',
  ];
  if (datos.proyeccion?.method === 'ewma_por_tipo_de_dia') {
    notas.push(
      'La proyección de cierre es una ESTIMACIÓN: media exponencial de las últimas cuatro semanas por ' +
        'tipo de día (laboral, sábado, domingo), con banda p10–p90 tomada de la dispersión real de esos días.',
    );
  }
  if (datos.cargaBase?.window === 'noche') {
    notas.push(
      'El consumo de fondo se midió solo en la franja nocturna: de día la generación propia enmascara ' +
        'el consumo real en un medidor de frontera.',
    );
  }
  if (datos.comparacion?.enough_peers) {
    notas.push(
      'La comparación entre sedes usa únicamente sedes del mismo cliente y del mismo tipo (con o sin ' +
        'generación propia). No se compara contra instalaciones de otros clientes.',
    );
  }
  return notas;
}

type Pdf = import('jspdf').jsPDF;

function encabezado(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  // Con generación propia el alcance cambia de verdad, no de redacción: el
  // medidor de frontera solo ve el balance neto y "consumo" deja de ser
  // sinónimo de "energía importada".
  const conGeneracion = datos.cargaBase?.window === 'noche';
  return reportHeader(
    pdf,
    {
      titulo: `Informe de energía · ${etiquetaDelPeriodo(
        datos.reporte.period_start,
        datos.reporte.period_end,
      )}`,
      sede: datos.sede,
      periodo: `Periodo: ${formatLocalDateTime(datos.reporte.period_start, 'd MMM yyyy')} — ${formatLocalDateTime(
        datos.reporte.period_end,
        'd MMM yyyy',
      )}`,
      alcance: conGeneracion
        ? 'medidor bidireccional en la acometida, en una instalación con generación propia. Se mide el ' +
          'balance neto: la energía importada de la red y la exportada hacia ella, no el consumo bruto ' +
          'de la instalación ni la generación.'
        : 'medidor bidireccional en la acometida. Toda la energía que pasa por él es consumo de la ' +
          'instalación tomado de la red.',
    },
    y,
  );
}

function seccionResumen(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  let cursor = sectionTitle(pdf, 'Resumen del mes', y);
  const { reporte, proyeccion } = datos;
  const tarjetas: { label: string; valor: string; color: string }[] = [
    { label: 'Importado', valor: formatKwh(reporte.consumption_kwh), color: IMPORT },
    { label: 'Exportado', valor: formatKwh(reporte.export_kwh), color: EXPORT },
    {
      label: reporte.costs.net_cost_cop < 0 ? 'Saldo a favor' : 'Neto a pagar',
      valor: formatCop(Math.abs(reporte.costs.net_cost_cop)),
      color: reporte.costs.net_cost_cop < 0 ? EXPORT : INK,
    },
  ];
  const boxW = (CONTENT_W - 2 * 10) / 3;
  const boxH = 52;
  tarjetas.forEach((tarjeta, i) => {
    const x = MARGIN + i * (boxW + 10);
    pdf.setDrawColor(CARD_BORDER);
    pdf.setLineWidth(0.75);
    pdf.roundedRect(x, cursor, boxW, boxH, 4, 4, 'S');
    pdf.setFillColor(tarjeta.color);
    pdf.rect(x, cursor, 3, boxH, 'F');
    pdf.setFontSize(7);
    pdf.setTextColor(MUTED);
    pdf.text(t(tarjeta.label), x + 9, cursor + 15);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(INK);
    pdf.text(t(tarjeta.valor), x + 9, cursor + boxH - 12);
    pdf.setFont('helvetica', 'normal');
  });
  cursor += boxH + 14;

  if (proyeccion?.cost_projected_cop != null && proyeccion.kwh_projected != null) {
    cursor = paragraph(
      pdf,
      `Proyección al cierre del mes: ${formatKwh(proyeccion.kwh_projected)} · ` +
        `${formatCop(proyeccion.cost_projected_cop)}` +
        (proyeccion.cost_p10_cop != null && proyeccion.cost_p90_cop != null
          ? ` (entre ${formatCop(proyeccion.cost_p10_cop)} y ${formatCop(proyeccion.cost_p90_cop)}).`
          : '.'),
      cursor,
      9,
    );
  }
  return cursor + 12;
}

function seccionCascada(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  const cursor = sectionTitle(pdf, 'De dónde sale el neto', y);
  const c = datos.reporte.costs;

  // Tabla y no texto colocado a mano: una etiqueta larga y un valor alineado a
  // la derecha terminan cruzándose en el medio de la hoja. Con columnas de
  // ancho fijo, lo que no cabe se recorta.
  const filas: string[][] = [
    [`Costo de lo importado (${formatKwh(c.consumption_kwh)})`, formatCop(c.consumption_cost_cop)],
    [
      `Crédito tramo 1 (${formatKwh(c.export_tier1_kwh)}, al precio de compra)`,
      `- ${formatCop(c.export_tier1_credit_cop)}`,
    ],
    [
      `Crédito tramo 2 (${formatKwh(c.export_tier2_kwh)}, al precio de excedente)`,
      `- ${formatCop(c.export_tier2_credit_cop)}`,
    ],
    [c.net_cost_cop < 0 ? 'Saldo a tu favor' : 'Neto a pagar', formatCop(Math.abs(c.net_cost_cop))],
  ];
  let despues = table(
    pdf,
    [
      { peso: 3, color: MUTED },
      { peso: 1, align: 'right' },
    ],
    filas,
    cursor,
    { totalAlFinal: true },
  );

  if (c.stale_months.length > 0) {
    despues = calloutNote(
      pdf,
      `${c.stale_months.map((m) => monthLabel(m)).join(', ')} sin tarifa registrada: se usó la más ` +
        'reciente anterior, así que el monto es una estimación.',
      despues,
    );
  }
  return despues;
}

function seccionCobertura(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  const cobertura = datos.cobertura;
  if (cobertura?.overall_ratio == null) return y;
  const pct = Math.round(cobertura.overall_ratio * 100);
  let cursor = sectionTitle(pdf, 'Calidad de los datos', y);
  cursor = paragraph(
    pdf,
    `Llegó el ${pct}% de las lecturas esperadas en el periodo` +
      (cobertura.incomplete_buckets > 0
        ? `, con ${cobertura.incomplete_buckets} ventana(s) incompleta(s). Los totales de este informe son parciales en esos tramos: un hueco de datos no es consumo cero.`
        : '. Los totales de este informe se apoyan en un periodo completo.') +
      (cobertura.expected_source === 'inferido'
        ? ' La referencia de cuántas lecturas esperar se infirió del propio periodo.'
        : ''),
    cursor,
  );
  return cursor + 12;
}

/**
 * Cómo se movió el consumo semana a semana, y dónde estuvieron los picos.
 *
 * Es lo que un informe mensual tiene que responder y el resumen de totales no
 * responde: qué semana se disparó y cuánto, qué día fue el más alto, a qué
 * hora se concentra la carga. Las semanas parciales de las puntas entran con
 * su etiqueta de fechas para que una semana corta no se lea como una semana
 * floja.
 *
 * Solo energía: el crédito por exportar se reparte en tramos contra lo
 * importado del mes entero, así que un costo por semana sumado acá no cuadraría
 * con la factura.
 */
function seccionSemanas(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  const semanas = semanasDelInforme(datos);
  if (semanas.length < 2) return y;

  let cursor = sectionTitle(pdf, 'Semana a semana', y);
  const conGeneracion = semanas.some((s) => s.exportacionKwh > 0);

  const columnas: ColumnaTabla[] = [
    { titulo: 'Semana', peso: 3 },
    { titulo: 'Importado', peso: 2, align: 'right' },
    ...(conGeneracion ? [{ titulo: 'Exportado', peso: 2, align: 'right' } as ColumnaTabla] : []),
    { titulo: 'vs. anterior', peso: 2, align: 'right' },
  ];

  const filas = semanas.map((semana, i) => {
    const previa = semanas[i - 1];
    // La primera semana no tiene contra qué compararse; un "0%" ahí sería
    // una comparación inventada.
    const delta =
      previa && previa.consumoKwh > 0 ? semana.consumoKwh / previa.consumoKwh - 1 : null;
    return [
      semana.etiqueta,
      formatKwh(semana.consumoKwh),
      ...(conGeneracion ? [formatKwh(semana.exportacionKwh)] : []),
      delta === null ? '—' : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}%`,
    ];
  });

  cursor = table(pdf, columnas, filas, cursor);

  const merged = mergeSeries(
    datos.reporte.consumption_series,
    datos.reporte.export_series,
    (time) => formatLocalDateTime(time, 'd MMM'),
  );
  const diaPico = diaDeMayorConsumo(merged);
  const horaPico = datos.heatmap ? horaDeMayorConsumo(datos.heatmap) : null;

  const notas: string[] = [];
  if (diaPico) {
    notas.push(
      `El día más alto fue el ${formatLocalDateTime(diaPico.time, 'd MMM')} con ${formatKwh(diaPico.kwh)}.`,
    );
  }
  if (horaPico) {
    notas.push(
      `La hora de mayor consumo fue las ${String(horaPico.hora).padStart(2, '0')}:00` +
        (horaPico.fecha
          ? ` del ${formatLocalDateTime(`${horaPico.fecha}T12:00:00Z`, 'd MMM')}`
          : '') +
        `, con ${formatKwh(horaPico.kwh)}.`,
    );
  }
  if (notas.length > 0) {
    cursor = paragraph(pdf, notas.join(' '), cursor + 4);
  }

  return cursor + 6;
}

/** El ancho de una casilla: 24 horas repartidas en el ancho útil menos la columna de fechas. */
const CELDA_HEATMAP = Math.min(11, (CONTENT_W - 46) / 24);

/**
 * El alto de una fila del mapa, y cuánto ocupa el mapa entero.
 *
 * El alto se encoge para que la cuadrícula quepa siempre en una página: el
 * reserva fijo de 200 pt que había antes alcanzaba para unos 25 días, y un mes
 * de 31 empujaba las últimas filas encima del pie —justo el caso normal de un
 * informe mensual—. Con rangos más largos las filas se achican en vez de
 * desbordarse.
 */
const ALTO_UTIL = BOTTOM_LIMIT - MARGIN - 60;

function altoDeFila(dias: number): number {
  if (dias === 0) return 0;
  return Math.max(1.5, Math.min(6, CELDA_HEATMAP, ALTO_UTIL / dias - 1.5));
}

function altoDelHeatmap(dias: number): number {
  // Título, la cuadrícula, la fila de horas y la leyenda.
  return dias === 0 ? 0 : 26 + dias * (altoDeFila(dias) + 1.5) + 26;
}

function seccionHeatmap(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  const heatmap = datos.heatmap;
  if (!heatmap || heatmap.dates.length === 0) return y;
  let cursor = sectionTitle(pdf, 'Consumo por hora y día', y);

  const valores = heatmap.values.flat().filter((v): v is number => v !== null);
  const maximo = Math.max(...valores, 0.0001);
  const celda = CELDA_HEATMAP;
  const alto = altoDeFila(heatmap.dates.length);

  pdf.setFontSize(6);
  heatmap.dates.forEach((fecha, fila) => {
    const filaY = cursor + fila * (alto + 1.5);
    pdf.setTextColor(FAINT);
    pdf.text(t(formatLocalDateTime(`${fecha}T12:00:00Z`, 'd MMM')), MARGIN, filaY + alto - 1);
    for (let hora = 0; hora < 24; hora += 1) {
      const valor = heatmap.values[fila]?.[hora] ?? null;
      const x = MARGIN + 42 + hora * celda;
      if (valor === null) {
        // Una hora sin dato queda en blanco con borde: no es consumo cero.
        pdf.setDrawColor(CARD_BORDER);
        pdf.setLineWidth(0.3);
        pdf.rect(x, filaY, celda - 1, alto, 'S');
        continue;
      }
      const intensidad = Math.min(1, valor / maximo);
      // Ámbar de claro a oscuro según la intensidad, sin pasar por blanco.
      pdf.setFillColor(
        Math.round(254 - intensidad * 108),
        Math.round(243 - intensidad * 179),
        Math.round(199 - intensidad * 185),
      );
      pdf.rect(x, filaY, celda - 1, alto, 'F');
    }
  });
  cursor += heatmap.dates.length * (alto + 1.5) + 8;

  pdf.setFontSize(7);
  pdf.setTextColor(FAINT);
  for (let hora = 0; hora < 24; hora += 3) {
    pdf.text(`${hora}h`, MARGIN + 42 + hora * celda, cursor);
  }
  return cursor + 16;
}

function seccionCargaBase(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  const base = datos.cargaBase;
  if (base?.current_w == null) return y;
  let cursor = sectionTitle(pdf, 'Consumo de fondo', y);
  cursor = paragraph(
    pdf,
    `La instalación consume ${formatWatts(base.current_w)} de forma permanente` +
      (base.window === 'noche' ? ' (medido en la franja nocturna, sin sol)' : '') +
      (base.monthly_kwh != null ? `, unos ${formatKwh(base.monthly_kwh)} al mes` : '') +
      (base.monthly_cost_cop != null ? ` (aprox. ${formatCop(base.monthly_cost_cop)})` : '') +
      '.' +
      (base.trend_delta_w != null && base.trend_delta_w > 20
        ? ` Subió ${formatWatts(base.trend_delta_w)} respecto de la semana anterior y no volvió a bajar: suele ser algo que quedó encendido.`
        : ''),
    cursor,
  );
  return cursor + 12;
}

function seccionAnomalias(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  const historial = datos.historial;
  if (!historial) return y;
  let cursor = sectionTitle(pdf, 'Qué se salió de lo normal', y);

  if (historial.level_shift) {
    cursor = paragraph(pdf, historial.level_shift.message, cursor);
    cursor += 10;
  }

  if (historial.anomalies.length === 0) return cursor;

  const visibles = historial.anomalies.slice(0, MAXIMO_ANOMALIAS);
  cursor = table(
    pdf,
    [
      { titulo: 'Día', peso: 1, color: MUTED },
      { titulo: 'Qué pasó', peso: 5 },
    ],
    visibles.map((anomalia) => [
      formatLocalDateTime(anomalia.timestamp, 'd MMM'),
      anomalia.message,
    ]),
    cursor,
    { size: 8.5 },
  );

  const restantes = historial.anomalies.length - visibles.length;
  if (restantes > 0) {
    pdf.setFontSize(7.5);
    pdf.setTextColor(FAINT);
    pdf.text(t(`y ${restantes} día(s) atípico(s) más en el periodo.`), MARGIN, cursor);
    cursor += 14;
  }
  return cursor;
}

function seccionTiposDeDia(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  const arquetipos = datos.arquetipos;
  if (!arquetipos || arquetipos.archetypes.length === 0) return y;
  const cursor = sectionTitle(pdf, 'Tipos de día', y);

  return table(
    pdf,
    [
      { titulo: 'Tipo de día', peso: 3 },
      { titulo: 'Días', peso: 1, align: 'right', color: MUTED },
      { titulo: 'Consumo típico', peso: 2, align: 'right' },
    ],
    arquetipos.archetypes.map((arquetipo) => [
      arquetipo.label,
      String(arquetipo.day_count),
      `${formatKwh(arquetipo.avg_kwh)} por día`,
    ]),
    cursor,
  );
}

function seccionSedes(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  const comparacion = datos.comparacion;
  if (!comparacion?.enough_peers) return y;
  let cursor = sectionTitle(pdf, 'Frente a tus otras sedes', y);

  cursor = table(
    pdf,
    [
      { titulo: 'Sede', peso: 3 },
      { titulo: 'Consumo medio', peso: 2, align: 'right' },
    ],
    comparacion.peers
      .slice(0, 8)
      .map((sede) => [
        sede.is_self ? `${sede.name} (esta sede)` : sede.name,
        `${formatKwh(sede.kwh_per_day)} por día`,
      ]),
    cursor,
  );

  pdf.setFontSize(7.5);
  pdf.setTextColor(FAINT);
  pdf.text(
    t('Solo tus propias sedes, y solo las del mismo tipo (con o sin generación propia).'),
    MARGIN,
    cursor,
  );
  return cursor + 16;
}
