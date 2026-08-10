import { useContext } from 'react';
import { VariablesContext } from '../context/VariablesContext';

export function useVariables() {
  const ctx = useContext(VariablesContext);
  if (!ctx) {
    throw new Error('useVariables must be used within VariablesProvider');
  }
  return ctx;
}
