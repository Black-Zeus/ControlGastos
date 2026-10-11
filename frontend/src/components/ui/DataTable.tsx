import { useState, useEffect, useRef, Fragment, type ElementType } from 'react'
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, MoreHorizontal,
} from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  /** Valor para ordenar cuando `row[key]` no existe o no sirve (columnas calculadas, montos). */
  sortValue?: (row: T) => string | number | null | undefined
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
  /**
   * Si alguna acción de la tabla lo marca, solo las `primary` se muestran como
   * botón y el resto pasa a un menú "⋯" por fila. Sin ninguna marcada, todas se
   * muestran como botón (comportamiento original).
   */
  primary?: boolean
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
  /** Si se provee, agrega una columna de expansión a la izquierda. Solo se muestra el chevron en filas donde esto retorna true. */
  isExpandable?: (row: T) => boolean
  /** Contenido de la fila expandida (sub-tabla indentada, detalle, etc.), ocupa el ancho completo. */
  renderExpanded?: (row: T) => React.ReactNode
  /** Orden inicial (el usuario puede cambiarlo haciendo clic en las cabeceras). */
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  /**
   * Selección múltiple: si se provee, agrega una columna de casillas. Solo las filas para
   * las que retorna true son seleccionables; "seleccionar todo" abarca todas las filas de
   * `data` (todas las páginas), no solo la visible. Controlado con selectedKeys/onSelectionChange.
   */
  selectable?: (row: T) => boolean
  selectedKeys?: Set<string | number>
  onSelectionChange?: (keys: Set<string | number>) => void
  /**
   * Si se provee, la página vuelve a 1 solo cuando cambia esta clave (p. ej. los filtros) y no
   * con cada nuevo `data`: útil en tablas que se editan en línea y se refrescan tras cada cambio.
   */
  pageResetKey?: string
  /**
   * Vista de tarjetas para teléfono (< sm): si se provee, en mobile se muestra una tarjeta por
   * fila (sin scroll horizontal ni paginación) con el contenido que devuelve esta función; la
   * tabla queda solo desde `sm`. El marco de la tarjeta agrega selección, acciones y detalle.
   */
  renderCard?: (row: T) => React.ReactNode
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

const NUMERIC_RE = /^-?\d+(\.\d+)?$/

/** Compara numéricamente si ambos valores son números (o strings numéricos como los Decimal
 *  de la API, p. ej. "1500.00"); si no, texto con orden natural. Vacíos siempre al final. */
function compareValues(av: unknown, bv: unknown, dir: 'asc' | 'desc'): number {
  const aEmpty = av === null || av === undefined || av === ''
  const bEmpty = bv === null || bv === undefined || bv === ''
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1
  const an = typeof av === 'number' ? av : NUMERIC_RE.test(String(av)) ? Number(av) : NaN
  const bn = typeof bv === 'number' ? bv : NUMERIC_RE.test(String(bv)) ? Number(bv) : NaN
  const cmp = !Number.isNaN(an) && !Number.isNaN(bn)
    ? an - bn
    : String(av).localeCompare(String(bv), undefined, { numeric: true })
  return dir === 'asc' ? cmp : -cmp
}

function resolveAction<T>(action: RowAction<T>, row: T) {
  const Icon: ElementType = typeof action.icon === 'function'
    ? (action.icon as (row: T) => ElementType)(row)
    : action.icon
  const label   = typeof action.label   === 'function' ? action.label(row)   : action.label
  const variant = typeof action.variant === 'function' ? action.variant(row) : (action.variant ?? 'default')
  const disabled = action.disabled?.(row) ?? false
  return { Icon, label, variant, disabled }
}

// ─── Casilla de selección (con estado indeterminado) ───────────────────────────

function SelectCheckbox({ checked, indeterminate = false, disabled = false, onChange, label }: {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  onChange: () => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-primary-500 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-600"
    />
  )
}

// ─── Menú "⋯" de acciones secundarias ─────────────────────────────────────────

