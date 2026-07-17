import { useContext } from 'react';
import { DashboardFiltersContext } from '../context/DashboardFiltersContext';

export function useDashboardFilters() {
  const ctx = useContext(DashboardFiltersContext);
  if (!ctx) {
    throw new Error('useDashboardFilters must be used within DashboardFiltersProvider');
  }
  return ctx;
}
