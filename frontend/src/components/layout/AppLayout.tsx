import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { useSidebar } from '@/hooks/useSidebar'
import { ScrollToTopButton } from '@/components/ScrollToTopButton'
import logoUrl from '@/assets/logo.png'

export function AppLayout() {
  const { collapsed, toggleCollapsed, mobileOpen, openMobile, closeMobile } = useSidebar()
  const { pathname } = useLocation()

  useEffect(() => { closeMobile() }, [pathname, closeMobile])

  return (
    <div className="min-h-screen bg-surface dark:bg-slate-950">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
      />

      <div
        className={cn(
          'flex min-h-screen flex-col transition-[margin-left] duration-250',
          collapsed ? 'lg:ml-16' : 'lg:ml-60',
        )}
      >
        {/* Topbar mobile: reserva su propio espacio, así el ☰ nunca tapa el título de la vista */}
        <header className="sticky top-0 z-[25] flex h-14 items-center gap-3 border-b border-gray-100 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 lg:hidden">
          <button
            onClick={openMobile}
            aria-label="Abrir menú"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Menu size={20} />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <img src={logoUrl} alt="" className="h-6 w-6 shrink-0 rounded-lg object-cover" />
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">ControlGastos</span>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      <ScrollToTopButton />
    </div>
  )
}
