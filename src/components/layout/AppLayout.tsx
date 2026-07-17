import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { RealtimeProvider } from '../../context/RealtimeContext';
import { AlertsProvider } from '../../context/AlertsContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { PageContainer } from './PageContainer';
import { AlertToast } from './AlertToast';

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <RealtimeProvider>
      <AlertsProvider>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
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
        </div>
      </AlertsProvider>
    </RealtimeProvider>
  );
}
