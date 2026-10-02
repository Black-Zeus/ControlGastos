import { cn } from '@/lib/utils'

const ZERO_DECIMAL = new Set(['CLP', 'CRC', 'COP', 'PYG', 'JPY', 'KRW', 'IDR', 'VND'])

/** Formatea un monto como "1.234.567 CRC" (punto miles, coma decimal). */
export function fmtMoney(amount: number, currency: string): string {
  const zd = ZERO_DECIMAL.has(currency)
  const fixed = Math.abs(amount).toFixed(zd ? 0 : 2)
  const [int, dec] = fixed.split('.')
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const numStr = dec !== undefined ? `${intFmt},${dec}` : intFmt
  const sign   = amount < 0 ? '-' : ''
  return `${sign}${numStr} ${currency}`
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────
// Card única para KPIs (reemplaza las variantes locales de Dashboard/Períodos).
// El valor nunca se trunca: usa un font-size fluido y puede partir línea, para
// que montos como "1.272.316 CLP" se lean completos en teléfonos de 320 px.

export type KpiTone = 'green' | 'orange' | 'purple' | 'red' | 'blue' | 'gray'

const TONE_CHIP: Record<KpiTone, string> = {
  green:  'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  orange: 'bg-orange-50 text-orange-500 dark:bg-orange-900/30 dark:text-orange-400',
  purple: 'bg-violet-50 text-violet-500 dark:bg-violet-900/30 dark:text-violet-400',
  red:    'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400',
  blue:   'bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400',
  gray:   'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400',
}

interface KpiCardProps {
  label: string
  /** Monto a formatear con `fmtMoney` (requiere `currency`). */
  amount?: number
  currency?: string
  /** Valor ya formateado; alternativa a `amount`/`currency`. */
  value?: React.ReactNode
  /** Cantidad de registros, se muestra como "N registros". */
  count?: number
  /** Texto secundario libre (tiene prioridad sobre `count`). */
  sub?: string
  icon?: React.ElementType
  /** Color del chip del icono. */
  tone?: KpiTone
  /** Clases de color del valor. */
  color?: string
  className?: string
}

export function KpiCard({
  label, amount, currency, value, count, sub, icon: Icon, tone = 'gray',
  color = 'text-gray-900 dark:text-slate-100', className,
}: KpiCardProps) {
  const display = value ?? (amount !== undefined && currency ? fmtMoney(amount, currency) : null)
  const secondary = sub ?? (count !== undefined ? `${count} registros` : undefined)

  return (
    <div className={cn('flex min-w-0 items-start gap-3 rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900 sm:gap-4', className)}>
      {Icon && (
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONE_CHIP[tone])}>
          <Icon size={18} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500 dark:text-slate-400">{label}</p>
        <p className={cn(
          'mt-1 break-words font-semibold leading-tight tabular-nums',
          'text-[clamp(1.05rem,5vw,1.25rem)] sm:text-xl',
          color,
        )}>
          {display}
        </p>
        {secondary && (
          <p className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-500">{secondary}</p>
        )}
      </div>
    </div>
  )
}
