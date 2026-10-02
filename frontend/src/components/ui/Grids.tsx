import { cn } from '@/lib/utils'

// ─── Grids responsive compartidos ─────────────────────────────────────────────
// Regla mobile (< sm / 640 px): siempre una columna. Las clases van como strings
// completos para que Tailwind las detecte en el build.

const KPI_COLS = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
} as const

/** Grid de KPIs: 1 columna en teléfono, 2 en tablet, `cols` desde lg. */
export function KpiGrid({ cols = 4, className, children }: {
  cols?: keyof typeof KPI_COLS
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4', KPI_COLS[cols], className)}>
      {children}
    </div>
  )
}

const FORM_COLS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
} as const

/** Grid de campos de formulario: 1 columna en teléfono, `cols` desde sm. */
export function FormGrid({ cols = 2, className, children }: {
  cols?: keyof typeof FORM_COLS
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 [&>*]:min-w-0', FORM_COLS[cols], className)}>
      {children}
    </div>
  )
}
