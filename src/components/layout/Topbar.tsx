import { motion } from 'framer-motion';
import { LogOut, Menu, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useLocalClock } from '../../hooks/useLocalClock';
import { useRealtime } from '../../hooks/useRealtime';
import { AlertsBell } from './AlertsBell';
import { NoticeBell } from './NoticeBell';
import type { WsConnectionStatus } from '../../api/websocket';

interface TopbarProps {
  onOpenMobileSidebar: () => void;
}

const STATUS_LABEL: Record<WsConnectionStatus, string> = {
  connected: 'Online',
  connecting: 'Conectando',
  reconnecting: 'Reconectando',
  disconnected: 'Desconectado',
};

export function Topbar({ onOpenMobileSidebar }: TopbarProps) {
  const { user, logout } = useAuth();
  const { status: wsStatus } = useRealtime();
  const clock = useLocalClock();
  const isLive = wsStatus === 'connected';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-900/5 bg-white/80 px-4 backdrop-blur-xl sm:px-6 dark:border-white/5 dark:bg-slate-950/80">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-900/5 md:hidden dark:text-slate-400 dark:hover:bg-white/5"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 rounded-full border border-slate-900/10 px-3 py-1.5 text-xs font-medium dark:border-white/10">
          <span className="relative flex h-2 w-2">
            {isLive && (
              <motion.span
                className="absolute inline-flex h-full w-full rounded-full bg-emerald-500"
                animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
            <span
              className={[
                'relative inline-flex h-2 w-2 rounded-full',
                isLive ? 'bg-emerald-500' : wsStatus === 'connecting' || wsStatus === 'reconnecting' ? 'bg-amber-500' : 'bg-slate-400',
              ].join(' ')}
            />
          </span>
          {isLive ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-slate-400" />
          )}
          <span className="hidden text-slate-600 sm:inline dark:text-slate-300">
            {STATUS_LABEL[wsStatus]}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="hidden font-mono text-xs text-slate-500 sm:inline dark:text-slate-400">
          {clock}
        </span>
        <NoticeBell />
        <AlertsBell />
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {(user?.username ?? '?').slice(0, 1).toUpperCase()}
          </div>
          <span className="hidden text-sm font-medium text-slate-700 sm:inline dark:text-slate-200">
            {user?.username}
          </span>
        </div>
        <button
          onClick={() => void logout()}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-500 dark:text-slate-400"
          title="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
