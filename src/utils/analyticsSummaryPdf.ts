import type { AnalyticsSummary } from '../api/types';
import { KPIS_ENERGIA } from '../domain/kpisEnergia';
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
  bulletList,
  calloutNote,
  drawFooters,
  ensureSpace,
  kpiCards,
  legendDot,
  paragraph,
  methodologyNote,
  nombreDeArchivo,
  reportHeader,
  sectionTitle,
  t,
} from './pdfKit';

/**
 * Informe ejecutivo del periodo, en PDF vectorial.
 *
 * Misma anatomía que los demás (`pdfKit`): identificación y alcance, resumen,
 * cuerpo, hallazgos, acciones y nota metodológica.
 */
export async function buildAnalyticsSummaryPdf(summary: AnalyticsSummary): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  renderAnalyticsSummary(pdf, summary);
  pdf.save(nombreDeArchivo('informe_energia'));
}

/** Dibuja el informe y devuelve las secciones que quedaron en él. */
export function renderAnalyticsSummary(
  pdf: import('jspdf').jsPDF,
  summary: AnalyticsSummary,
): string[] {
  const secciones: string[] = [];

  let y = reportHeader(
    pdf,
    {
      titulo: 'Informe ejecutivo de energía',
      periodo: `Periodo: ${formatLocalDateTime(summary.period_start, 'd MMM yyyy')} — ${formatLocalDateTime(
        summary.period_end,
        'd MMM yyyy',
      )}`,
      alcance:
        'medidor bidireccional en la acometida. Se mide la energía importada de la red y la exportada ' +
        'hacia ella; no hay medición en el inversor, así que el consumo propio cubierto por la ' +
        'generación no se observa directamente.',
    },
    MARGIN,
  );

  // ---------- Resumen ejecutivo ----------
  secciones.push('energia');
  y = sectionTitle(pdf, 'Energía del periodo', y);
  // Las etiquetas salen de `KPIS_ENERGIA`, la misma lista que pinta la tarjeta
  // en pantalla: estaban copiadas acá y el PDF quedó diciendo "(prom.)" sobre
  // valores que no lo son.
  y = kpiCards(
    pdf,
    KPIS_ENERGIA.map(({ key, label, tone }) => ({
      label,
      value: formatKwh(summary[key] as number),
      color: tone === 'import' ? IMPORT : EXPORT,
    })),
    y,
  );

  // ---------- Perfil horario ----------
  secciones.push('perfil');
  y = ensureSpace(pdf, y, 210);
  y = sectionTitle(pdf, 'Perfil horario promedio (hora Bogotá)', y);

  // leyenda + picos
  pdf.setFontSize(8);
  let legendX = MARGIN;
  legendX = legendDot(pdf, legendX, y, IMPORT, 'Importando de la red');
  legendX = legendDot(pdf, legendX, y, EXPORT, 'Exportando excedente');
  if (summary.peak_consumption_hour !== null) {
    pdf.setTextColor(IMPORT);
    pdf.text(t(`Pico de consumo: ${summary.peak_consumption_hour}:00`), legendX + 14, y);
    legendX += 14 + pdf.getTextWidth(`Pico de consumo: ${summary.peak_consumption_hour}:00`);
  }
  if (summary.peak_export_hour !== null) {
    pdf.setTextColor(EXPORT);
    pdf.text(t(`Pico de exportación: ${summary.peak_export_hour}:00`), legendX + 14, y);
  }
  y += 14;

  const chartH = 150;
  const axisW = 52;
  const chartX = MARGIN + axisW;
  const chartW = CONTENT_W - axisW;
  const values = summary.hourly_profile.map((p) => p.power_avg_w);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;
  const zeroY = y + (maxV / range) * chartH;

  // gridlines + etiquetas del eje Y
  pdf.setDrawColor(CARD_BORDER);
  pdf.setLineWidth(0.5);
  pdf.setFontSize(7);
  pdf.setTextColor(FAINT);
  for (const [v, gy] of [
    [maxV, y],
    [0, zeroY],
    [minV, y + chartH],
  ] as const) {
    pdf.line(chartX, gy, chartX + chartW, gy);
    pdf.text(t(formatWatts(v)), chartX - 6, gy + 2, { align: 'right' });
  }

  const slot = chartW / 24;
  const barW = slot * 0.62;
  summary.hourly_profile.forEach((p) => {
    const x = chartX + p.hour * slot + (slot - barW) / 2;
    const h = (Math.abs(p.power_avg_w) / range) * chartH;
    const barY = p.power_avg_w >= 0 ? zeroY - h : zeroY;
    pdf.setFillColor(p.power_avg_w >= 0 ? IMPORT : EXPORT);
    pdf.rect(x, barY, barW, h, 'F');
    const isPeak = p.hour === summary.peak_consumption_hour || p.hour === summary.peak_export_hour;
    if (isPeak) {
      pdf.setDrawColor(INK);
      pdf.setLineWidth(1);
      pdf.rect(x - 0.5, barY - 0.5, barW + 1, h + 1, 'S');
    }
  });

  // etiquetas del eje X cada 2h
  pdf.setFontSize(7);
  pdf.setTextColor(FAINT);
  for (let h = 0; h < 24; h += 2) {
    pdf.text(`${h}h`, chartX + h * slot + slot / 2, y + chartH + 11, { align: 'center' });
  }
  y += chartH + 30;

  // ---------- Eficiencia (condicional) ----------
  const eff = summary.efficiency;
  if (eff) {
    secciones.push('eficiencia');
    y = ensureSpace(pdf, y, 110);
    y = sectionTitle(pdf, 'Oportunidad de eficiencia', y);
    y = paragraph(
      pdf,
      `Podrías haber ahorrado hasta ~${formatCop(eff.potential_savings_cop)} este mes desplazando ` +
        `consumo a tus horas de mayor generación` +
        (summary.peak_export_hour !== null
          ? ` (alrededor de las ${summary.peak_export_hour}:00)`
          : '') +
        `. Es una COTA SUPERIOR: solo cuenta el excedente que superó lo importado ese mes —el resto ya ` +
        `se paga al precio de importación— y asume autoconsumirlo en vez de venderlo a ` +
        `${formatCop(eff.excedente_cop_kwh)}/kWh, comprando a ${formatCop(eff.cu_cop_kwh)}/kWh. El ` +
        `ahorro real depende de qué consumos puedas mover de hora.`,
      y,
    );
    y += 8;
    if (eff.stale) {
      y = calloutNote(
        pdf,
        `Cálculo hecho con la tarifa de ${monthLabel(eff.tariff_month, 'long')}: no hay tarifa del mes ` +
          `en curso registrada. Actualízala para que el monto sea exacto.`,
        y,
      );
    }
  }

  // ---------- Acciones ----------
  const recommendations = buildRecommendations(summary);
  if (recommendations.length > 0) {
    secciones.push('acciones');
    y = ensureSpace(pdf, y, 80);
    y = sectionTitle(pdf, 'Qué hacer con esto', y);
    y = bulletList(pdf, recommendations, y);
  }

  // ---------- Nota metodológica ----------
  secciones.push('metodologia');
  methodologyNote(
    pdf,
    [
      'El perfil horario promedia la potencia neta de cada hora local sobre todos los días del periodo. ' +
        'Positivo significa importar de la red; negativo, exportar excedente.',
      'La energía del periodo sale de los contadores acumulativos del medidor (diferencia entre lectura ' +
        'final e inicial), no de integrar la potencia instantánea.',
      'El ahorro potencial es una COTA SUPERIOR: asume que todo el excedente del tramo 2 pudo desplazarse ' +
        'a consumo propio. El ahorro real depende de qué cargas se puedan mover de hora.',
    ],
    y,
  );

  drawFooters(pdf, 'EMS Monitor · Informe ejecutivo generado desde el panel de monitoreo');
  return secciones;
}

