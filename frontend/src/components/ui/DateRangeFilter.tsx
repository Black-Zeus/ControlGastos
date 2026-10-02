import { CalendarRange, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  EMPTY_RANGE, RANGE_PRESETS, isRangeActive, presetRange,
  type DateRange,
} from '@/lib/dateRange'

// ─── DateRangeFilter ──────────────────────────────────────────────────────────
// Selector Desde/Hasta (dos calendarios nativos) + atajos. Mismo lenguaje visual
// que FilterBar: en mobile todo va en columna a ancho completo.

const inputCls = cn(
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm',
  'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
  'outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100',
  'dark:focus:border-primary-500 dark:focus:ring-primary-900/30 transition-colors',
)

interface DateRangeFilterProps {
  value: DateRange
  onChange: (range: DateRange) => void
  /** Límites sugeridos para los calendarios (p. ej. el mes del período). */
  min?: string
  max?: string
}

export function DateRangeFilter({ value, onChange, min, max }: DateRangeFilterProps) {
  const active = isRangeActive(value)
  const activePreset = RANGE_PRESETS.find(p => {
    const r = presetRange(p.key)
    return r.from === value.from && r.to === value.to
  })?.key

  function setFrom(from: string) {
    // Si "desde" supera a "hasta", se arrastra "hasta" para no dejar un rango vacío.
    onChange({ from, to: value.to && from > value.to ? from : value.to })
  }
  function setTo(to: string) {
    onChange({ from: value.from && to && to < value.from ? to : value.from, to })
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:w-[340px]">
        <div className="min-w-0">
          <label htmlFor="dr-from" className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Desde</label>
          <input id="dr-from" type="date" value={value.from} min={min} max={max} onChange={e => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div className="min-w-0">
          <label htmlFor="dr-to" className="mb-1 block text-xs font-medium text-gray-500 dark:text-slate-400">Hasta</label>
          <input id="dr-to" type="date" value={value.to} min={value.from || min} max={max} onChange={e => setTo(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="min-w-0">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-slate-400">
          <CalendarRange size={12} /> Atajos
        </p>
        <div className="flex w-full items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900 sm:w-auto">
          {RANGE_PRESETS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(presetRange(p.key))}
              aria-pressed={activePreset === p.key}
              className={cn(
                'flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium transition-colors sm:flex-none sm:px-3',
                activePreset === p.key
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_RANGE)}
          className="flex items-center justify-center gap-1.5 self-stretch whitespace-nowrap rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-600 dark:border-slate-700 dark:text-slate-500 dark:hover:text-slate-300 sm:self-end"
        >
          <X size={13} /> Todo el período
        </button>
      )}
    </div>
  )
}
