import { useState, useEffect, useMemo, useRef } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { FileDown, Loader2 as SpinIcon } from 'lucide-react'
import { PdfPreviewModal } from '@/components/ui/PdfPreviewModal'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { userApi, authToken, type Period } from '@/lib/userApi'
import { MONTHS_SHORT, calcMetrics, fmtShort, type Metrics } from '@/lib/reportUtils'

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
      {payload.filter(e => e.value !== 0).map((e, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: e.color }} />
          <span className="text-gray-500 dark:text-slate-400">{e.name}:</span>
          <span className="font-medium text-gray-800 dark:text-slate-200">{fmt(e.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PeriodData = { period: Period; metrics: Metrics; label: string }

const KPI_SUMMARY: { key: keyof Metrics; label: string; color: string }[] = [
  { key: 'totalIngresos',     label: 'Total ingresos',     color: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'egresosSaldados',   label: 'Egresos saldados',   color: 'text-orange-500 dark:text-orange-400'   },
  { key: 'egresosPendientes', label: 'Egresos pendientes', color: 'text-violet-600 dark:text-violet-400'   },
  { key: 'dineroLibre',       label: 'Dinero libre (prom)', color: 'text-blue-500 dark:text-blue-400'      },
]

export function ReporteTendenciaPage() {
  const { user }  = useAuth()
  const { isDark } = useTheme()

  const [allPeriods,    setAllPeriods]    = useState<Period[]>([])
  const [mode,          setMode]          = useState<'year' | 'last12'>('year')
  const [selectedYear,  setSelectedYear]  = useState(new Date().getFullYear())
  const [periodData,    setPeriodData]    = useState<PeriodData[]>([])
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
          const [expenses, incomes] = await Promise.all([
            userApi.expenses.list(p.year, p.month),
            userApi.incomes.list(p.year, p.month),
          ])
          return {
            period: p,
            metrics: calcMetrics(expenses, incomes),
            label: `${MONTHS_SHORT[p.month - 1]} ${p.year}`,
          }
        }),
      )
      setPeriodData(results)
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
    if (!periodData.length || !totals) return
    setPdfState('loading')
    try {
      const modeLabel = mode === 'year' ? `Año ${selectedYear}` : 'Últimos 12 períodos'
      const chart_svg = _extractChartSvg(chartRef.current)
      const fname = mode === 'year' ? `Trend_${selectedYear}.pdf` : 'Trend_Last12.pdf'
      const res = await fetch(`${API_BASE}/v1/reports/pdf/tendencia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
        body: JSON.stringify({
          mode_label: modeLabel,
          chart_svg,
          periods: periodData.map(d => ({
            label: d.label,
            status: d.period.status,
            totalIngresos:      d.metrics.totalIngresos,
            egresosSaldados:    d.metrics.egresosSaldados,
            egresosPendientes:  d.metrics.egresosPendientes,
            egresosReservados:  d.metrics.egresosReservados,
            dineroLibre:        d.metrics.dineroLibre,
            libreSoloPagado:    d.metrics.libreSoloPagado,
          })),
          totals,
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

  // Acumulados
  const totals = useMemo(() => {
    if (!periodData.length) return null
    return {
      totalIngresos:     periodData.reduce((s, d) => s + d.metrics.totalIngresos, 0),
      egresosSaldados:   periodData.reduce((s, d) => s + d.metrics.egresosSaldados, 0),
      egresosPendientes: periodData.reduce((s, d) => s + d.metrics.egresosPendientes, 0),
      egresosReservados: periodData.reduce((s, d) => s + d.metrics.egresosReservados, 0),
      dineroLibre:       periodData.reduce((s, d) => s + d.metrics.dineroLibre, 0) / periodData.length,
      libreSoloPagado:   periodData.reduce((s, d) => s + d.metrics.libreSoloPagado, 0) / periodData.length,
    }
  }, [periodData])

  // Datos para el gráfico
  const chartData = periodData.map(d => ({
    label:       d.label,
    ingresos:    d.metrics.totalIngresos,
    saldados:    d.metrics.egresosSaldados,
    pendientes:  d.metrics.egresosPendientes,
    dineroLibre: d.metrics.dineroLibre,
  }))

  const gridStroke = isDark ? '#1e293b' : '#f1f5f9'
  const axisColor  = isDark ? '#64748b' : '#94a3b8'
  const card       = 'rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-soft'

  const radioBase  = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors'
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
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Tendencia anual</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400">Evolución de ingresos y egresos mes a mes</p>
      </div>

      {/* Controles */}
      <div className={card}>
        <div className="flex flex-wrap items-end gap-4">
          {/* Radio modo */}
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500 dark:text-slate-400">Rango</p>
            <div className="flex items-center gap-1 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1">
              <button type="button" onClick={() => setMode('year')}   className={cn(radioBase, mode === 'year'   ? radioActive : radioIdle)}>Por año</button>
              <button type="button" onClick={() => setMode('last12')} className={cn(radioBase, mode === 'last12' ? radioActive : radioIdle)}>Últimos 12</button>
            </div>
          </div>

          {/* Año */}
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
      {generated && totals && periodData.length > 0 && (
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

          {/* KPI summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {KPI_SUMMARY.map(k => (
              <div key={k.key} className={cn(card, 'py-4')}>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">{k.label}</p>
                <p className={cn('mt-1 text-lg font-semibold truncate', k.color)}>
                  {fmt(totals[k.key as keyof typeof totals])}
                </p>
                {k.key === 'dineroLibre' && (
                  <p className="mt-0.5 text-[10px] text-gray-400 dark:text-slate-500">promedio mensual</p>
                )}
              </div>
            ))}
          </div>

          {/* Gráfico */}
          <div ref={chartRef} className={card}>
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Evolución mensual</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="tGradIngresos"    x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.2} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  <linearGradient id="tGradSaldados"    x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.2} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient>
                  <linearGradient id="tGradDineroLibre" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: axisColor }} tickFormatter={fmtShort} axisLine={false} tickLine={false} width={48} />
                <Tooltip content={<ChartTooltip fmt={fmt} />} cursor={{ stroke: isDark ? '#334155' : '#e2e8f0' }} />
                <Area type="monotone" dataKey="ingresos"    name="Ingresos"          stroke="#10b981" strokeWidth={2} fill="url(#tGradIngresos)"    dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
                <Area type="monotone" dataKey="saldados"    name="Egresos saldados"  stroke="#f97316" strokeWidth={2} fill="url(#tGradSaldados)"    dot={{ r: 3, fill: '#f97316' }} activeDot={{ r: 5 }} />
                <Area type="monotone" dataKey="dineroLibre" name="Dinero libre"      stroke="#3b82f6" strokeWidth={2} fill="url(#tGradDineroLibre)" dot={{ r: 3, fill: '#3b82f6' }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-3 flex flex-wrap items-center gap-5">
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Ingresos</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> Egresos saldados</span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> Dinero libre</span>
            </div>
          </div>

          {/* Tabla mes a mes */}
          <div className={card}>
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-slate-100">Detalle por período</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-800">
                    <th className="pb-2 text-left font-medium text-gray-500 dark:text-slate-400">Período</th>
                    <th className="pb-2 text-right font-medium text-emerald-500">Ingresos</th>
                    <th className="pb-2 text-right font-medium text-orange-500">Saldados</th>
                    <th className="pb-2 text-right font-medium text-violet-500">Pendientes</th>
                    <th className="pb-2 text-right font-medium text-gray-500 dark:text-slate-400">Reservados</th>
                    <th className="pb-2 text-right font-medium text-blue-500">Dinero libre</th>
                    <th className="pb-2 text-right font-medium text-gray-500 dark:text-slate-400">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/50">
                  {periodData.map(d => (
                    <tr key={d.period.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 font-medium text-gray-700 dark:text-slate-300">{d.label}</td>
                      <td className="py-2.5 text-right text-emerald-600 dark:text-emerald-400">{fmt(d.metrics.totalIngresos)}</td>
                      <td className="py-2.5 text-right text-orange-500 dark:text-orange-400">{fmt(d.metrics.egresosSaldados)}</td>
                      <td className="py-2.5 text-right text-violet-600 dark:text-violet-400">{fmt(d.metrics.egresosPendientes)}</td>
                      <td className="py-2.5 text-right text-gray-700 dark:text-slate-300">{fmt(d.metrics.egresosReservados)}</td>
                      <td className={cn('py-2.5 text-right font-semibold',
                        d.metrics.dineroLibre >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500 dark:text-red-400',
                      )}>
                        {fmt(d.metrics.dineroLibre)}
                      </td>
                      <td className="py-2.5 text-right">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          d.period.status === 'abierto'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400',
                        )}>
                          {d.period.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 dark:border-slate-700">
                    <td className="pt-2 font-semibold text-gray-600 dark:text-slate-400">Total acum.</td>
                    <td className="pt-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{fmt(totals.totalIngresos)}</td>
                    <td className="pt-2 text-right font-semibold text-orange-500 dark:text-orange-400">{fmt(totals.egresosSaldados)}</td>
                    <td className="pt-2 text-right font-semibold text-violet-600 dark:text-violet-400">{fmt(totals.egresosPendientes)}</td>
                    <td className="pt-2 text-right font-semibold text-gray-700 dark:text-slate-300">{fmt(totals.egresosReservados)}</td>
                    <td className={cn('pt-2 text-right font-semibold text-[10px] text-gray-400 dark:text-slate-500')}>prom. {fmt(totals.dineroLibre)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {generated && periodData.length === 0 && !loading && (
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
          title={`Tendencia — ${mode === 'year' ? `Año ${selectedYear}` : 'Últimos 12 períodos'}`}
          blobUrl={pdfBlobUrl}
          filename={pdfFilename}
          onClose={closePdfPreview}
        />
      )}
    </div>
  )
}
