import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/contexts/ThemeContext'

interface ThemeToggleProps {
  collapsed?: boolean
}

export function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const { toggle, isDark } = useTheme()

  return (
    <button
      onClick={toggle}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors w-full',
        'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
        'dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
        collapsed && 'justify-center px-2',
      )}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {isDark
        ? <Sun size={15} className="shrink-0" />
        : <Moon size={15} className="shrink-0" />
      }

      {!collapsed && (
        <>
          <span className="fade-text overflow-hidden whitespace-nowrap opacity-100 max-w-xs">
            {isDark ? 'Modo claro' : 'Modo oscuro'}
          </span>

          {/* Switch pill */}
          <span
            aria-hidden
            className={cn(
              'relative ml-auto inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200',
              isDark ? 'bg-primary-500' : 'bg-gray-200 dark:bg-slate-600',
            )}
          >
            <span
              className={cn(
                'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200',
                isDark ? 'translate-x-[18px]' : 'translate-x-[3px]',
              )}
            />
          </span>
        </>
      )}
    </button>
  )
}
