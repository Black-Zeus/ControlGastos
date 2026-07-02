import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Tags, TrendingUp, KeyRound,
  LogOut, ShieldCheck, Menu, X, ChevronRight, Settings,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

interface AdminNavItem {
  label: string
  icon: React.ElementType
  path: string
}

const ADMIN_NAV: AdminNavItem[] = [
  { label: 'Dashboard',        icon: LayoutDashboard, path: '/admin' },
  { label: 'Usuarios',         icon: Users,           path: '/admin/usuarios' },
  { label: 'Categorías',       icon: Tags,            path: '/admin/categorias' },
  { label: 'Tipos de ingreso', icon: TrendingUp,      path: '/admin/tipos-ingreso' },
  { label: 'Tokens',           icon: KeyRound,        path: '/admin/tokens' },
  { label: 'Configuración',    icon: Settings,        path: '/admin/configuracion' },
]

interface AdminSidebarContentProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  onCloseMobile?: () => void
}

function AdminSidebarContent({ collapsed, onToggleCollapsed, onCloseMobile }: AdminSidebarContentProps) {
  const { admin: user, logout } = useAdminAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/admin/login')
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className={cn('flex items-center gap-3 px-5 py-5', collapsed && 'justify-center px-3')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-500">
          <ShieldCheck size={16} className="text-white" />
        </div>
        <div
          className={cn(
            'fade-text min-w-0 flex-1 overflow-hidden',
            collapsed ? 'max-w-0 opacity-0' : 'max-w-xs opacity-100',
          )}
        >
          <p className="text-sm font-semibold text-white">Administración</p>
          <p className="truncate text-[11px] text-slate-400">ControlGastos</p>
        </div>

        {/* Cerrar mobile / Colapsar desktop */}
        {onCloseMobile ? (
          <button onClick={onCloseMobile} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700">
            <X size={18} />
          </button>
        ) : (
          <button
            onClick={onToggleCollapsed}
            className={cn(
              'rounded-lg p-1.5 text-slate-400 hover:bg-slate-700',
              collapsed && 'mx-auto',
            )}
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? <ChevronRight size={18} /> : <X size={18} />}
          </button>
        )}
      </div>

      <div className="mx-4 h-px bg-slate-700" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {ADMIN_NAV.map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin'}
              onClick={onCloseMobile}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                  collapsed && 'justify-center px-2',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} className={cn('shrink-0', isActive ? 'text-primary-400' : 'text-slate-400')} />
                  <span
                    className={cn(
                      'fade-text overflow-hidden whitespace-nowrap',
                      collapsed ? 'max-w-0 opacity-0' : 'max-w-xs opacity-100',
                    )}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700 p-3 space-y-0.5">
        <ThemeToggle collapsed={collapsed} />
        <div className="h-px bg-slate-700 my-1" />
        <div className={cn('flex items-center gap-3 rounded-xl px-3 py-2', collapsed && 'justify-center px-2')}>
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-500/30 text-xs font-semibold text-primary-400">
            {user?.name.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div
            className={cn(
              'fade-text min-w-0 flex-1 overflow-hidden',
              collapsed ? 'max-w-0 opacity-0' : 'max-w-xs opacity-100',
            )}
          >
            <p className="truncate text-sm font-medium text-white">{user?.name}</p>
            <p className="truncate text-[11px] text-slate-400">{user?.email}</p>
          </div>
          {!collapsed && (
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="flex w-full items-center justify-center rounded-xl px-2 py-2 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <LogOut size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950">

      {/* ── Desktop sidebar ────────────────────────────────────────── */}
      <aside
        className={cn(
          'sidebar-transition fixed inset-y-0 left-0 z-20 hidden flex-col bg-slate-900 lg:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <AdminSidebarContent
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed(c => !c)}
        />
      </aside>

      {/* ── Mobile overlay ─────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Mobile drawer ──────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 flex-col bg-slate-900 transition-transform duration-250 ease-in-out lg:hidden flex',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <AdminSidebarContent
          collapsed={false}
          onToggleCollapsed={() => {}}
          onCloseMobile={() => setMobileOpen(false)}
        />
      </aside>

      {/* ── Contenido principal ────────────────────────────────────── */}
      <div
        className={cn(
          'flex min-h-screen flex-col transition-[margin-left] duration-250',
          collapsed ? 'lg:ml-16' : 'lg:ml-60',
        )}
      >
        {/* Topbar mobile */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-4 lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-primary-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">Administración</span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
