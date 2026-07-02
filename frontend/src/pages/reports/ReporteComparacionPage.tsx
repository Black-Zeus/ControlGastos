import { useState, useEffect, useMemo, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { FileDown, Loader2 as SpinIcon } from 'lucide-react'
import { PdfPreviewModal } from '@/components/ui/PdfPreviewModal'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { userApi, authToken, type Period, type Expense, type Income } from '@/lib/userApi'
import { MONTHS, MONTHS_SHORT, calcMetrics, fmtShort, type Metrics } from '@/lib/reportUtils'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, fmt }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
  fmt: (n: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-lg">
      {label && <p className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-slate-300">{label}</p>}
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: e.color }} />
          <span className="text-gray-500 dark:text-slate-400">{e.name}:</span>
          <span className="font-medium text-gray-800 dark:text-slate-200">{fmt(e.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PeriodLoad = { expenses: Expense[]; incomes: Income[] }

function periodLabel(p: Period) {
  return `${MONTHS[p.month - 1]} ${p.year}${p.status === 'abierto' ? ' (abierto)' : ''}`
}

function delta(a: number, b: number) {
  return b - a
}

function fmtDelta(d: number, fmt: (n: number) => string) {
  return d === 0 ? '—' : `${d > 0 ? '+' : ''}${fmt(d)}`
}

const KPI_ROWS: { key: keyof Metrics; label: string; higherIsBetter: boolean }[] = [
  { key: 'totalIngresos',      label: 'Total ingresos',        higherIsBetter: true  },
  { key: 'ingresosRecibidos',  label: 'Ingresos recibidos',    higherIsBetter: true  },
  { key: 'ingresosPendientes', label: 'Ingresos pendientes',   higherIsBetter: false },
  { key: 'egresosSaldados',    label: 'Egresos saldados',      higherIsBetter: false },
  { key: 'egresosPendientes',  label: 'Egresos pendientes',    higherIsBetter: false },
  { key: 'egresosReservados',  label: 'Egresos reservados',    higherIsBetter: false },
  { key: 'dineroLibre',        label: 'Dinero libre',          higherIsBetter: true  },
  { key: 'libreSoloPagado',    label: 'Libre solo pagado',     higherIsBetter: true  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ReporteComparacionPage() {
  const { user } = useAuth()
  const { isDark } = useTheme()

  const [periods,   setPeriods]   = useState<Period[]>([])
  const [pidA,      setPidA]      = useState('')
  const [pidB,      setPidB]      = useState('')
  const [dataA,     setDataA]     = useState<PeriodLoad | null>(null)
  const [dataB,     setDataB]     = useState<PeriodLoad | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [pdfState,   setPdfState]   = useState<'idle' | 'loading' | 'ready'>('idle')
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfFilename, setPdfFilename] = useState('')
  const [loadingPeriods, setLoadingPeriods] = useState(true)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    userApi.periods.list()
      .then(ps => {
        const sorted = [...ps].sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
        setPeriods(sorted)
        if (sorted.length >= 1) setPidA(sorted[0].id)
        if (sorted.length >= 2) setPidB(sorted[1].id)
      })
      .finally(() => setLoadingPeriods(false))
  }, [])

  const fmt = useMemo(() => {
    const nf = new Intl.NumberFormat(undefined, { style: 'currency', currency: user?.currency ?? 'CLP', maximumFractionDigits: 0 })
    return (n: number) => nf.format(n)
  }, [user?.currency])

  async function compare() {
    const pA = periods.find(p => p.id === pidA)
    const pB = periods.find(p => p.id === pidB)
    if (!pA || !pB) return
    setLoading(true)
    setDataA(null)
    setDataB(null)
    try {
      const [[expA, incA], [expB, incB]] = await Promise.all([
        Promise.all([userApi.expenses.list(pA.year, pA.month), userApi.incomes.list(pA.year, pA.month)]),
        Promise.all([userApi.expenses.list(pB.year, pB.month), userApi.incomes.list(pB.year, pB.month)]),
      ])
      setDataA({ expenses: expA, incomes: incA })
      setDataB({ expenses: expB, incomes: incB })
    } finally {
      setLoading(false)
    }
  }

  function _extractChartSvg(container: HTMLDivElement | null): string | null {
    const svgEl = container?.querySelector('svg')
    if (!svgEl) return null
    const clone = svgEl.cloneNode(true) as SVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.style.background = '#ffffff'
    return clone.outerHTML
  }

  async function exportPdf() {
    if (!mA || !mB) return
    setPdfState('loading')
    try {
      const KPI_ROWS_DEF: { key: keyof Metrics; label: string; higherIsBetter: boolean }[] = [
        { key: 'totalIngresos',      label: 'Total ingresos',        higherIsBetter: true  },
        { key: 'ingresosRecibidos',  label: 'Ingresos recibidos',    higherIsBetter: true  },
        { key: 'ingresosPendientes', label: 'Ingresos pendientes',   higherIsBetter: false },
        { key: 'egresosSaldados',    label: 'Egresos saldados',      higherIsBetter: false },
        { key: 'egresosPendientes',  label: 'Egresos pendientes',    higherIsBetter: false },
        { key: 'egresosReservados',  label: 'Egresos reservados',    higherIsBetter: false },
        { key: 'dineroLibre',        label: 'Dinero libre',          higherIsBetter: true  },
        { key: 'libreSoloPagado',    label: 'Libre solo pagado',     higherIsBetter: true  },
      ]
      const kpi_rows = KPI_ROWS_DEF.map(r => {
        const va = mA![r.key]
        const vb = mB![r.key]
        const d  = vb - va
        const delta_pct = va !== 0 ? (d / Math.abs(va)) * 100 : null
        return { label: r.label, va, vb, delta: d, delta_pct, higher_is_better: r.higherIsBetter }
      })
      const chart_svg = _extractChartSvg(chartRef.current)
      const safeLabel = (s: string) => s.replace(/[^\w\-]/g, '_')
      const res = await fetch(`${API_BASE}/v1/reports/pdf/comparacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({
          label_a: labelA, label_b: labelB, kpi_rows, chart_svg,
          categories: categoryComp.map(c => ({ name: c.name, total_a: c.totalA, total_b: c.totalB, delta: c.delta })),
        }),
      })
      if (!res.ok) throw new Error('Error generando PDF')
      const blob = await res.blob()
      const fname = `Comparacion_${safeLabel(labelA)}_vs_${safeLabel(labelB)}.pdf`
      setPdfBlobUrl(URL.createObjectURL(blob))
      setPdfFilename(fname)
      setPdfState('ready')
    } catch (err) { console.error(err); setPdfState('idle') }
  }

  function closePdfPreview() {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl)
    setPdfBlobUrl(null)
    setPdfState('idle')
  }

  const pA = periods.find(p => p.id === pidA)
  const pB = periods.find(p => p.id === pidB)
  const mA = dataA ? calcMetrics(dataA.expenses, dataA.incomes) : null
  const mB = dataB ? calcMetrics(dataB.expenses, dataB.incomes) : null

  // Categorías combinadas
  const categoryComp = useMemo(() => {
    if (!dataA || !dataB) return []
    const map = new Map<string, { sA: number; pA: number; sB: number; pB: number }>()
    const add = (expenses: Expense[], side: 'A' | 'B') => {
      for (const e of expenses) {
        const cur = map.get(e.category_name) ?? { sA: 0, pA: 0, sB: 0, pB: 0 }
        const amt = parseFloat(e.amount)
        if (side === 'A') { e.payment_status === 'saldado' ? (cur.sA += amt) : (cur.pA += amt) }
        else              { e.payment_status === 'saldado' ? (cur.sB += amt) : (cur.pB += amt) }
        map.set(e.category_name, cur)
      }
    }
    add(dataA.expenses, 'A')
    add(dataB.expenses, 'B')
    return Array.from(map.entries())
      .map(([name, v]) => ({
        name,
        sA: v.sA, pA: v.pA, totalA: v.sA + v.pA,
        sB: v.sB, pB: v.pB, totalB: v.sB + v.pB,
        delta: (v.sB + v.pB) - (v.sA + v.pA),
      }))
      .filter(c => c.totalA > 0 || c.totalB > 0)
      .sort((a, b) => Math.max(b.totalA, b.totalB) - Math.max(a.totalA, a.totalB))
  }, [dataA, dataB])

  const chartData = categoryComp.slice(0, 12).map(c => ({
    name: c.name, totalA: c.totalA, totalB: c.totalB,
  }))

  const labelA = pA ? `${MONTHS_SHORT[pA.month - 1]} ${pA.year}` : 'Período A'
  const labelB = pB ? `${MONTHS_SHORT[pB.month - 1]} ${pB.year}` : 'Período B'

  const gridStroke = isDark ? '#1e293b' : '#f1f5f9'
  const axisColor  = isDark ? '#64748b' : '#94a3b8'
  const card       = 'rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-soft'

  const selectCls = cn(
    'rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900',
    'px-3 py-2 text-sm text-gray-800 dark:text-slate-100',
    'outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100',
    'dark:focus:border-primary-500 dark:focus:ring-primary-900/30',
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Comparación de períodos</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400">Analiza variaciones entre dos períodos</p>
      </div>

      {/* Controles */}
      <div className={card}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[180px]">
            <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">Período A</p>
            <select value={pidA} onChange={e => setPidA(e.target.value)} className={cn(selectCls, 'w-full')}>
              {periods.map(p => <option key={p.id} value={p.id}>{periodLabel(p)}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">Período B</p>
            <select value={pidB} onChange={e => setPidB(e.target.value)} className={cn(selectCls, 'w-full')}>
              {periods.map(p => <option key={p.id} value={p.id}>{periodLabel(p)}</option>)}
            </select>
          </div>
          <button
            onClick={compare}
            disabled={loading || loadingPeriods || !pidA || !pidB || pidA === pidB}
            className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : null}
            Comparar
          </button>
        </div>
        {pidA === pidB && pidA && (
          <p className="mt-2 text-xs text-amber-500 dark:text-amber-400">Selecciona períodos diferentes para comparar.</p>
        )}
      </div>

      {/* Resultados */}
      {mA && mB && pA && pB && (
        <>
              {/* Botón exportar */}
          <div className="flex justify-end">
            <button
              onClick={exportPdf}
              disabled={pdfState !== 'idle'}
              className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pdfState === 'loading' ? <SpinIcon size={15} className="animate-spin" /> : <FileDown size={15} />}
              Exportar PDF
            </button>
          </div>

          {/* KPI table */}
          <div className={card}>
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Resumen comparativo</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800">
                    <th className="pb-2 text-left font-medium text-gray-500 dark:text-slate-400">Concepto</th>
                    <th className="pb-2 text-right font-medium text-blue-500">{labelA}</th>
                    <th className="pb-2 text-right font-medium text-orange-500">{labelB}</th>
                    <th className="pb-2 text-right font-medium text-gray-500 dark:text-slate-400">Diferencia</th>
                    <th className="pb-2 text-right font-medium text-gray-500 dark:text-slate-400">Δ %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                  {KPI_ROWS.map(row => {
                    const vA  = mA[row.key]
                    const vB  = mB[row.key]
                    const d   = delta(vA, vB)
                    const pct = vA !== 0 ? (d / Math.abs(vA)) * 100 : null
                    const good = row.higherIsBetter ? d >= 0 : d <= 0
                    return (
                      <tr key={row.key}>
                        <td className="py-2.5 font-medium text-gray-700 dark:text-slate-300">{row.label}</td>
                        <td className="py-2.5 text-right text-blue-600 dark:text-blue-400">{fmt(vA)}</td>
                        <td className="py-2.5 text-right text-orange-500 dark:text-orange-400">{fmt(vB)}</td>
                        <td className={cn('py-2.5 text-right font-semibold',
                          d === 0 ? 'text-gray-400 dark:text-slate-500'
                                  : good ? 'text-emerald-600 dark:text-emerald-400'
                                         : 'text-red-500 dark:text-red-400',
                        )}>
                          {fmtDelta(d, fmt)}
                        </td>
                        <td className={cn('py-2.5 text-right',
                          pct === null || pct === 0 ? 'text-gray-400 dark:text-slate-500'
                            : good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400',
                        )}>
                          {pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico + tabla categorías */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

            {/* Bar chart */}
            <div ref={chartRef} className={cn(card, 'flex flex-col')}>
              <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Egresos por categoría</h3>
              {chartData.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-gray-400 dark:text-slate-500">Sin egresos</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 44)}>
                    <BarChart layout="vertical" data={chartData} margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: axisColor }} tickFormatter={fmtShort} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ fill: isDark ? '#1e293b' : '#f8fafc' }} />
                      <Bar dataKey="totalA" name={labelA} fill="#3b82f6" radius={[0,2,2,0]} barSize={14} />
                      <Bar dataKey="totalB" name={labelB} fill="#f97316" radius={[0,2,2,0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-3 flex items-center gap-4">
                    <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> {labelA}</span>
                    <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> {labelB}</span>
                  </div>
                </>
              )}
            </div>

            {/* Tabla categorías */}
            <div className={cn(card, 'flex flex-col')}>
              <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Detalle por categoría</h3>
              <div className="flex-1 overflow-y-auto min-h-0">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white dark:bg-slate-900">
                    <tr className="border-b border-gray-100 dark:border-slate-800">
                      <th className="pb-2 text-left font-medium text-gray-500 dark:text-slate-400">Categoría</th>
                      <th className="pb-2 text-right font-medium text-blue-500">{labelA}</th>
                      <th className="pb-2 text-right font-medium text-orange-500">{labelB}</th>
                      <th className="pb-2 text-right font-medium text-gray-500 dark:text-slate-400">Δ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                    {categoryComp.map(c => (
                      <tr key={c.name}>
                        <td className="py-2 font-medium text-gray-700 dark:text-slate-300 truncate max-w-[100px]">{c.name}</td>
                        <td className="py-2 text-right text-blue-600 dark:text-blue-400">{c.totalA > 0 ? fmt(c.totalA) : '—'}</td>
                        <td className="py-2 text-right text-orange-500 dark:text-orange-400">{c.totalB > 0 ? fmt(c.totalB) : '—'}</td>
                        <td className={cn('py-2 text-right font-semibold',
                          c.delta === 0 ? 'text-gray-400 dark:text-slate-500'
                            : c.delta > 0 ? 'text-red-500 dark:text-red-400'
                                          : 'text-emerald-600 dark:text-emerald-400',
                        )}>
                          {c.delta === 0 ? '—' : `${c.delta > 0 ? '+' : ''}${fmt(c.delta)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal procesando */}
      {pdfState === 'loading' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-white dark:bg-slate-900 px-10 py-8 shadow-2xl">
            <SpinIcon size={36} className="animate-spin text-primary-500" />
            <p className="text-sm font-semibold text-gray-700 dark:text-slate-200">Generando PDF…</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">Esto puede tomar unos segundos</p>
          </div>
        </div>
      )}

      {/* Modal preview PDF */}
      {pdfState === 'ready' && pdfBlobUrl && (
        <PdfPreviewModal
          title={`Comparación — ${labelA} vs ${labelB}`}
          blobUrl={pdfBlobUrl}
          filename={pdfFilename}
          onClose={closePdfPreview}
        />
      )}
    </div>
  )
}
