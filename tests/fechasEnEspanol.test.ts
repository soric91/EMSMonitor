/**
 * Las fechas se escriben en español.
 *
 * date-fns cae en inglés si no le pasan locale, y el panel mostraba "1 Aug
 * 2026" en la franja del reporte junto a "ago. 2026" en las tarjetas de costo
 * —que salen de Intl con es-CO—. Dos idiomas en la misma pantalla.
 */

import { describe, expect, test } from '@rstest/core';
import { formatLocalDateTime } from '../src/utils/format';
import { monthLabel } from '../src/utils/labels';

describe('formatLocalDateTime', () => {
  test('el mes se escribe en español', () => {
    expect(formatLocalDateTime('2026-01-15T17:00:00Z', 'd MMM yyyy')).toBe('15 ene 2026');
    expect(formatLocalDateTime('2026-08-15T17:00:00Z', 'd MMM')).toBe('15 ago');
  });

  test('el día de la semana también', () => {
    // 2026-08-20 es jueves en Bogotá.
    expect(formatLocalDateTime('2026-08-20T17:00:00Z', 'EEE d')).toBe('jue 20');
  });

  test('sigue traduciendo a hora de Bogotá, no a UTC', () => {
    // 03:00 UTC del 21 es 22:00 del 20 en Bogotá (UTC-5).
    expect(formatLocalDateTime('2026-08-21T03:00:00Z', 'd MMM HH:mm')).toBe('20 ago 22:00');
  });
});

describe('coherencia con las tarjetas de costo', () => {
  test('los dos formateadores nombran el mismo mes igual de español', () => {
    // monthLabel usa Intl (es-CO) y formatLocalDateTime usa date-fns: el
    // riesgo es justo que uno diga "ago" y el otro "Aug".
    expect(monthLabel('2026-08')).toContain('ago');
    expect(formatLocalDateTime('2026-08-15T17:00:00Z', 'MMM')).toBe('ago');
  });
});
