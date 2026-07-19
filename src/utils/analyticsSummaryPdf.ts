import type { AnalyticsSummary } from '../api/types';
import { formatCop, formatKwh, formatLocalDateTime, formatWatts } from './format';

// Paleta del informe (los mismos significados de color de la app)
const INK = '#0f172a';
const MUTED = '#64748b';
const FAINT = '#94a3b8';
const IMPORT = '#d97706';
const EXPORT = '#059669';
const AMBER_BG = '#fef3c7';
const CARD_BORDER = '#e2e8f0';

const PAGE_W = 595.28; // A4 pt
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Las fuentes estándar de jsPDF son WinAnsi: sin NBSP/espacio angosto de es-CO. */
function t(s: string): string {
  return s.replace(/[\u00A0\u202F]/g, ' ');
}

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(
    new Date(`${month}-01T12:00:00Z`),
  );
}

export async function buildAnalyticsSummaryPdf(summary: AnalyticsSummary): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  let y = MARGIN;

  // ---------- Encabezado ----------
  pdf.setFillColor(EXPORT);
  pdf.rect(MARGIN, y, 26, 4, 'F');
  y += 18;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(19);
  pdf.setTextColor(INK);
  pdf.text('Informe ejecutivo de energía', MARGIN, y);
  y += 16;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(MUTED);
  pdf.text(
    t(
      `Periodo: ${formatLocalDateTime(summary.period_start, 'd MMM yyyy')} — ${formatLocalDateTime(
        summary.period_end,
        'd MMM yyyy',
      )}  ·  Generado: ${formatLocalDateTime(new Date().toISOString(), 'd MMM yyyy, HH:mm')} (hora Bogotá)`,
    ),
    MARGIN,
    y,
  );
  y += 24;

  // ---------- KPIs de energía ----------
  y = sectionTitle(pdf, 'Energía del periodo', y);
  const kpis: { label: string; value: string; color: string }[] = [
    { label: 'Consumo diario (prom.)', value: formatKwh(summary.consumption_daily_kwh), color: IMPORT },
    { label: 'Consumo semanal (prom.)', value: formatKwh(summary.consumption_weekly_kwh), color: IMPORT },
    { label: 'Consumo mensual', value: formatKwh(summary.consumption_monthly_kwh), color: IMPORT },
    { label: 'Exportación diaria (prom.)', value: formatKwh(summary.export_daily_kwh), color: EXPORT },
    { label: 'Exportación mensual', value: formatKwh(summary.export_monthly_kwh), color: EXPORT },
  ];
  const boxW = (CONTENT_W - 4 * 10) / 5;
  const boxH = 52;
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
    pdf.setFontSize(11);
    pdf.setTextColor(INK);
    pdf.text(t(kpi.value), x + 9, y + boxH - 11);
    pdf.setFont('helvetica', 'normal');
  });
  y += boxH + 26;

  // ---------- Perfil horario ----------
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
    y = sectionTitle(pdf, 'Oportunidad de eficiencia', y);
    const boxTop = y;
    const lines = pdf.splitTextToSize(
      t(
        `Podrías haber ahorrado hasta ~${formatCop(eff.potential_savings_cop)} este mes desplazando consumo ` +
          `a tus horas de mayor generación${
            summary.peak_export_hour !== null ? ` (alrededor de las ${summary.peak_export_hour}:00)` : ''
          }. Estimación tope: asume autoconsumir los ${formatKwh(eff.export_kwh)} exportados del mes en vez de ` +
          `venderlos a ${formatCop(eff.excedente_cop_kwh)}/kWh (compras a ${formatCop(eff.cu_cop_kwh)}/kWh). ` +
          `El ahorro real depende de qué consumos puedas mover.`,
      ),
      CONTENT_W - 24,
    ) as string[];
    const staleLine = eff.stale
      ? (pdf.splitTextToSize(
          t(
            `Advertencia: cálculo hecho con la tarifa de ${monthLabel(eff.tariff_month)} (no hay tarifa del mes ` +
              `actual registrada). Actualiza la tarifa para un estimado preciso.`,
          ),
          CONTENT_W - 24,
        ) as string[])
      : [];
    const boxH2 = 16 + lines.length * 11 + (staleLine.length > 0 ? staleLine.length * 10 + 8 : 0) + 10;

    pdf.setDrawColor(CARD_BORDER);
    pdf.setLineWidth(0.75);
    pdf.roundedRect(MARGIN, boxTop, CONTENT_W, boxH2, 4, 4, 'S');
    pdf.setFillColor(EXPORT);
    pdf.rect(MARGIN, boxTop, 3, boxH2, 'F');

    pdf.setFontSize(9);
    pdf.setTextColor(INK);
    pdf.text(lines, MARGIN + 12, boxTop + 16);
    if (staleLine.length > 0) {
      const sy = boxTop + 16 + lines.length * 11 + 4;
      pdf.setFillColor(AMBER_BG);
      pdf.rect(MARGIN + 12, sy - 8, CONTENT_W - 24, staleLine.length * 10 + 6, 'F');
      pdf.setFontSize(8);
      pdf.setTextColor(IMPORT);
      pdf.text(staleLine, MARGIN + 16, sy);
    }
    y = boxTop + boxH2 + 20;
  }

  // ---------- Recomendaciones ----------
  const recommendations = buildRecommendations(summary);
  if (recommendations.length > 0) {
    y = sectionTitle(pdf, 'Recomendaciones', y);
    pdf.setFontSize(9);
    for (const rec of recommendations) {
      const lines = pdf.splitTextToSize(t(rec), CONTENT_W - 18) as string[];
      pdf.setFillColor(EXPORT);
      pdf.circle(MARGIN + 3, y - 2.5, 1.8, 'F');
      pdf.setTextColor(INK);
      pdf.text(lines, MARGIN + 12, y);
      y += lines.length * 11 + 5;
    }
    y += 8;
  }

  // ---------- Pie ----------
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setDrawColor(CARD_BORDER);
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN, pageH - 40, PAGE_W - MARGIN, pageH - 40);
  pdf.setFontSize(7.5);
  pdf.setTextColor(FAINT);
  pdf.text('EMS Residencial · Informe generado automáticamente desde el panel de monitoreo', MARGIN, pageH - 28);
  pdf.text('Página 1 de 1', PAGE_W - MARGIN, pageH - 28, { align: 'right' });

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  pdf.save(`informe_energia_${today}.pdf`);
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
        `${monthLabel(eff.tariff_month)} como referencia, lo que introduce imprecisión en los montos.`,
    );
  }
  recs.push(
    `Revisar este informe mensualmente: cambios en el perfil horario suelen anticipar consumos anómalos o ` +
      `degradación de la generación antes de que se reflejen en la factura.`,
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

function legendDot(
  pdf: import('jspdf').jsPDF,
  x: number,
  y: number,
  color: string,
  label: string,
): number {
  pdf.setFillColor(color);
  pdf.circle(x + 3, y - 2.5, 3, 'F');
  pdf.setTextColor(MUTED);
  pdf.text(t(label), x + 10, y);
  return x + 10 + pdf.getTextWidth(label);
}
