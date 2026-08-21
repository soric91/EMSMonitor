import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
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
import { ErrorBoundary } from './ErrorBoundary';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

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
            {/* El foco frío detrás del contenido: lo único ambiental del panel.
                Va en el fondo y no en una tarjeta para que las superficies se
                recorten contra él en vez de flotar sobre un plano muerto. */}
            <div className="relative min-h-screen overflow-x-clip bg-slate-50 dark:bg-slate-950">
              <div
                aria-hidden
                className="pointer-events-none fixed inset-x-0 top-0 h-[60vh] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(76,141,255,0.10),transparent_70%)] dark:bg-[radial-gradient(60%_60%_at_50%_0%,rgba(76,141,255,0.16),transparent_70%)]"
              />
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
                    {/* El error de una página se queda en la página: la barra
                        lateral, el selector de medidor y las alertas siguen
                        vivos, y se puede navegar a otro lado sin recargar.
                        Cambiar de ruta limpia el error. */}
                    <ErrorBoundary resetKey={pathname}>
                      <Outlet />
                    </ErrorBoundary>
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
