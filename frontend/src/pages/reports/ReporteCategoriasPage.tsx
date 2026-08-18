import { useState, useEffect, useMemo, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { FileDown, Loader2 as SpinIcon } from 'lucide-react'
import { PdfPreviewModal } from '@/components/ui/PdfPreviewModal'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { userApi, authToken, type Period, type Expense } from '@/lib/userApi'
import { MONTHS_SHORT, fmtShort, CAT_COLORS, confirmedOnly } from '@/lib/reportUtils'

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
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-lg max-w-xs">
      {label && <p className="mb-1.5 text-xs font-semibold text-gray-700 dark:text-slate-300">{label}</p>}
      {payload.filter(e => e.value !== 0).map((e, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: e.color }} />
          <span className="text-gray-500 dark:text-slate-400 truncate max-w-[120px]">{e.name}:</span>
          <span className="font-medium text-gray-800 dark:text-slate-200 shrink-0">{fmt(e.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PeriodExpenses = { period: Period; expenses: Expense[]; label: string }

export function ReporteCategoriasPage() {
  const { user }   = useAuth()
  const { isDark } = useTheme()

  const [allPeriods,    setAllPeriods]    = useState<Period[]>([])
  const [mode,          setMode]          = useState<'year' | 'last12'>('year')
  const [selectedYear,  setSelectedYear]  = useState(new Date().getFullYear())
  const [periodExp,     setPeriodExp]     = useState<PeriodExpenses[]>([])
  const [allCats,       setAllCats]       = useState<string[]>([])
  const [selectedCats,  setSelectedCats]  = useState<string[]>([])
  const [loading,        setLoading]        = useState(false)
  const [pdfState,       setPdfState]       = useState<'idle' | 'loading' | 'ready'>('idle')
  const [pdfBlobUrl,     setPdfBlobUrl]     = useState<string | null>(null)
  const [pdfFilename,    setPdfFilename]    = useState('')
  const [loadingPeriods, setLoadingPeriods] = useState(true)
  const [generated,      setGenerated]      = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    userApi.periods.list()
      .then(ps => {
        setAllPeriods(ps)
        const years = [...new Set(ps.map(p => p.year))].sort((a, b) => b - a)
        if (years.length > 0) setSelectedYear(years[0])
      })
      .finally(() => setLoadingPeriods(false))
  }, [])

  const availableYears = useMemo(
    () => [...new Set(allPeriods.map(p => p.year))].sort((a, b) => b - a),
    [allPeriods],
  )

  const fmt = useMemo(() => {
    const nf = new Intl.NumberFormat(undefined, { style: 'currency', currency: user?.currency ?? 'CLP', maximumFractionDigits: 0 })
    return (n: number) => nf.format(n)
  }, [user?.currency])

  async function generate() {
    let toLoad: Period[]
    if (mode === 'year') {
      toLoad = allPeriods.filter(p => p.year === selectedYear).sort((a, b) => a.month - b.month)
    } else {
      toLoad = [...allPeriods]
        .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
        .slice(0, 12)
        .reverse()
    }
    if (toLoad.length === 0) return

    setLoading(true)
    setGenerated(false)
    try {
      const results = await Promise.all(
        toLoad.map(async p => {
          const expenses = confirmedOnly(await userApi.expenses.list(p.year, p.month))
          return { period: p, expenses, label: `${MONTHS_SHORT[p.month - 1]} ${p.year}` }
        }),
      )
      setPeriodExp(results)

      // Descubrir categorías y auto-seleccionar top 6 por total acumulado
      const catTotals = new Map<string, number>()
      for (const r of results) {
        for (const e of r.expenses) {
          catTotals.set(e.category_name, (catTotals.get(e.category_name) ?? 0) + parseFloat(e.amount))
        }
      }
      const sorted = [...catTotals.entries()].sort((a, b) => b[1] - a[1])
      const cats   = sorted.map(([c]) => c)
      setAllCats(cats)
      setSelectedCats(cats.slice(0, 6))
      setGenerated(true)
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
    if (!periodExp.length) return
    setPdfState('loading')
    try {
      const modeLabel = mode === 'year' ? `Año ${selectedYear}` : 'Últimos 12 períodos'
      const period_labels = periodExp.map(r => r.label)
      const period_totals = periodExp.map(r =>
        r.expenses.reduce((s, e) => s + parseFloat(e.amount), 0),
      )
      const grand_total = tableData.reduce((s, r) => s + (r.__total as number), 0)
      const chart_svg = _extractChartSvg(chartRef.current)
      const fname = mode === 'year' ? `Categories_${selectedYear}.pdf` : 'Categories_Last12.pdf'
      const res = await fetch(`${API_BASE}/v1/reports/pdf/categorias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({
          mode_label: modeLabel,
          period_labels,
          chart_svg,
          table: tableData.map(r => ({
            name: r.name as string,
            values: period_labels.map(lbl => (r[lbl] as number) ?? 0),
            total: r.__total as number,
          })),
          period_totals,
          grand_total,
          chart_cats: selectedCats,
        }),
      })
      if (!res.ok) throw new Error('Error generando PDF')
      const blob = await res.blob()
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

  function toggleCat(cat: string) {
    setSelectedCats(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat],
    )
  }

  // Datos para el gráfico — un punto por período, una key por categoría
  const chartData = useMemo(() => {
    return periodExp.map(r => {
      const row: Record<string, number | string> = { label: r.label }
      for (const cat of selectedCats) {
        row[cat] = r.expenses
          .filter(e => e.category_name === cat)
          .reduce((s, e) => s + parseFloat(e.amount), 0)
      }
      return row
    })
  }, [periodExp, selectedCats])

  // Datos para la tabla — categorías × períodos
  const tableData = useMemo(() => {
    return allCats.map(cat => {
      const row: Record<string, number | string> = { name: cat }
      let total = 0
      for (const r of periodExp) {
        const val = r.expenses.filter(e => e.category_name === cat).reduce((s, e) => s + parseFloat(e.amount), 0)
        row[r.label] = val
        total += val
      }
      row.__total = total
      return row
    }).sort((a, b) => (b.__total as number) - (a.__total as number))
  }, [allCats, periodExp])

  const gridStroke = isDark ? '#1e293b' : '#f1f5f9'
  const axisColor  = isDark ? '#64748b' : '#94a3b8'
  const card       = 'rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-soft'

  const radioBase   = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors'
  const radioActive = 'bg-primary-500 text-white'
  const radioIdle   = 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'

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
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Evolución por categoría</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400">Seguimiento del gasto por tipología a lo largo del tiempo</p>
      </div>

      {/* Controles */}
      <div className={card}>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">Rango</p>
            <div className="flex items-center gap-1 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
              <button type="button" onClick={() => setMode('year')}   className={cn(radioBase, mode === 'year'   ? radioActive : radioIdle)}>Por año</button>
              <button type="button" onClick={() => setMode('last12')} className={cn(radioBase, mode === 'last12' ? radioActive : radioIdle)}>Últimos 12</button>
            </div>
          </div>

          {mode === 'year' && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">Año</p>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className={selectCls}>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          <button
            onClick={generate}
            disabled={loading || loadingPeriods || availableYears.length === 0}
            className="flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed self-end"
          >
            {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Generar
          </button>
        </div>
      </div>

      {/* Resultados */}
      {generated && periodExp.length > 0 && (
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

          {/* Selector de categorías */}
          <div className={card}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Categorías a mostrar</h3>
              <div className="flex gap-2">
                <button onClick={() => setSelectedCats([...allCats])} className="text-xs text-primary-500 hover:text-primary-600">Todas</button>
                <span className="text-xs text-gray-300 dark:text-slate-600">·</span>
                <button onClick={() => setSelectedCats([])} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">Ninguna</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {allCats.map((cat, i) => {
                const checked = selectedCats.includes(cat)
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCat(cat)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors',
                      checked
                        ? 'border-transparent text-white'
                        : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-500 dark:text-slate-400 hover:border-gray-300',
                    )}
                    style={checked ? { background: CAT_COLORS[i % CAT_COLORS.length], borderColor: CAT_COLORS[i % CAT_COLORS.length] } : {}}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
                    />
                    {cat}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Gráfico de líneas */}
          {selectedCats.length > 0 && (
            <div ref={chartRef} className={card}>
              <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Evolución mensual por categoría</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: axisColor }} tickFormatter={fmtShort} axisLine={false} tickLine={false} width={48} />
                  <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ stroke: isDark ? '#334155' : '#e2e8f0' }} />
                  {selectedCats.map((cat) => (
                    <Line
                      key={cat}
                      type="monotone"
                      dataKey={cat}
                      name={cat}
                      stroke={CAT_COLORS[allCats.indexOf(cat) % CAT_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {selectedCats.length === 0 && (
            <div className="flex h-32 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 shadow-soft text-sm text-gray-400 dark:text-slate-500">
              Selecciona al menos una categoría para ver el gráfico
            </div>
          )}

          {/* Tabla categorías × períodos */}
          <div className={card}>
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Tabla de egresos por categoría y período</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800">
                    <th className="pb-2 text-left font-medium text-gray-500 dark:text-slate-400 min-w-[120px]">Categoría</th>
                    {periodExp.map(r => (
                      <th key={r.label} className="pb-2 text-right font-medium text-gray-500 dark:text-slate-400 whitespace-nowrap">{r.label}</th>
                    ))}
                    <th className="pb-2 text-right font-semibold text-gray-700 dark:text-slate-300">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                  {tableData.map(row => (
                    <tr key={row.name as string} className="hover:bg-gray-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 font-medium text-gray-700 dark:text-slate-300">{row.name as string}</td>
                      {periodExp.map(r => {
                        const val = row[r.label] as number
                        return (
                          <td key={r.label} className="py-2 text-right text-gray-600 dark:text-slate-400">
                            {val > 0 ? fmt(val) : <span className="text-gray-200 dark:text-slate-700">—</span>}
                          </td>
                        )
                      })}
                      <td className="py-2 text-right font-semibold text-gray-800 dark:text-slate-200">{fmt(row.__total as number)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 dark:border-slate-700">
                    <td className="pt-2 font-semibold text-gray-600 dark:text-slate-400">Total período</td>
                    {periodExp.map(r => {
                      const tot = r.expenses.reduce((s, e) => s + parseFloat(e.amount), 0)
                      return (
                        <td key={r.label} className="pt-2 text-right font-semibold text-gray-800 dark:text-slate-200">{fmt(tot)}</td>
                      )
                    })}
                    <td className="pt-2 text-right font-semibold text-gray-800 dark:text-slate-200">
                      {fmt(tableData.reduce((s, r) => s + (r.__total as number), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {generated && periodExp.length === 0 && !loading && (
        <div className="flex h-40 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 shadow-soft text-sm text-gray-400 dark:text-slate-500">
          Sin períodos para el rango seleccionado
        </div>
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
          title={`Evolución por categoría — ${mode === 'year' ? `Año ${selectedYear}` : 'Últimos 12 períodos'}`}
          blobUrl={pdfBlobUrl}
          filename={pdfFilename}
          onClose={closePdfPreview}
        />
      )}
    </div>
  )
}