function RowActionsMenu<T>({ row, actions, large = false }: { row: T; actions: RowAction<T>[]; large?: boolean }) {
  if (actions.length === 0) return null
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          title="Más acciones"
          aria-label="Más acciones"
          className={cn(large ? 'flex h-9 w-9 items-center justify-center' : 'p-1.5', 'rounded-lg border border-gray-200 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 data-[state=open]:bg-gray-100 data-[state=open]:text-gray-700 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 dark:data-[state=open]:bg-slate-800')}
        >
          <MoreHorizontal size={large ? 16 : 14} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="z-40 min-w-[200px] rounded-xl border border-gray-100 bg-white p-1 shadow-card dark:border-slate-700 dark:bg-slate-900"
        >
          {actions.map((action, ai) => {
            const { Icon, label, variant, disabled } = resolveAction(action, row)
            return (
              <DropdownMenu.Item
                key={ai}
                disabled={disabled}
                onSelect={() => action.onClick(row)}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none transition-colors',
                  'data-[disabled]:cursor-not-allowed data-[disabled]:text-gray-300 dark:data-[disabled]:text-slate-600',
                  variant === 'danger'
                    ? 'text-red-500 data-[highlighted]:bg-red-50 dark:data-[highlighted]:bg-red-900/20'
                    : 'text-gray-700 data-[highlighted]:bg-gray-100 dark:text-slate-300 dark:data-[highlighted]:bg-slate-800',
                )}
              >
                <Icon size={14} className="shrink-0" />
                {label}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
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
  isExpandable,
  renderExpanded,
  defaultSort,
  selectable,
  selectedKeys,
  onSelectionChange,
  pageResetKey,
  renderCard,
}: DataTableProps<T>) {
  const [sortKey, setSortKey]   = useState<string | null>(defaultSort?.key ?? null)
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>(defaultSort?.dir ?? 'asc')
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [expanded, setExpanded] = useState<Set<string | number>>(new Set())

  function toggleExpanded(key: string | number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Resetear página cuando cambian los datos (o la clave explícita, si se provee)
  const resetTrigger = pageResetKey ?? data
  useEffect(() => { setPage(1) }, [resetTrigger, pageSize])

  // Tarjetas (mobile): lista continua que crece de a MOBILE_STEP con "Mostrar más".
  const MOBILE_STEP = 30
  const [mobileLimit, setMobileLimit] = useState(MOBILE_STEP)
  useEffect(() => { setMobileLimit(MOBILE_STEP) }, [resetTrigger])

  // ── Ordenar ──────────────────────────────────────────────────────────────
  const sortCol = sortKey ? columns.find(c => c.key === sortKey) : undefined
  const sortValueOf = (row: T) => sortCol?.sortValue ? sortCol.sortValue(row) : getValue(row, sortKey as string)
  const sorted = sortKey
    ? [...data].sort((a, b) => compareValues(sortValueOf(a), sortValueOf(b), sortDir))
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

  // ── Selección ────────────────────────────────────────────────────────────
  const hasSelection = !!selectable && !!onSelectionChange
  const selected = selectedKeys ?? new Set<string | number>()
  const selectableKeys = hasSelection ? data.filter(r => selectable!(r)).map(rowKey) : []
  const selectedCount = selectableKeys.filter(k => selected.has(k)).length
  const allSelected = selectableKeys.length > 0 && selectedCount === selectableKeys.length

  function toggleRow(key: string | number) {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onSelectionChange!(next)
  }

  function toggleAll() {
    onSelectionChange!(allSelected ? new Set() : new Set(selectableKeys))
  }

  const extraCols = (hasActions ? 1 : 0) + (renderExpanded ? 1 : 0) + (hasSelection ? 1 : 0)
  const useOverflowMenu = !!actions?.some(a => a.primary)

  function renderActionButtons(row: T, large = false) {
    return (
      <>
        {(useOverflowMenu ? actions!.filter(a => a.primary) : actions!).map((action, ai) => {
          if (action.hidden?.(row)) return null
          const { Icon, label, variant, disabled } = resolveAction(action, row)
          return (
            <button
              key={ai}
              onClick={() => !disabled && action.onClick(row)}
              disabled={disabled}
              title={label}
              aria-label={label}
              className={cn(
                'rounded-lg border transition-colors',
                large ? 'flex h-9 w-9 items-center justify-center' : 'p-1.5',
                disabled
                  ? 'cursor-not-allowed border-gray-200 dark:border-slate-700 text-gray-300 dark:text-slate-600'
                  : variant === 'danger'
                    ? 'border-red-200 dark:border-red-900/40 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20'
                    : 'border-gray-200 dark:border-slate-700 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200',
              )}
            >
              <Icon size={large ? 16 : 14} />
            </button>
          )
        })}
        {useOverflowMenu && (
          <RowActionsMenu row={row} actions={actions!.filter(a => !a.primary && !a.hidden?.(row))} large={large} />
        )}
      </>
    )
  }

  const sortableCols = columns.filter(c => c.sortable)
  const mobileRows = sorted.slice(0, mobileLimit)

  return (
    <div className={cn('flex flex-col gap-3', className)}>

      {/* Tarjetas (solo mobile) */}
      {renderCard && (
        <div className="flex flex-col gap-2.5 sm:hidden">
          {(sortableCols.length > 0 || hasSelection) && (
            <div className="flex items-center gap-2">
              {hasSelection && (
                <label className="flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <SelectCheckbox
                    checked={allSelected}
                    indeterminate={selectedCount > 0 && !allSelected}
                    disabled={selectableKeys.length === 0}
                    onChange={toggleAll}
                    label="Seleccionar todos"
                  />
                  {selectedCount > 0 ? `${selectedCount} sel.` : 'Todos'}
                </label>
              )}
              {sortableCols.length > 0 && (
                <>
                  <select
                    value={sortKey ?? ''}
                    onChange={e => { setSortKey(e.target.value || null); setSortDir('asc') }}
                    aria-label="Ordenar por"
                    className="min-w-0 flex-1 rounded-xl border-2 border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary-400 dark:border-white dark:bg-slate-900 dark:text-slate-200"
                  >
                    <option value="">Orden original</option>
                    {sortableCols.map(c => <option key={c.key} value={c.key}>Ordenar: {c.label}</option>)}
                  </select>
                  <button
                    onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                    disabled={!sortKey}
                    aria-label={sortDir === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-gray-300 bg-white text-gray-500 disabled:opacity-40 dark:border-white dark:bg-slate-900 dark:text-slate-300"
                  >
                    {sortDir === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </>
              )}
            </div>
          )}

          {loading && mobileRows.length === 0 && (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          )}
          {!loading && sorted.length === 0 && (
            <p className="rounded-2xl bg-white py-10 text-center text-sm text-gray-400 shadow-soft dark:bg-slate-900 dark:text-slate-500">{emptyMessage}</p>
          )}

          {mobileRows.map(row => {
            const key = rowKey(row)
            const canExpand = renderExpanded && (!isExpandable || isExpandable(row))
            const isOpen = canExpand && expanded.has(key)
            const isSelected = hasSelection && selected.has(key)
            return (
              <div
                key={key}
                className={cn(
                  'rounded-2xl bg-white p-3 shadow-soft dark:bg-slate-900',
                  isSelected && 'ring-2 ring-primary-400/60',
                )}
              >
                <div className="flex items-start gap-3">
                  {hasSelection && selectable!(row) && (
                    <div className="pt-0.5">
                      <SelectCheckbox checked={selected.has(key)} onChange={() => toggleRow(key)} label="Seleccionar" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">{renderCard(row)}</div>
                </div>
                {(hasActions || canExpand) && (
                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5 dark:border-slate-800">
                    {canExpand ? (
                      <button
                        onClick={() => toggleExpanded(key)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
                      >
                        <ChevronRight size={14} className={cn('transition-transform', isOpen && 'rotate-90')} />
                        {isOpen ? 'Ocultar detalle' : 'Ver detalle'}
                      </button>
                    ) : <span />}
                    {hasActions && <div className="flex items-center gap-1.5">{renderActionButtons(row, true)}</div>}
                  </div>
                )}
                {isOpen && <div className="mt-2.5 overflow-x-auto">{renderExpanded!(row)}</div>}
              </div>
            )
          })}

          {sorted.length > mobileRows.length && (
            <button
              onClick={() => setMobileLimit(n => n + MOBILE_STEP)}
              className="rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              Mostrar más ({sorted.length - mobileRows.length} restantes)
            </button>
          )}
          {sorted.length > 0 && (
            <p className="text-center text-xs text-gray-400 dark:text-slate-500">{mobileRows.length} de {sorted.length}</p>
          )}
        </div>
      )}

      {/* Tabla */}
      <div className={cn('relative rounded-2xl bg-white dark:bg-slate-900 shadow-soft overflow-hidden', renderCard && 'hidden sm:block')}>

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
                {hasSelection && (
                  <th className="w-10 py-3 pl-4 pr-1">
                    <SelectCheckbox
                      checked={allSelected}
                      indeterminate={selectedCount > 0 && !allSelected}
                      disabled={selectableKeys.length === 0}
                      onChange={toggleAll}
                      label="Seleccionar todos"
                    />
                  </th>
                )}
                {renderExpanded && <th className="w-8 px-2 py-3" />}
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
                    colSpan={columns.length + extraCols}
                    className="py-12 text-center text-sm text-gray-400 dark:text-slate-500"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {rows.map((row, i) => {
                const key = rowKey(row)
                const canExpand = renderExpanded && (!isExpandable || isExpandable(row))
                const isOpen = canExpand && expanded.has(key)
                return (
                <Fragment key={key}>
                <tr
                  className={cn(
                    'transition-colors',
                    hasSelection && selected.has(key)
                      ? 'bg-primary-50/60 dark:bg-primary-900/10'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-800/40',
                  )}
                >
                  {hasSelection && (
                    <td className="py-3 pl-4 pr-1">
                      {selectable!(row) && (
                        <SelectCheckbox checked={selected.has(key)} onChange={() => toggleRow(key)} label="Seleccionar fila" />
                      )}
                    </td>
                  )}
                  {renderExpanded && (
                    <td className="px-2 py-3">
                      {canExpand && (
                        <button
                          onClick={() => toggleExpanded(key)}
                          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                        >
                          <ChevronRight size={14} className={cn('transition-transform', isOpen && 'rotate-90')} />
                        </button>
                      )}
                    </td>
                  )}
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
                        {renderActionButtons(row)}
                      </div>
                    </td>
                  )}
                </tr>
                {isOpen && (
                  <tr className="bg-gray-50/60 dark:bg-slate-800/30">
                    <td colSpan={columns.length + extraCols} className="px-4 py-3">
                      {renderExpanded!(row)}
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer: info + paginación */}
      {sorted.length > 0 && (
        <div className={cn('flex-col items-center justify-between gap-3 sm:flex-row', renderCard ? 'hidden sm:flex' : 'flex')}>

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
