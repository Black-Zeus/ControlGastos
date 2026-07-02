import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { useSidebar } from '@/hooks/useSidebar'

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

      {/* Botón hamburger flotante — solo mobile, cuando el drawer está cerrado */}
      {!mobileOpen && (
        <button
          onClick={openMobile}
          aria-label="Abrir menú"
          className="fixed top-3 left-3 z-[25] flex items-center justify-center rounded-xl border border-gray-100 bg-white p-2 shadow-md dark:border-slate-800 dark:bg-slate-900 lg:hidden"
        >
          <Menu size={18} className="text-gray-600 dark:text-slate-300" />
        </button>
      )}

      <div
        className={cn(
          'flex min-h-screen flex-col transition-[margin-left] duration-250',
          collapsed ? 'lg:ml-16' : 'lg:ml-60',
        )}
      >
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
