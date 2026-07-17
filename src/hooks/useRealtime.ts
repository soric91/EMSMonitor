import { useContext } from 'react';
import { RealtimeContext } from '../context/RealtimeContext';

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime must be used within RealtimeProvider');
  }
  return ctx;
}
