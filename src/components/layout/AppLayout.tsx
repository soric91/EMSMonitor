import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { RealtimeProvider } from '../../context/RealtimeContext';
import { AlertsProvider } from '../../context/AlertsContext';
import { DeviceProvider } from '../../context/DeviceContext';
import { VariablesProvider } from '../../context/VariablesContext';
import { ImpersonationBanner } from './ImpersonationBanner';
import { SinConfiguracion } from './SinConfiguracion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { PageContainer } from './PageContainer';
import { AlertToast } from './AlertToast';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    // El orden es una cadena de dependencias, no una preferencia:
    //
    //   Variables  — el WebSocket solo se abre si hay algo que suscribir, y
    //                para saberlo hay que tener la lista antes.
    //   Device     — la suscripción viaja acotada al medidor elegido, así que
    //                Realtime necesita saber cuál es.
    //   Realtime   — abre el socket.
    //   Alerts     — las alertas llegan por ese socket.
    <VariablesProvider>
      <DeviceProvider>
        <RealtimeProvider>
          <AlertsProvider>
            <div className="min-h-screen overflow-x-clip bg-slate-50 dark:bg-slate-950">
              {/* Arriba de todo, antes que cualquier dato: si aparece debajo de
                una gráfica, ya se leyó la gráfica sin saber de quién era. */}
              <ImpersonationBanner />
              <Sidebar
                collapsed={collapsed}
                onToggleCollapse={() => setCollapsed((v) => !v)}
                mobileOpen={mobileOpen}
                onCloseMobile={() => setMobileOpen(false)}
              />
              <div
                className={[
                  'transition-[margin] duration-300 ease-out',
                  collapsed ? 'md:ml-[76px]' : 'md:ml-[240px]',
                ].join(' ')}
              >
                <Topbar onOpenMobileSidebar={() => setMobileOpen(true)} />
                <main>
                  <PageContainer>
                    <Outlet />
                  </PageContainer>
                </main>
              </div>
              <AlertToast />
              {/* Dentro de VariablesProvider: necesita saber si hay mediciones. */}
              <SinConfiguracion />
            </div>
          </AlertsProvider>
        </RealtimeProvider>
      </DeviceProvider>
    </VariablesProvider>
  );
}
