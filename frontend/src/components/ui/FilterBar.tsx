import { useRef, useState, useEffect } from 'react'
import { ChevronDown, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface FilterOption {
  value: string
  label: string
}

export type FilterControlDef =
  | { type: 'input';    key: string; label: string; placeholder?: string }
  | { type: 'select';   key: string; label: string; options: FilterOption[]; searchable?: boolean; placeholder?: string }
  | { type: 'radio';    key: string; label: string; options: FilterOption[] }
  | { type: 'checkbox'; key: string; label: string; options: FilterOption[] }

export interface FilterBarAction {
  label: string
  icon?: React.ElementType
  onClick: () => void
  variant?: 'primary' | 'outline'
}

export interface FilterBarProps {
  controls: FilterControlDef[]
  values: Record<string, string | string[]>
  onChange: (key: string, value: string | string[]) => void
  actions?: FilterBarAction[]
  /** Muestra botón "Limpiar" cuando hay algún filtro activo */
  onClear?: () => void
}

// ─── Select con búsqueda ──────────────────────────────────────────────────────

function SearchableSelect({
  options, value, onChange, placeholder = 'Seleccionar…', label,
}: {
  options: FilterOption[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label: string
}) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const ref                 = useRef<HTMLDivElement>(null)

  const selected  = options.find(o => o.value === value)
  const filtered  = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const inputCls = cn(
    'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm',
    'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
    'placeholder:text-gray-400 dark:placeholder:text-slate-500',
    'outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100',
    'dark:focus:border-primary-500 dark:focus:ring-primary-900/30 transition-colors',
  )

  return (
    <div ref={ref} className="relative min-w-[140px]">
      <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">{label}</p>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
          'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900',
          open
            ? 'border-primary-400 ring-2 ring-primary-100 dark:border-primary-500 dark:ring-primary-900/30'
            : 'hover:border-gray-300 dark:hover:border-slate-600',
          selected ? 'text-gray-900 dark:text-slate-100' : 'text-gray-400 dark:text-slate-500',
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown size={14} className={cn('shrink-0 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[180px] overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-card">
          {/* Input de búsqueda */}
          <div className="p-2 border-b border-gray-100 dark:border-slate-800">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar…"
              className={cn(inputCls, 'py-1.5 text-xs')}
            />
          </div>
          {/* Opciones */}
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-400 dark:text-slate-500">Sin resultados</li>
            ) : filtered.map(opt => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-sm transition-colors',
                    opt.value === value
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                      : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800',
                  )}
                >
                  {opt.label}
                  {opt.value === value && <Check size={13} className="text-primary-500" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Select simple (sin búsqueda) ─────────────────────────────────────────────

function SimpleSelect({
  options, value, onChange, placeholder = 'Seleccionar…', label,
}: {
  options: FilterOption[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label: string
}) {
  return (
    <div className="min-w-[130px]">
      <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">{label}</p>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm',
          'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
          'outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100',
          'dark:focus:border-primary-500 dark:focus:ring-primary-900/30 transition-colors',
          !value && 'text-gray-400 dark:text-slate-500',
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ─── Radio ────────────────────────────────────────────────────────────────────

function RadioControl({
  options, value, onChange, label,
}: {
  options: FilterOption[]
  value: string
  onChange: (v: string) => void
  label: string
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-slate-400">{label}</p>
      <div className="flex items-center gap-1 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap',
              value === opt.value
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────

function CheckboxControl({
  options, values, onChange, label,
}: {
  options: FilterOption[]
  values: string[]
  onChange: (values: string[]) => void
  label: string
}) {
  function toggle(v: string) {
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v])
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const checked = values.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors',
                checked
                  ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 hover:border-gray-300 dark:hover:border-slate-600',
              )}
            >
              <span className={cn(
                'flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors',
                checked
                  ? 'border-primary-500 bg-primary-500'
                  : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800',
              )}>
                {checked && <Check size={9} className="text-white" />}
              </span>
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── FilterBar ────────────────────────────────────────────────────────────────

const inputFieldCls = cn(
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm',
  'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
  'placeholder:text-gray-400 dark:placeholder:text-slate-500',
  'outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100',
  'dark:focus:border-primary-500 dark:focus:ring-primary-900/30 transition-colors',
)

export function FilterBar({ controls, values, onChange, actions, onClear }: FilterBarProps) {
  const hasActiveFilter = Object.values(values).some(v =>
    Array.isArray(v) ? v.length > 0 : v !== '',
  )

  // Separar el input de búsqueda del resto para poder ponerlos en filas distintas
  const inputCtrls  = controls.filter(c => c.type === 'input')
  const otherCtrls  = controls.filter(c => c.type !== 'input')

  const renderControl = (ctrl: FilterControlDef) => {
    if (ctrl.type === 'input') {
      return (
        <div key={ctrl.key} className="flex-1 min-w-0">
          <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">{ctrl.label}</p>
          <input
            value={(values[ctrl.key] as string) ?? ''}
            onChange={e => onChange(ctrl.key, e.target.value)}
            placeholder={ctrl.placeholder}
            className={inputFieldCls}
          />
        </div>
      )
    }
    if (ctrl.type === 'select') {
      const val = (values[ctrl.key] as string) ?? ''
      return (
        <div key={ctrl.key} className="flex-none">
          {ctrl.searchable ? (
            <SearchableSelect label={ctrl.label} options={ctrl.options} value={val} onChange={v => onChange(ctrl.key, v)} placeholder={ctrl.placeholder} />
          ) : (
            <SimpleSelect label={ctrl.label} options={ctrl.options} value={val} onChange={v => onChange(ctrl.key, v)} placeholder={ctrl.placeholder} />
          )}
        </div>
      )
    }
    if (ctrl.type === 'radio') {
      return (
        <div key={ctrl.key} className="flex-none">
          <RadioControl label={ctrl.label} options={ctrl.options} value={(values[ctrl.key] as string) ?? ''} onChange={v => onChange(ctrl.key, v)} />
        </div>
      )
    }
    if (ctrl.type === 'checkbox') {
      return (
        <div key={ctrl.key} className="flex-none">
          <CheckboxControl label={ctrl.label} options={ctrl.options} values={(values[ctrl.key] as string[]) ?? []} onChange={v => onChange(ctrl.key, v)} />
        </div>
      )
    }
    return null
  }

  const clearBtn = onClear ? (
    <button
      type="button"
      onClick={onClear}
      disabled={!hasActiveFilter}
      aria-hidden={!hasActiveFilter}
      className={cn(
        'flex flex-none items-center gap-1.5 self-end rounded-xl border px-3 py-2 text-sm transition-colors whitespace-nowrap',
        hasActiveFilter
          ? 'border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 hover:border-gray-300 hover:text-gray-600 dark:hover:text-slate-300'
          : 'invisible',
      )}
    >
      <X size={13} /> Limpiar
    </button>
  ) : null

  const actionBtns = actions && actions.length > 0 ? (
    <div className="flex items-end gap-2">
      {actions.map((action, i) => {
        const Icon = action.icon
        const variant = action.variant ?? 'primary'
        return (
          <button
            key={i}
            type="button"
            onClick={action.onClick}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap',
              variant === 'primary'
                ? 'bg-primary-500 text-white hover:bg-primary-600'
                : 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 bg-white dark:bg-slate-900',
            )}
          >
            {Icon && <Icon size={15} />}
            {action.label}
          </button>
        )
      })}
    </div>
  ) : null

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Fila 1: input(s) de búsqueda + botón de acción principal */}
      <div className="flex items-end gap-3">
        {inputCtrls.map(renderControl)}
        {actionBtns}
      </div>

      {/* Fila 2: filtros select/radio/checkbox + limpiar (si los hay) */}
      {(otherCtrls.length > 0 || onClear) && (
        <div className="flex flex-wrap items-end gap-3">
          {otherCtrls.map(renderControl)}
          {clearBtn}
        </div>
      )}
    </div>
  )
}
