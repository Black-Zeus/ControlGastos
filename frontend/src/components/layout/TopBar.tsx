import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLocation } from 'react-router-dom'

const PAGE_TITLES: Record<string, string> = {
  '/':          'Dashboard',
  '/egresos':   'Egresos',
  '/ingresos':  'Ingresos',
  '/borradores':'Borradores',
  '/catalogos': 'Catálogos',
  '/perfil':    'Mi perfil',
}

interface TopBarProps {
  onOpenMobile: () => void
  sidebarCollapsed: boolean
}

export function TopBar({ onOpenMobile, sidebarCollapsed }: TopBarProps) {
  const { pathname } = useLocation()
  const title = PAGE_TITLES[pathname] ?? 'ControlGastos'

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-10 flex h-14 items-center gap-4',
        'border-b border-gray-100 bg-white/80 backdrop-blur-md px-4',
        'dark:border-slate-800 dark:bg-slate-900/80',
        'transition-[left] duration-250',
        sidebarCollapsed ? 'lg:left-16' : 'lg:left-60',
        'left-0',
      )}
    >
      {/* Hamburger (mobile only) */}
      <button
        onClick={onOpenMobile}
        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      {/* Título de página */}
      <h1 className="text-base font-semibold text-gray-900 dark:text-slate-100">{title}</h1>
    </header>
  )
}
