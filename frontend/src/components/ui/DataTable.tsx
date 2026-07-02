import { useState, useEffect, type ElementType } from 'react'
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  className?: string
  headerClassName?: string
  /** Si no se provee, muestra row[key] como string */
  render?: (row: T, index: number) => React.ReactNode
}

export interface RowAction<T> {
  icon: ElementType | ((row: T) => ElementType)
  label: string | ((row: T) => string)
  onClick: (row: T) => void
  disabled?: (row: T) => boolean
  hidden?: (row: T) => boolean
  variant?: 'default' | 'danger' | ((row: T) => 'default' | 'danger')
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string | number
  actions?: RowAction<T>[]
  defaultPageSize?: number
  pageSizeOptions?: number[]
  loading?: boolean
  emptyMessage?: string
  className?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4)       return [1, 2, 3, 4, 5, '…', total]
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '…', current - 1, current, current + 1, '…', total]
}

function getValue<T>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key]
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function DataTable<T>({
  data,
  columns,
  rowKey,
  actions,
  defaultPageSize = 10,
  pageSizeOptions = [10, 25, 50],
  loading = false,
  emptyMessage = 'Sin resultados',
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey]   = useState<string | null>(null)
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc')
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)

  // Resetear página cuando cambian los datos
  useEffect(() => { setPage(1) }, [data, pageSize])

  // ── Ordenar ──────────────────────────────────────────────────────────────
  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const av = getValue(a, sortKey)
        const bv = getValue(b, sortKey)
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    : data

  // ── Paginar ──────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const start      = (safePage - 1) * pageSize
  const rows       = sorted.slice(start, start + pageSize)

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPage(1)
  }

  const hasActions = actions && actions.length > 0

  return (
    <div className={cn('flex flex-col gap-3', className)}>

      {/* Tabla */}
      <div className="relative rounded-2xl bg-white dark:bg-slate-900 shadow-soft overflow-hidden">

        {/* Overlay de carga */}
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 dark:bg-slate-900/70 rounded-2xl">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-800">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500',
                      col.sortable && 'cursor-pointer select-none hover:text-gray-700 dark:hover:text-slate-300 transition-colors',
                      col.headerClassName,
                    )}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="flex items-center gap-1.5">
                      {col.label}
                      {col.sortable && (
                        sortKey === col.key ? (
                          sortDir === 'asc'
                            ? <ChevronUp size={13} className="text-primary-500" />
                            : <ChevronDown size={13} className="text-primary-500" />
                        ) : (
                          <ChevronsUpDown size={13} className="opacity-30" />
                        )
                      )}
                    </span>
                  </th>
                ))}
                {hasActions && (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-800/70">
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + (hasActions ? 1 : 0)}
                    className="py-12 text-center text-sm text-gray-400 dark:text-slate-500"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr
                  key={rowKey(row)}
                  className="hover:bg-gray-50 dark:hover:bg-slate-800/40 transition-colors"
                >
                  {columns.map(col => (
                    <td key={col.key} className={cn('px-4 py-3', col.className)}>
                      {col.render
                        ? col.render(row, start + i)
                        : <span className="text-gray-800 dark:text-slate-200">{String(getValue(row, col.key) ?? '')}</span>
                      }
                    </td>
                  ))}
                  {hasActions && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {actions!.map((action, ai) => {
                          if (action.hidden?.(row)) return null
                          const Icon: ElementType = typeof action.icon === 'function'
                            ? (action.icon as (row: T) => ElementType)(row)
                            : action.icon
                          const label   = typeof action.label   === 'function' ? action.label(row)   : action.label
                          const variant = typeof action.variant === 'function' ? action.variant(row) : (action.variant ?? 'default')
                          const disabled = action.disabled?.(row) ?? false
                          return (
                            <button
                              key={ai}
                              onClick={() => !disabled && action.onClick(row)}
                              disabled={disabled}
                              title={label}
                              className={cn(
                                'rounded-lg border p-1.5 transition-colors',
                                disabled
                                  ? 'cursor-not-allowed border-gray-200 dark:border-slate-700 text-gray-300 dark:text-slate-600'
                                  : variant === 'danger'
                                    ? 'border-red-200 dark:border-red-900/40 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20'
                                    : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200',
                              )}
                            >
                              <Icon size={14} />
                            </button>
                          )
                        })}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer: info + paginación */}
      {sorted.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">

          {/* Info + page size */}
          <div className="flex items-center gap-3 text-sm text-gray-400 dark:text-slate-500">
            <span>
              {start + 1}–{Math.min(start + pageSize, sorted.length)} de {sorted.length}
            </span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
              className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-gray-600 dark:text-slate-300 outline-none focus:border-primary-400"
            >
              {pageSizeOptions.map(n => (
                <option key={n} value={n}>{n} por página</option>
              ))}
            </select>
          </div>

          {/* Páginas */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>

              {getPageNumbers(safePage, totalPages).map((n, i) =>
                n === '…' ? (
                  <span key={`e${i}`} className="flex h-8 w-8 items-center justify-center text-xs text-gray-400 dark:text-slate-500">…</span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium transition-colors',
                      n === safePage
                        ? 'bg-primary-500 text-white'
                        : 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800',
                    )}
                  >
                    {n}
                  </button>
                )
              )}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
