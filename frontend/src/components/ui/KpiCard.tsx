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

interface KpiCardProps {
  label: string
  amount: number
  currency: string
  count?: number
  color?: string
}

export function KpiCard({ label, amount, currency, count, color = 'text-gray-900 dark:text-slate-100' }: KpiCardProps) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-soft">
      <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
      <p className={cn('mt-1 text-xl font-semibold tabular-nums', color)}>
        {fmtMoney(amount, currency)}
      </p>
      {count !== undefined && (
        <p className="mt-0.5 text-[11px] text-gray-400 dark:text-slate-500">{count} registros</p>
      )}
    </div>
  )
}
