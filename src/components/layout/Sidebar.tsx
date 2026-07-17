import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftRight,
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  Coins,
  FileText,
  History,
  LayoutDashboard,
  Moon,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/history', label: 'Histórico', icon: History },
  { to: '/consumption-export', label: 'Consumo / Exportación', icon: ArrowLeftRight },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/reports', label: 'Reportes', icon: FileText },
  { to: '/tariff', label: 'Tarifa', icon: Coins },
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function SidebarContent({ collapsed }: { collapsed: boolean }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center gap-3 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30">
          <Zap className="h-5 w-5 text-slate-950" strokeWidth={2.5} />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden whitespace-nowrap text-sm font-semibold tracking-tight text-slate-900 dark:text-white"
            >
              EMS Residencial
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-emerald-500"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-900/5 p-3 dark:border-white/5">
        <button
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white"
        >
          {theme === 'dark' ? (
            <Sun className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <Moon className="h-[18px] w-[18px] shrink-0" />
          )}
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden whitespace-nowrap"
              >
                {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile }: SidebarProps) {
  return (
    <>
      <motion.aside
        animate={{ width: collapsed ? 76 : 240 }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="fixed inset-y-0 left-0 z-30 hidden border-r border-slate-900/5 bg-white/80 backdrop-blur-xl md:flex dark:border-white/5 dark:bg-slate-950/80"
      >
        <SidebarContent collapsed={collapsed} />
        <button
          onClick={onToggleCollapse}
          className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border border-slate-900/10 bg-white text-slate-500 shadow-sm transition hover:text-emerald-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-emerald-400"
        >
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
        </button>
      </motion.aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-2xl md:hidden dark:bg-slate-950"
            >
              <button
                onClick={onCloseMobile}
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarContent collapsed={false} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
