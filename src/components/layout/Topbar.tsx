import { Menu, Wifi, WifiOff } from 'lucide-react';
import { useLocalClock } from '../../hooks/useLocalClock';
import { useRealtime } from '../../hooks/useRealtime';
import { AlertsBell } from './AlertsBell';
import { SelectorDeMedidor } from './SelectorDeMedidor';
import { NoticeBell } from './NoticeBell';
import { UserMenu } from './UserMenu';
import { OnlineDot } from '../ui/OnlineDot';
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
  const { status: wsStatus } = useRealtime();
  const clock = useLocalClock();
  const isLive = wsStatus === 'connected';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-900/5 bg-white/80 backdrop-blur-xl dark:border-white/5 dark:bg-slate-950/80">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onOpenMobileSidebar}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-900/5 md:hidden dark:text-slate-400 dark:hover:bg-white/5"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex shrink-0 items-center gap-2 rounded-full border border-slate-900/10 px-3 py-1.5 text-xs font-medium dark:border-white/10">
            <OnlineDot
              tone={
                isLive
                  ? 'emerald'
                  : wsStatus === 'connecting' || wsStatus === 'reconnecting'
                    ? 'amber'
                    : 'slate'
              }
              pulse={isLive}
            />
            {isLive ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-slate-400" />
            )}
            <span className="hidden text-slate-600 sm:inline dark:text-slate-300">
              {STATUS_LABEL[wsStatus]}
            </span>
          </div>

          {/* Al lado del indicador: qué se está mirando va junto a si está
              llegando. Separarlos obliga a cruzar la pantalla para saber si el
              "Online" corresponde al medidor que se está viendo. En celular el
              selector baja a su propia fila: en la barra de 360px no entra. */}
          <div className="hidden min-w-0 md:block">
            <SelectorDeMedidor />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <span className="hidden font-mono text-xs text-slate-500 sm:inline dark:text-slate-400">
            {clock}
          </span>
          <NoticeBell />
          <AlertsBell />
          <UserMenu />
        </div>
      </div>

      {/* Segunda fila solo en celular: el selector de gateway/medidor. Con
          overflow-x-auto no se sale de la pantalla si hay muchos gateways. */}
      <div className="flex items-center gap-3 overflow-x-auto px-4 pb-2.5 md:hidden">
        <SelectorDeMedidor />
      </div>
    </header>
  );
}