/** Recomendaciones derivadas exclusivamente de los datos del periodo — nada inventado. */
function buildRecommendations(summary: AnalyticsSummary): string[] {
  const recs: string[] = [];
  const eff = summary.efficiency;

  if (summary.peak_export_hour !== null) {
    recs.push(
      `Programar las cargas flexibles del hogar (lavadora, calentador eléctrico, carga de vehículos o baterías) ` +
        `alrededor de las ${summary.peak_export_hour}:00, la franja de mayor excedente solar del periodo, ` +
        `para sustituir energía comprada a la red por generación propia.`,
    );
  }
  if (summary.peak_consumption_hour !== null && summary.peak_export_hour !== null) {
    recs.push(
      `El mayor consumo del periodo se concentra hacia las ${summary.peak_consumption_hour}:00, fuera de la ` +
        `ventana de generación. Evaluar qué parte de ese consumo puede adelantarse a horas de sol; cada kWh ` +
        `desplazado se paga al precio del excedente en lugar del precio de compra.`,
    );
  }
  if (summary.export_monthly_kwh > summary.consumption_monthly_kwh) {
    recs.push(
      `La exportación mensual (${formatKwh(summary.export_monthly_kwh)}) supera el consumo mensual ` +
        `(${formatKwh(summary.consumption_monthly_kwh)}): existe margen amplio de generación no aprovechada ` +
        `para autoconsumo antes de considerar ampliar la instalación.`,
    );
  }
  if (eff?.stale) {
    recs.push(
      `Registrar la tarifa del mes en curso en el módulo Tarifa: los cálculos de este informe usan la de ` +
        `${monthLabel(eff.tariff_month, 'long')} como referencia, lo que introduce imprecisión en los montos.`,
    );
  }
  recs.push(
    `Revisar este informe mensualmente: cambios en el perfil horario suelen anticipar consumos anómalos o ` +
      `degradación de la generación antes de que se reflejen en la factura.`,
  );
  return recs;
}
