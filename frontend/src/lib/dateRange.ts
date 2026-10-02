// ─── Rangos de fechas (YYYY-MM-DD en hora local) ──────────────────────────────
// Se trabaja con fechas locales, no con toISOString() (UTC): en America/Santiago
// eso adelantaría el día por la noche.

export interface DateRange {
  /** Inclusive, 'YYYY-MM-DD'; '' = sin límite. */
  from: string
  /** Inclusive, 'YYYY-MM-DD'; '' = sin límite. */
  to: string
}

export const EMPTY_RANGE: DateRange = { from: '', to: '' }

export function toLocalISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export type RangePresetKey = 'today' | 'week' | 'next7' | 'next15'

/** Atajos hacia adelante: sirven para ver lo comprometido que viene por pagar. */
export const RANGE_PRESETS: { key: RangePresetKey; label: string }[] = [
  { key: 'today',  label: 'Hoy' },
  { key: 'week',   label: 'Esta semana' },
  { key: 'next7',  label: '7 días' },
  { key: 'next15', label: '15 días' },
]

export function presetRange(key: RangePresetKey, now = new Date()): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (key) {
    case 'today':  return { from: toLocalISODate(today), to: toLocalISODate(today) }
    case 'next7':  return { from: toLocalISODate(today), to: toLocalISODate(addDays(today, 6)) }
    case 'next15': return { from: toLocalISODate(today), to: toLocalISODate(addDays(today, 14)) }
    case 'week': {
      // Semana de lunes a domingo
      const monday = addDays(today, -((today.getDay() + 6) % 7))
      return { from: toLocalISODate(monday), to: toLocalISODate(addDays(monday, 6)) }
    }
  }
}

export function isInRange(date: string, range: DateRange): boolean {
  if (range.from && date < range.from) return false
  if (range.to && date > range.to) return false
  return true
}

export function isRangeActive(range: DateRange): boolean {
  return !!(range.from || range.to)
}
