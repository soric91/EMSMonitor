/**
 * La etiqueta de un mes ("2026-08" → "ago. 2026"), sin corrimientos de zona.
 */

import { describe, expect, test } from '@rstest/core';
import { monthLabel, NOT_APPLICABLE } from '../src/utils/labels';

describe('monthLabel', () => {
  test('mes conocidos, formato corto', () => {
    expect(monthLabel('2026-01')).toBe('ene de 2026');
    expect(monthLabel('2026-12')).toBe('dic de 2026');
  });

  test('formato corto es el default', () => {
    expect(monthLabel('2026-08')).toBe('ago de 2026');
  });

  test('formato largo para el resumen', () => {
    expect(monthLabel('2026-07', 'long')).toBe('julio de 2026');
  });

  test('sin corrimiento a la medianoche: usa mediodía UTC', () => {
    // En Bogotá (UTC-5) el "2026-11-01T00:00:00Z" cae el 31 de octubre; el
    // mediodía UTC evita saltar al mes anterior.
    expect(monthLabel('2026-11')).toBe('nov de 2026');
  });
});

describe('NOT_APPLICABLE', () => {
  test('es el texto de "no aplica" compartido', () => {
    expect(NOT_APPLICABLE).toBe('No aplica — exportando');
  });
});
