import type { Expense, Income } from './userApi'

export const MONTHS       = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
export const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// Un borrador de ingesta (bot/OCR) todavía no es un egreso confirmado por el
// usuario — se excluye de toda métrica agregada (dashboard, reportes, comparación).
export function confirmedOnly(expenses: Expense[]): Expense[] {
  return expenses.filter(e => e.review_status !== 'borrador')
}

export function calcMetrics(expenses: Expense[], incomes: Income[]) {
  const confirmed = confirmedOnly(expenses)
  const ingresosRecibidos  = incomes.filter(i => i.payment_status === 'recibido').reduce((s, i) => s + parseFloat(i.amount), 0)
  const ingresosPendientes = incomes.filter(i => i.payment_status === 'pendiente').reduce((s, i) => s + parseFloat(i.amount), 0)
  const totalIngresos      = ingresosRecibidos + ingresosPendientes
  const egresosSaldados    = confirmed.filter(e => e.payment_status === 'saldado').reduce((s, e) => s + parseFloat(e.amount), 0)
  const egresosPendientes  = confirmed.filter(e => e.payment_status === 'pendiente').reduce((s, e) => s + parseFloat(e.amount), 0)
  const egresosReservados  = egresosSaldados + egresosPendientes
  const dineroLibre        = ingresosRecibidos - egresosReservados
  const libreSoloPagado    = ingresosRecibidos - egresosSaldados
  return { totalIngresos, ingresosRecibidos, ingresosPendientes, egresosSaldados, egresosPendientes, egresosReservados, dineroLibre, libreSoloPagado }
}

export type Metrics = ReturnType<typeof calcMetrics>

export function fmtShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return String(Math.round(n))
}

export const CAT_COLORS = [
  '#f97316','#8b5cf6','#10b981','#3b82f6','#ef4444',
  '#f59e0b','#06b6d4','#ec4899','#84cc16','#6366f1',
  '#14b8a6','#f43f5e',
]
