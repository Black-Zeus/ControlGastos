import { useEffect, useState, useMemo } from 'react'
import { TrendingDown, TrendingUp, Wallet, Clock, CalendarRange, Lock, Unlock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { userApi, type Period, type Expense, type Income } from '@/lib/userApi'
import { fmtMoney } from '@/components/ui/KpiCard'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
                 'Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color, sub }: {
  label: string
  value: string
  icon: React.ElementType
  color: 'green' | 'orange' | 'purple' | 'red' | 'blue' | 'gray'
  sub?: string
}) {
  const colors = {
    green:  'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    orange: 'bg-orange-50 text-orange-500 dark:bg-orange-900/30 dark:text-orange-400',
    purple: 'bg-violet-50 text-violet-500 dark:bg-violet-900/30 dark:text-violet-400',
    red:    'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400',
    blue:   'bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400',
    gray:   'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400',
  }
  return (
    <div className="flex items-start gap-4 rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-soft">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', colors[color])}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-slate-400">{label}</p>
        <p className="mt-0.5 text-lg font-semibold text-gray-900 dark:text-slate-100 truncate">{value}</p>
        {sub && <p className="mt-0.5 text-[10px] text-gray-400 dark:text-slate-500">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, fmt }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string | number
  fmt: (n: number) => string
}) {
  if (!active || !payload?.length) return null
  const nonZero = payload.filter(e => e.value !== 0)
  if (!nonZero.length) return null
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-lg">
      {label !== undefined && (
        <p className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-slate-300">
          {typeof label === 'number' ? `Día ${label}` : label}
        </p>
      )}
      {nonZero.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: entry.color }} />
          <span className="text-gray-500 dark:text-slate-400">{entry.name}:</span>
          <span className="font-medium text-gray-800 dark:text-slate-200">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { user } = useAuth()
  const { isDark } = useTheme()

  const [period,   setPeriod]   = useState<Period | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [incomes,  setIncomes]  = useState<Income[]>([])
  const [loading,  setLoading]  = useState(true)
  const [noPeriod, setNoPeriod] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const all = await userApi.periods.list()
        if (!active) return
        if (!all.length) { setNoPeriod(true); setLoading(false); return }
        const p = all[0]   // más reciente, sin importar si está abierto o cerrado
        setPeriod(p)
        const [exps, incs] = await Promise.all([
          userApi.expenses.list(p.year, p.month),
          userApi.incomes.list(p.year, p.month),
        ])
        if (!active) return
        setExpenses(exps)
        setIncomes(incs)
      } catch {
        if (active) setNoPeriod(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  // ── Formatter de moneda ────────────────────────────────────────────────────
  const currency = user?.currency ?? 'CLP'
  const fmt = useMemo(() => {
    const nf = new Intl.NumberFormat(undefined, {
      style: 'currency', currency, maximumFractionDigits: 0,
    })
    return (n: number) => nf.format(n)
  }, [currency])

  const fmtShort = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
    return String(Math.round(n))
  }

  // ── Métricas principales ──────────────────────────────────────────────────
  const m = useMemo(() => {
    const totalIngresos     = incomes.reduce((s, i) => s + parseFloat(i.amount), 0)
    const egresosSaldados   = expenses.filter(e => e.payment_status === 'saldado').reduce((s, e) => s + parseFloat(e.amount), 0)
    const egresosPendientes = expenses.filter(e => e.payment_status === 'pendiente').reduce((s, e) => s + parseFloat(e.amount), 0)
    const egresosReservados = egresosSaldados + egresosPendientes
    const dineroLibre       = totalIngresos - egresosReservados
    const libreSoloPagado   = totalIngresos - egresosSaldados
    const cntIngresos       = incomes.length
    const cntSaldados       = expenses.filter(e => e.payment_status === 'saldado').length
    const cntPendientes     = expenses.filter(e => e.payment_status === 'pendiente').length
    const cntEgresos        = expenses.length
    return { totalIngresos, egresosSaldados, egresosPendientes, egresosReservados, dineroLibre, libreSoloPagado, cntIngresos, cntSaldados, cntPendientes, cntEgresos }
  }, [expenses, incomes])

  // ── Flujo diario ──────────────────────────────────────────────────────────
  const daysInMonth = useMemo(() => {
    if (!period) return 31
    return new Date(period.year, period.month, 0).getDate()
  }, [period])

  const dailyData = useMemo(() => {
    const days = Array.from({ length: daysInMonth }, (_, i) => ({
      dia: i + 1, saldado: 0, pendiente: 0, ingresos: 0,
    }))
    for (const e of expenses) {
      const d = parseInt(e.date.split('-')[2], 10) - 1
      if (d >= 0 && d < daysInMonth) {
        if (e.payment_status === 'saldado') days[d].saldado   += parseFloat(e.amount)
        else                                days[d].pendiente += parseFloat(e.amount)
      }
    }
    for (const i of incomes) {
      const d = parseInt(i.date.split('-')[2], 10) - 1
      if (d >= 0 && d < daysInMonth) days[d].ingresos += parseFloat(i.amount)
    }
    return days
  }, [expenses, incomes, daysInMonth])

  // ── Egresos por categoría (para gráfico, top 12) ─────────────────────────
  const categoryChartData = useMemo(() => {
    const map = new Map<string, { saldado: number; pendiente: number }>()
    for (const e of expenses) {
      const cur = map.get(e.category_name) ?? { saldado: 0, pendiente: 0 }
      if (e.payment_status === 'saldado') cur.saldado   += parseFloat(e.amount)
      else                                cur.pendiente += parseFloat(e.amount)
      map.set(e.category_name, cur)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, total: v.saldado + v.pendiente }))
      .filter(d => d.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
  }, [expenses])

  // ── Egresos por categoría (para tabla, sin límite) ────────────────────────
  const categoryTableData = useMemo(() => {
    const map = new Map<string, { saldado: number; pendiente: number }>()
    for (const e of expenses) {
      const cur = map.get(e.category_name) ?? { saldado: 0, pendiente: 0 }
      if (e.payment_status === 'saldado') cur.saldado   += parseFloat(e.amount)
      else                                cur.pendiente += parseFloat(e.amount)
      map.set(e.category_name, cur)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, total: v.saldado + v.pendiente }))
      .filter(d => d.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [expenses])

  // ── Por responsable ───────────────────────────────────────────────────────
  const responsableData = useMemo(() => {
    const map = new Map<string, { ingRecibidos: number; ingPendientes: number; egresos: number }>()
    for (const i of incomes) {
      const r   = i.responsible_tag || 'Sin asignar'
      const cur = map.get(r) ?? { ingRecibidos: 0, ingPendientes: 0, egresos: 0 }
      if (i.payment_status === 'recibido') cur.ingRecibidos  += parseFloat(i.amount)
      else                                 cur.ingPendientes += parseFloat(i.amount)
      map.set(r, cur)
    }
    for (const e of expenses) {
      const r   = e.responsible_tag || 'Sin asignar'
      const cur = map.get(r) ?? { ingRecibidos: 0, ingPendientes: 0, egresos: 0 }
      cur.egresos += parseFloat(e.amount)
      map.set(r, cur)
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, balance: v.ingRecibidos - v.egresos }))
      .sort((a, b) => (b.ingRecibidos + b.ingPendientes) - (a.ingRecibidos + a.ingPendientes))
  }, [expenses, incomes])

  // ── Obviable ──────────────────────────────────────────────────────────────
  const obviableData = useMemo(() => {
    const denom      = m.egresosReservados || 1
    const obviable   = expenses.filter(e =>  e.obviable).reduce((s, e) => s + parseFloat(e.amount), 0)
    const noObviable = expenses.filter(e => !e.obviable).reduce((s, e) => s + parseFloat(e.amount), 0)
    return [
      { name: 'No obviable', value: noObviable, pct: noObviable / denom },
      { name: 'Obviable',    value: obviable,   pct: obviable   / denom },
    ]
  }, [expenses, m.egresosReservados])

  // ── Últimos movimientos ───────────────────────────────────────────────────
  const recentMovements = useMemo(() => [
    ...expenses.map(e => ({ id: e.id, kind: 'egreso'  as const, date: e.date, label: e.label, amount: e.amount })),
    ...incomes.map(i  => ({ id: i.id, kind: 'ingreso' as const, date: i.date, label: i.label, amount: i.amount })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6), [expenses, incomes])

  // ── Colores del tema ──────────────────────────────────────────────────────
  const gridStroke = isDark ? '#1e293b' : '#f1f5f9'
  const axisColor  = isDark ? '#64748b' : '#94a3b8'
  const card       = 'rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-soft'

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  if (noPeriod) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-slate-800">
          <CalendarRange size={24} className="text-gray-400 dark:text-slate-500" />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900 dark:text-slate-100">Sin períodos registrados</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Abre tu primer período para ver el resumen aquí.</p>
        </div>
        <NavLink to="/periodos" className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600">
          Ir a Períodos
        </NavLink>
      </div>
    )
  }

  // ── Totales para tablas ───────────────────────────────────────────────────
  const catTotSaldado   = categoryTableData.reduce((s, c) => s + c.saldado,   0)
  const catTotPendiente = categoryTableData.reduce((s, c) => s + c.pendiente, 0)
  const catTotTotal     = catTotSaldado + catTotPendiente

  const resTotRecibidos  = responsableData.reduce((s, r) => s + r.ingRecibidos,  0)
  const resTotPendientes = responsableData.reduce((s, r) => s + r.ingPendientes, 0)
  const resTotEgresos    = responsableData.reduce((s, r) => s + r.egresos,       0)
  const resTotBalance    = resTotRecibidos - resTotEgresos

  return (
    <div className="space-y-6">

      {/* ── Encabezado ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            Hola, {user?.name.split(' ')[0]}
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {period ? `${MONTHS[period.month - 1]} ${period.year}` : ''}
          </p>
        </div>
        {period && (
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shrink-0 mt-0.5',
            period.status === 'abierto'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400',
          )}>
            {period.status === 'abierto' ? <Unlock size={11} /> : <Lock size={11} />}
            {period.status === 'abierto' ? 'Período abierto' : 'Período cerrado'}
          </span>
        )}
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <KpiCard label="Total ingresos"     value={fmtMoney(m.totalIngresos, currency)}     icon={TrendingUp}   color="green"  sub={`${m.cntIngresos} registros`} />
        <KpiCard label="Egresos saldados"   value={fmtMoney(m.egresosSaldados, currency)}   icon={TrendingDown} color="orange" sub={`${m.cntSaldados} registros`} />
        <KpiCard label="Egresos pendientes" value={fmtMoney(m.egresosPendientes, currency)} icon={Clock}        color="purple" sub={`${m.cntPendientes} registros`} />
        <KpiCard label="Egresos reservados" value={fmtMoney(m.egresosReservados, currency)} icon={TrendingDown} color="blue"   sub={`${m.cntEgresos} registros`} />
        <KpiCard
          label="Dinero libre"
          value={fmtMoney(m.dineroLibre, currency)}
          icon={Wallet}
          color={m.dineroLibre >= 0 ? 'green' : 'red'}
          sub={`${m.cntIngresos + m.cntEgresos} registros`}
        />
        <KpiCard
          label="Libre solo pagado"
          value={fmtMoney(m.libreSoloPagado, currency)}
          icon={Wallet}
          color={m.libreSoloPagado >= 0 ? 'green' : 'red'}
          sub={`${m.cntIngresos + m.cntSaldados} registros`}
        />
      </div>

      {/* ── Flujo diario ────────────────────────────────────────────────── */}
      <div className={card}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Flujo diario</h3>
        <p className="mt-0.5 mb-4 text-xs text-gray-400 dark:text-slate-500">
          Ingresos, egresos saldados y pendientes por día del período
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailyData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barGap={2} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fontSize: 10, fill: axisColor }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 10, fill: axisColor }}
              tickFormatter={fmtShort}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ fill: isDark ? '#1e293b' : '#f8fafc' }} />
            <Bar dataKey="ingresos"  name="Ingresos"  stackId="ing" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="saldado"   name="Saldado"   stackId="egr" fill="#f97316" radius={[0, 0, 0, 0]} />
            <Bar dataKey="pendiente" name="Pendiente" stackId="egr" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex items-center gap-5">
          <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Ingresos</span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> Saldado</span>
          <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-violet-500" /> Pendiente</span>
        </div>
      </div>

      {/* ── Gráfico categorías + Tabla responsable ───────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        <div className={card}>
          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Egresos por categoría</h3>
          {categoryChartData.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-gray-400 dark:text-slate-500">Sin egresos registrados</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(220, categoryChartData.length * 36)}>
                <BarChart layout="vertical" data={categoryChartData} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: axisColor }} tickFormatter={fmtShort} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ fill: isDark ? '#1e293b' : '#f8fafc' }} />
                  <Bar dataKey="saldado"   name="Saldado"   stackId="a" fill="#f97316" radius={[0,0,0,0]} />
                  <Bar dataKey="pendiente" name="Pendiente" stackId="a" fill="#8b5cf6" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> Saldado</span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-violet-500" /> Pendiente</span>
              </div>
            </>
          )}
        </div>

        {/* Right column: table + chart stacked */}
        <div className="flex flex-col gap-6">

          {/* Tabla Por responsable — compact */}
          <div className={cn(card, 'flex flex-col')}>
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Por responsable</h3>
            {responsableData.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-sm text-gray-400 dark:text-slate-500">Sin datos</div>
            ) : (
              <>
                <table className="w-full text-xs [table-layout:fixed]">
                  <colgroup><col /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /></colgroup>
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-slate-800">
                      <th className="pb-2 text-left font-medium text-gray-500 dark:text-slate-400">Responsable</th>
                      <th className="pb-2 text-right font-medium text-emerald-600 dark:text-emerald-400">Recibido</th>
                      <th className="pb-2 text-right font-medium text-amber-500 dark:text-amber-400">Pendiente</th>
                      <th className="pb-2 text-right font-medium text-orange-500 dark:text-orange-400">Egresos</th>
                      <th className="pb-2 text-right font-medium text-gray-500 dark:text-slate-400">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                    {responsableData.map(r => (
                      <tr key={r.name}>
                        <td className="py-2 font-medium text-gray-700 dark:text-slate-300 truncate">{r.name}</td>
                        <td className="py-2 text-right text-emerald-600 dark:text-emerald-400">{fmt(r.ingRecibidos)}</td>
                        <td className="py-2 text-right text-amber-500 dark:text-amber-400">{r.ingPendientes > 0 ? fmt(r.ingPendientes) : <span className="text-gray-300 dark:text-slate-600">—</span>}</td>
                        <td className="py-2 text-right text-orange-500 dark:text-orange-400">{fmt(r.egresos)}</td>
                        <td className={cn('py-2 text-right font-semibold', r.balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
                          {fmt(r.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <table className="w-full text-xs mt-3 [table-layout:fixed]">
                  <colgroup><col /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /></colgroup>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 dark:border-slate-700">
                      <td className="pt-2 font-semibold text-gray-600 dark:text-slate-400">Total</td>
                      <td className="pt-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{fmt(resTotRecibidos)}</td>
                      <td className="pt-2 text-right font-semibold text-amber-500 dark:text-amber-400">{fmt(resTotPendientes)}</td>
                      <td className="pt-2 text-right font-semibold text-orange-500 dark:text-orange-400">{fmt(resTotEgresos)}</td>
                      <td className={cn('pt-2 text-right font-semibold', resTotBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{fmt(resTotBalance)}</td>
                    </tr>
                  </tfoot>
                </table>
              </>
            )}
          </div>

          {/* Gráfico Ingresos vs Egresos por responsable */}
          <div className={cn(card, 'flex flex-col flex-1')}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Ingresos vs Egresos</h3>
            <p className="mt-0.5 mb-4 text-xs text-gray-400 dark:text-slate-500">Por responsable</p>
            {responsableData.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-gray-400 dark:text-slate-500">Sin datos</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(160, responsableData.length * 70)}>
                  <BarChart data={responsableData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barGap={2} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: axisColor }} tickFormatter={fmtShort} axisLine={false} tickLine={false} width={48} />
                    <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ fill: isDark ? '#1e293b' : '#f8fafc' }} />
                    <Bar dataKey="ingRecibidos"  name="Recibido"  stackId="ing" fill="#10b981" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="ingPendientes" name="Pendiente" stackId="ing" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="egresos"       name="Egresos"               fill="#f97316" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 flex items-center gap-5">
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Recibido</span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Pendiente</span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> Egresos</span>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      {/* ── Tabla categorías + Tabla diaria ─────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Tabla detalle por categoría */}
        <div className={cn(card, 'flex flex-col')}>
          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Detalle por categoría</h3>
          {categoryTableData.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-400 dark:text-slate-500">Sin egresos registrados</div>
          ) : (
            <>
              <div className="flex-1">
                <table className="w-full text-xs [table-layout:fixed]">
                  <colgroup><col /><col style={{ width: '22%' }} /><col style={{ width: '22%' }} /><col style={{ width: '22%' }} /></colgroup>
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-slate-800">
                      <th className="pb-2 text-left font-medium text-gray-500 dark:text-slate-400">Tipología</th>
                      <th className="pb-2 text-right font-medium text-orange-400 dark:text-orange-400">Saldado</th>
                      <th className="pb-2 text-right font-medium text-violet-500 dark:text-violet-400">Pendiente</th>
                      <th className="pb-2 text-right font-medium text-gray-500 dark:text-slate-400">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                    {categoryTableData.map(c => (
                      <tr key={c.name} className="group hover:bg-gray-50 dark:hover:bg-slate-800/40">
                        <td className="py-2 font-medium text-gray-700 dark:text-slate-300 truncate">{c.name}</td>
                        <td className="py-2 text-right text-orange-500 dark:text-orange-400">{c.saldado > 0 ? fmt(c.saldado) : <span className="text-gray-300 dark:text-slate-600">—</span>}</td>
                        <td className="py-2 text-right text-violet-600 dark:text-violet-400">{c.pendiente > 0 ? fmt(c.pendiente) : <span className="text-gray-300 dark:text-slate-600">—</span>}</td>
                        <td className="py-2 text-right font-semibold text-gray-800 dark:text-slate-200">{fmt(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <table className="w-full text-xs mt-auto [table-layout:fixed]">
                <colgroup><col /><col style={{ width: '22%' }} /><col style={{ width: '22%' }} /><col style={{ width: '22%' }} /></colgroup>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 dark:border-slate-700">
                    <td className="pt-2 font-semibold text-gray-600 dark:text-slate-400">Total</td>
                    <td className="pt-2 text-right font-semibold text-orange-500 dark:text-orange-400">{fmt(catTotSaldado)}</td>
                    <td className="pt-2 text-right font-semibold text-violet-600 dark:text-violet-400">{fmt(catTotPendiente)}</td>
                    <td className="pt-2 text-right font-semibold text-gray-800 dark:text-slate-200">{fmt(catTotTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>

        {/* Tabla flujo por día */}
        <div className={cn(card, 'flex flex-col')}>
          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Flujo por día</h3>
          <div className="flex-1">
            <table className="w-full text-xs [table-layout:fixed]">
              <colgroup><col style={{ width: '12%' }} /><col /><col /><col /></colgroup>
              <thead>
                <tr className="border-b border-gray-100 dark:border-slate-800">
                  <th className="pb-2 text-left font-medium text-gray-500 dark:text-slate-400">Día</th>
                  <th className="pb-2 text-right font-medium text-orange-400">Saldado</th>
                  <th className="pb-2 text-right font-medium text-violet-500">Pendiente</th>
                  <th className="pb-2 text-right font-medium text-emerald-500">Ingresos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                {dailyData.map(d => {
                  const hasActivity = d.saldado > 0 || d.pendiente > 0 || d.ingresos > 0
                  return (
                    <tr
                      key={d.dia}
                      className={cn(
                        'transition-colors',
                        hasActivity
                          ? 'hover:bg-gray-50 dark:hover:bg-slate-800/40'
                          : 'opacity-30',
                      )}
                    >
                      <td className="py-1.5 font-medium text-gray-600 dark:text-slate-400">{d.dia}</td>
                      <td className="py-1.5 text-right text-orange-500 dark:text-orange-400">{d.saldado > 0 ? fmt(d.saldado) : '—'}</td>
                      <td className="py-1.5 text-right text-violet-600 dark:text-violet-400">{d.pendiente > 0 ? fmt(d.pendiente) : '—'}</td>
                      <td className="py-1.5 text-right text-emerald-600 dark:text-emerald-400">{d.ingresos > 0 ? fmt(d.ingresos) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <table className="w-full text-xs mt-auto [table-layout:fixed]">
            <colgroup><col style={{ width: '12%' }} /><col /><col /><col /></colgroup>
            <tfoot>
              <tr className="border-t-2 border-gray-200 dark:border-slate-700">
                <td className="pt-2 font-semibold text-gray-600 dark:text-slate-400">Total</td>
                <td className="pt-2 text-right font-semibold text-orange-500 dark:text-orange-400">{fmt(m.egresosSaldados)}</td>
                <td className="pt-2 text-right font-semibold text-violet-600 dark:text-violet-400">{fmt(m.egresosPendientes)}</td>
                <td className="pt-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{fmt(m.totalIngresos)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Clasificación + Últimos movimientos ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        <div className={cn(card, 'flex flex-col')}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Clasificación de egresos</h3>
          <p className="mt-0.5 mb-5 text-xs text-gray-400 dark:text-slate-500">Obviable vs no obviable · Saldado vs pendiente</p>

          <div className="flex-1 space-y-5">
            {/* Obviable vs No obviable */}
            <div>
              <div className="mb-1.5 flex justify-between text-xs font-medium text-gray-600 dark:text-slate-300">
                <span>No obviable / Obviable</span>
              </div>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                {m.egresosReservados > 0 && <>
                  <div style={{ width: `${obviableData[0].pct * 100}%` }} className="bg-orange-400 transition-all" />
                  <div style={{ width: `${obviableData[1].pct * 100}%` }} className="bg-slate-300 dark:bg-slate-500 transition-all" />
                </>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="inline-block h-2 w-2 rounded-full bg-orange-400 mr-1.5" />
                  <span className="font-medium text-gray-700 dark:text-slate-300">No obviable</span>
                  <p className="mt-0.5 text-gray-400 dark:text-slate-500">{fmt(obviableData[0].value)} · {(obviableData[0].pct * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-500 mr-1.5" />
                  <span className="font-medium text-gray-700 dark:text-slate-300">Obviable</span>
                  <p className="mt-0.5 text-gray-400 dark:text-slate-500">{fmt(obviableData[1].value)} · {(obviableData[1].pct * 100).toFixed(1)}%</p>
                </div>
              </div>
            </div>

            {/* Saldado vs Pendiente */}
            <div>
              <div className="mb-1.5 flex justify-between text-xs font-medium text-gray-600 dark:text-slate-300">
                <span>Saldado / Pendiente</span>
              </div>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                {m.egresosReservados > 0 && <>
                  <div style={{ width: `${m.egresosSaldados / m.egresosReservados * 100}%` }} className="bg-orange-500 transition-all" />
                  <div style={{ width: `${m.egresosPendientes / m.egresosReservados * 100}%` }} className="bg-violet-500 transition-all" />
                </>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="inline-block h-2 w-2 rounded-full bg-orange-500 mr-1.5" />
                  <span className="font-medium text-gray-700 dark:text-slate-300">Saldado</span>
                  <p className="mt-0.5 text-gray-400 dark:text-slate-500">{fmt(m.egresosSaldados)} · {m.egresosReservados > 0 ? (m.egresosSaldados / m.egresosReservados * 100).toFixed(1) : '0.0'}%</p>
                </div>
                <div>
                  <span className="inline-block h-2 w-2 rounded-full bg-violet-500 mr-1.5" />
                  <span className="font-medium text-gray-700 dark:text-slate-300">Pendiente</span>
                  <p className="mt-0.5 text-gray-400 dark:text-slate-500">{fmt(m.egresosPendientes)} · {m.egresosReservados > 0 ? (m.egresosPendientes / m.egresosReservados * 100).toFixed(1) : '0.0'}%</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto border-t-2 border-gray-200 dark:border-slate-700 pt-2 flex justify-between text-xs font-semibold">
            <span className="text-gray-600 dark:text-slate-400">Total egresos</span>
            <span className="text-gray-800 dark:text-slate-200">{fmt(m.egresosReservados)}</span>
          </div>
        </div>

        <div className={card}>
          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Últimos movimientos</h3>
          {recentMovements.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-gray-400 dark:text-slate-500">Sin movimientos registrados</div>
          ) : (
            <ul className="space-y-3">
              {recentMovements.map(mov => (
                <li key={`${mov.kind}-${mov.id}`} className="flex items-center gap-3 text-xs">
                  <span className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    mov.kind === 'ingreso' ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-orange-50 dark:bg-orange-900/30',
                  )}>
                    {mov.kind === 'ingreso'
                      ? <TrendingUp  size={13} className="text-emerald-600 dark:text-emerald-400" />
                      : <TrendingDown size={13} className="text-orange-500 dark:text-orange-400" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-700 dark:text-slate-300">{mov.label}</p>
                    <p className="text-gray-400 dark:text-slate-500">{mov.date}</p>
                  </div>
                  <span className={cn('shrink-0 font-semibold',
                    mov.kind === 'ingreso' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-slate-300',
                  )}>
                    {mov.kind === 'ingreso' ? '+' : '−'}{fmt(parseFloat(mov.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
