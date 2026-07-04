import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, TrendingDown, TrendingUp,
  Tags, CalendarRange, X, ChevronRight,
  LogOut, UserCircle,
  ArrowLeftRight, Activity, PieChart, HelpCircle, ShoppingCart,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { AboutModal } from '@/components/AboutModal'
import { useAvatarUrl } from '@/hooks/useAvatarUrl'
import logoUrl from '@/assets/logo.png'

// ─── Definición de navegación ─────────────────────────────────────────────────

interface NavItem {
  label: string
  icon: React.ElementType
  path: string
  badge?: number
}

interface NavGroup {
  label?: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
      { label: 'Ingresos',  icon: TrendingUp,      path: '/ingresos' },
      { label: 'Egresos',   icon: TrendingDown,    path: '/egresos' },
      { label: 'Listas de compra', icon: ShoppingCart, path: '/listas-compra' },
    ],
  },
  {
    label: 'Reportes',
    items: [
      { label: 'Comparación',    icon: ArrowLeftRight, path: '/reportes/comparacion' },
      { label: 'Tendencia',      icon: Activity,       path: '/reportes/tendencia' },
      { label: 'Por categoría',  icon: PieChart,       path: '/reportes/categorias' },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { label: 'Períodos',  icon: CalendarRange, path: '/periodos' },
      { label: 'Catálogos', icon: Tags,          path: '/catalogos' },
    ],
  },
  {
    label: 'Ayuda',
    items: [
      { label: 'Centro de ayuda', icon: HelpCircle, path: '/ayuda' },
    ],
  },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
}

// ─── Sub-componente: ítem de navegación ───────────────────────────────────────

function NavItemRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
          'transition-colors duration-150',
          isActive
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
          collapsed && 'justify-center px-2',
        )
      }
      title={collapsed ? item.label : undefined}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={18}
            className={cn(
              'shrink-0 transition-colors',
              isActive
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-400 group-hover:text-gray-600 dark:text-slate-500 dark:group-hover:text-slate-300',
            )}
          />
          <span
            className={cn(
              'fade-text overflow-hidden whitespace-nowrap',
              collapsed ? 'max-w-0 opacity-0' : 'max-w-xs opacity-100',
            )}
          >
            {item.label}
          </span>
          {item.badge != null && item.badge > 0 && !collapsed && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-warm px-1.5 text-[10px] font-semibold text-white">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const avatarUrl = useAvatarUrl()
  const [aboutOpen, setAboutOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const sidebarContent = (
    <div className="flex h-full flex-col">

      {/* Logo / Nombre */}
      <div className={cn('flex items-center gap-3 px-4 py-5', collapsed && 'justify-center px-2')}>
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          title="Acerca de ControlGastos"
          className={cn(
            '-m-1 flex min-w-0 items-center gap-3 rounded-xl p-1 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800',
            collapsed && 'justify-center',
          )}
        >
          <img src={logoUrl} alt="ControlGastos" className="h-8 w-8 shrink-0 rounded-xl object-cover" />
          <span
            className={cn(
              'fade-text overflow-hidden whitespace-nowrap text-left font-semibold text-gray-900 dark:text-slate-100',
              collapsed ? 'max-w-0 opacity-0' : 'max-w-xs opacity-100',
            )}
          >
            ControlGastos
          </span>
        </button>

        {/* Botón colapsar (desktop) / cerrar (mobile) */}
        <button
          onClick={onCloseMobile}
          className="ml-auto rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
        >
          <X size={18} />
        </button>
      </div>

      {/* Separador */}
      <div className="mx-4 h-px bg-gray-100 dark:bg-slate-800" />

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
            {group.label && !collapsed && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-600">
                {group.label}
              </p>
            )}
            {gi > 0 && collapsed && <div className="my-2 mx-1 h-px bg-gray-100 dark:bg-slate-800" />}
            <ul className="space-y-0.5">
              {group.items.map(item => (
                <li key={item.path}>
                  <NavItemRow item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-100 dark:border-slate-800 p-3 space-y-0.5">

        {/* Toggle de tema */}
        <ThemeToggle collapsed={collapsed} />

        <div className="h-px bg-gray-100 dark:bg-slate-800 my-1" />

        {/* Perfil de usuario */}
        <NavLink
          to="/perfil"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2 transition-colors',
              isActive
                ? 'bg-primary-50 dark:bg-primary-900/30'
                : 'hover:bg-gray-100 dark:hover:bg-slate-800',
              collapsed && 'justify-center px-2',
            )
          }
          title={collapsed ? 'Mi perfil' : undefined}
        >
          <div className="flex h-7 w-7 shrink-0 overflow-hidden rounded-full bg-primary-100 dark:bg-primary-900/50">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-primary-700 dark:text-primary-400">
                {user?.name.charAt(0).toUpperCase() ?? '?'}
              </span>
            )}
          </div>
          <div
            className={cn(
              'fade-text min-w-0 overflow-hidden',
              collapsed ? 'max-w-0 opacity-0' : 'max-w-xs opacity-100',
            )}
          >
            <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">{user?.name}</p>
            <p className="truncate text-xs text-gray-400 dark:text-slate-500">{user?.email}</p>
          </div>
          {!collapsed && (
            <UserCircle size={15} className="ml-auto shrink-0 text-gray-300 dark:text-slate-600" />
          )}
        </NavLink>

        {/* Cerrar sesión */}
        <button
          onClick={handleLogout}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
            'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
            'dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
            collapsed && 'justify-center px-2',
          )}
          title={collapsed ? 'Cerrar sesión' : undefined}
        >
          <LogOut size={15} className="shrink-0" />
          <span
            className={cn(
              'fade-text overflow-hidden whitespace-nowrap',
              collapsed ? 'max-w-0 opacity-0' : 'max-w-xs opacity-100',
            )}
          >
            Cerrar sesión
          </span>
        </button>

      </div>
    </div>
  )

  return (
    <>
      {/* ── Desktop sidebar ────────────────────────────────────────────────── */}
      <aside
        className={cn(
          'sidebar-transition hidden h-screen flex-col border-r border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex',
          'fixed inset-y-0 left-0 z-20',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {sidebarContent}

        {/* Botón colapsar/expandir — mitad dentro, mitad fuera del sidebar */}
        <button
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className={cn(
            'absolute -right-[18px] top-6 z-30 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-colors',
            'border-gray-200 bg-white text-gray-500 hover:bg-gray-50',
            'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700',
          )}
        >
          <ChevronRight size={14} className={cn('transition-transform', !collapsed && 'rotate-180')} />
        </button>
      </aside>

      {/* ── Mobile: overlay ────────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      {/* ── Mobile: drawer ─────────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900',
          'transition-transform duration-250 ease-in-out lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'flex',
        )}
      >
        {sidebarContent}
      </aside>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  )
}
