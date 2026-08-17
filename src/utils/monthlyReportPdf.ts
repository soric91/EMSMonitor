import type { DatosInformeMensual, SeccionInforme } from '../domain/informeMensual';
import { seccionesDelInforme } from '../domain/informeMensual';
import { formatCop, formatKwh, formatLocalDateTime, formatWatts } from './format';
import { monthLabel } from './labels';
import {
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
  paragraph,
  sectionTitle,
  t,
} from './pdfKit';

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

const PIE = 'EMS Monitor · Informe mensual generado desde el panel de monitoreo';

export async function buildMonthlyReportPdf(datos: DatosInformeMensual): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  let y = MARGIN;

  y = encabezado(pdf, datos, y);

  const dibujo: Record<SeccionInforme, () => void> = {
    resumen: () => {
      y = ensureSpace(pdf, y, 110);
      y = seccionResumen(pdf, datos, y);
    },
    cascada: () => {
      y = ensureSpace(pdf, y, 120);
      y = seccionCascada(pdf, datos, y);
    },
    cobertura: () => {
      y = ensureSpace(pdf, y, 60);
      y = seccionCobertura(pdf, datos, y);
    },
    heatmap: () => {
      y = ensureSpace(pdf, y, 200);
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

  for (const seccion of seccionesDelInforme(datos)) {
    dibujo[seccion]();
  }

  drawFooters(pdf, PIE);
  pdf.save(`informe_mensual_${datos.mes}.pdf`);
}

type Pdf = import('jspdf').jsPDF;

function encabezado(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  pdf.setFillColor(EXPORT);
  pdf.rect(MARGIN, y, 26, 4, 'F');
  let cursor = y + 18;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(19);
  pdf.setTextColor(INK);
  pdf.text(t(`Informe de energía · ${monthLabel(datos.mes, 'long')}`), MARGIN, cursor);
  cursor += 16;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(MUTED);
  pdf.text(
    t(
      `${datos.sede}  ·  Generado: ${formatLocalDateTime(
        new Date().toISOString(),
        'd MMM yyyy, HH:mm',
      )} (hora Bogotá)`,
    ),
    MARGIN,
    cursor,
  );
  return cursor + 24;
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
  let cursor = sectionTitle(pdf, 'De dónde sale el neto', y);
  const c = datos.reporte.costs;
  const filas: [string, string][] = [
    [`Costo de lo importado (${formatKwh(c.consumption_kwh)})`, formatCop(c.consumption_cost_cop)],
    [
      `Crédito tramo 1 (${formatKwh(c.export_tier1_kwh)}, al precio de compra)`,
      `− ${formatCop(c.export_tier1_credit_cop)}`,
    ],
    [
      `Crédito tramo 2 (${formatKwh(c.export_tier2_kwh)}, al precio de excedente)`,
      `− ${formatCop(c.export_tier2_credit_cop)}`,
    ],
  ];
  pdf.setFontSize(9);
  for (const [etiqueta, valor] of filas) {
    pdf.setTextColor(MUTED);
    pdf.text(t(etiqueta), MARGIN, cursor);
    pdf.setTextColor(INK);
    pdf.text(t(valor), MARGIN + CONTENT_W, cursor, { align: 'right' });
    cursor += 14;
  }
  pdf.setDrawColor(CARD_BORDER);
  pdf.line(MARGIN, cursor - 4, MARGIN + CONTENT_W, cursor - 4);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(INK);
  pdf.text(t(c.net_cost_cop < 0 ? 'Saldo a tu favor' : 'Neto a pagar'), MARGIN, cursor + 10);
  pdf.text(t(formatCop(Math.abs(c.net_cost_cop))), MARGIN + CONTENT_W, cursor + 10, {
    align: 'right',
  });
  pdf.setFont('helvetica', 'normal');
  cursor += 24;

  if (c.stale_months.length > 0) {
    pdf.setFontSize(8);
    pdf.setTextColor(IMPORT);
    pdf.text(
      t(
        `Advertencia: ${c.stale_months.map((m) => monthLabel(m)).join(', ')} sin tarifa registrada; ` +
          `se usó la más reciente anterior.`,
      ),
      MARGIN,
      cursor,
    );
    cursor += 14;
  }
  return cursor + 8;
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

function seccionHeatmap(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  const heatmap = datos.heatmap;
  if (!heatmap || heatmap.dates.length === 0) return y;
  let cursor = sectionTitle(pdf, 'Consumo por hora y día', y);

  const valores = heatmap.values.flat().filter((v): v is number => v !== null);
  const maximo = Math.max(...valores, 0.0001);
  const celda = Math.min(11, (CONTENT_W - 46) / 24);
  const alto = Math.min(6, celda);

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
      (base.monthly_cost_cop != null ? ` ≈ ${formatCop(base.monthly_cost_cop)}` : '') +
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
    cursor += 6;
  }
  pdf.setFontSize(8.5);
  for (const anomalia of historial.anomalies.slice(0, 6)) {
    cursor = ensureSpace(pdf, cursor, 16);
    pdf.setTextColor(FAINT);
    pdf.text(t(formatLocalDateTime(anomalia.timestamp, 'd MMM')), MARGIN, cursor);
    pdf.setTextColor(INK);
    pdf.text(t(anomalia.message), MARGIN + 48, cursor);
    cursor += 13;
  }
  if (historial.anomalies.length > 6) {
    pdf.setTextColor(FAINT);
    pdf.text(t(`y ${historial.anomalies.length - 6} día(s) atípico(s) más.`), MARGIN, cursor);
    cursor += 13;
  }
  return cursor + 8;
}

function seccionTiposDeDia(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  const arquetipos = datos.arquetipos;
  if (!arquetipos || arquetipos.archetypes.length === 0) return y;
  let cursor = sectionTitle(pdf, 'Tipos de día', y);
  pdf.setFontSize(9);
  for (const arquetipo of arquetipos.archetypes) {
    cursor = ensureSpace(pdf, cursor, 16);
    pdf.setTextColor(INK);
    pdf.text(t(arquetipo.label), MARGIN, cursor);
    pdf.setTextColor(MUTED);
    pdf.text(
      t(`${arquetipo.day_count} días · ${formatKwh(arquetipo.avg_kwh)} por día`),
      MARGIN + CONTENT_W,
      cursor,
      { align: 'right' },
    );
    cursor += 14;
  }
  return cursor + 8;
}

function seccionSedes(pdf: Pdf, datos: DatosInformeMensual, y: number): number {
  const comparacion = datos.comparacion;
  if (!comparacion?.enough_peers) return y;
  let cursor = sectionTitle(pdf, 'Frente a tus otras sedes', y);
  pdf.setFontSize(9);
  for (const sede of comparacion.peers.slice(0, 8)) {
    cursor = ensureSpace(pdf, cursor, 16);
    pdf.setFont('helvetica', sede.is_self ? 'bold' : 'normal');
    pdf.setTextColor(sede.is_self ? INK : MUTED);
    pdf.text(t(sede.name), MARGIN, cursor);
    pdf.text(t(`${formatKwh(sede.kwh_per_day)} por día`), MARGIN + CONTENT_W, cursor, {
      align: 'right',
    });
    cursor += 14;
  }
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(FAINT);
  pdf.text(
    t('Solo tus propias sedes, y solo las del mismo tipo (con o sin generación propia).'),
    MARGIN,
    cursor,
  );
  return cursor + 16;
}
