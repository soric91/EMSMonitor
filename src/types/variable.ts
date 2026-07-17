import type { Variable } from '../api/types';

export type VariableColorMode = 'power' | 'import' | 'export' | 'neutral';

interface VariableMeta {
  label: string;
  unit: string;
  colorMode: VariableColorMode;
}

export const VARIABLE_META: Record<Variable, VariableMeta> = {
  CURRENT_A: { label: 'Corriente A', unit: 'A', colorMode: 'neutral' },
  CURRENT_B: { label: 'Corriente B', unit: 'A', colorMode: 'neutral' },
  VOLTAGE_A: { label: 'Voltaje A', unit: 'V', colorMode: 'neutral' },
  VOLTAGE_B: { label: 'Voltaje B', unit: 'V', colorMode: 'neutral' },
  POWER_ACTIVE_INST_A: { label: 'Potencia activa A', unit: 'W', colorMode: 'power' },
  POWER_ACTIVE_INST_B: { label: 'Potencia activa B', unit: 'W', colorMode: 'power' },
  POWER_ACTIVE_INST_TOTAL: { label: 'Balance neto (acometida)', unit: 'W', colorMode: 'power' },
  POWER_REACTIVE_INST_TOTAL: { label: 'Potencia reactiva', unit: 'VAR', colorMode: 'neutral' },
  FACTOR_POTENCIA_TOTAL: { label: 'Factor de potencia', unit: '', colorMode: 'neutral' },
  POWER_ACTIVE_TOTAL_POS: { label: 'Energía importada (acumulada)', unit: 'kWh', colorMode: 'import' },
  POWER_ACTIVE_TOTAL_NEG: { label: 'Energía exportada (acumulada)', unit: 'kWh', colorMode: 'export' },
};

export const VARIABLE_LIST = Object.keys(VARIABLE_META) as Variable[];
