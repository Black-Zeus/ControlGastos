import { useState, useEffect, useCallback, useRef } from 'react'
import {
  CalendarRange, Lock, Unlock, Plus, RefreshCw,
  TrendingUp, TrendingDown, Scale, ChevronDown, ChevronUp,
  CheckCircle, AlertCircle, Copy, Download, Loader2,
  Eye, RotateCcw, X, FileText, Trash2,
} from 'lucide-react'
import { userApi, Period, PeriodOpenOut } from '@/lib/userApi'
import { cn } from '@/lib/utils'
import { confirmedOnly } from '@/lib/reportUtils'

interface LiveSummary {
  totalIngresos: number
  totalEgresos: number
  balance: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function fmtPeriod(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

function fmtMoney(val: string | number | null) {
  if (val === null) return '—'
  const n = typeof val === 'string' ? parseFloat(val) : val
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color: 'blue' | 'green' | 'red' | 'gray'
}) {
  const colors = {
    blue:  { bg: 'bg-blue-50 dark:bg-blue-900/20',   icon: 'text-blue-500',  value: 'text-blue-700 dark:text-blue-400' },
    green: { bg: 'bg-green-50 dark:bg-green-900/20', icon: 'text-green-500', value: 'text-green-700 dark:text-green-400' },
    red:   { bg: 'bg-red-50 dark:bg-red-900/20',     icon: 'text-red-500',   value: 'text-red-700 dark:text-red-400' },
    gray:  { bg: 'bg-gray-50 dark:bg-slate-800',     icon: 'text-gray-400',  value: 'text-gray-700 dark:text-slate-200' },
  }
  const c = colors[color]
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', c.bg)}>
        <Icon size={20} className={c.icon} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 dark:text-slate-400 truncate">{label}</p>
        <p className={cn('text-xl font-bold tabular-nums', c.value)}>{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{sub}</p>}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: 'abierto' | 'cerrado' }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
      status === 'abierto'
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400',
    )}>
      {status === 'abierto' ? <Unlock size={11} /> : <Lock size={11} />}
      {status === 'abierto' ? 'Abierto' : 'Cerrado'}
    </span>
  )
}

// ─── Modal: Preview PDF ───────────────────────────────────────────────────────

function PdfPreviewModal({
  period,
  onClose,
}: {
  period: Period
  onClose: () => void
}) {
  const [url, setUrl]         = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    userApi.periods.fetchReportBlob(period.id)
      .then(blob => {
        if (cancelled) return
        const objectUrl = URL.createObjectURL(blob)
        urlRef.current = objectUrl
        setUrl(objectUrl)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) { setError(true); setLoading(false) }
      })
    return () => {
      cancelled = true
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [period.id])

  function handleDownload() {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte_${period.year}_${String(period.month).padStart(2, '0')}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-[10vh_10vw]">
      <div
        className="flex flex-col rounded-2xl overflow-hidden shadow-2xl bg-white dark:bg-slate-900"
        style={{ width: '80vw', height: '80vh' }}
      >
        {/* Barra superior */}
        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-slate-800 px-4 py-3 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <FileText size={15} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900 dark:text-slate-100 truncate">
              Reporte — {fmtPeriod(period.year, period.month)}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-slate-400">
              Cerrado el {fmtDate(period.closed_at)}
            </p>
          </div>
          <button
            onClick={handleDownload}
            disabled={!url}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            <Download size={13} />
            Descargar
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={13} />
            Cerrar
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-slate-800">
          {loading && (
            <div className="flex h-full items-center justify-center gap-3 text-gray-500 dark:text-slate-400">
              <Loader2 size={22} className="animate-spin text-primary-500" />
              <span className="text-sm">Cargando reporte…</span>
            </div>
          )}
          {error && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <AlertCircle size={28} className="text-red-400" />
              <p className="text-sm text-red-600 dark:text-red-400">No se pudo cargar el reporte</p>
            </div>
          )}
          {url && (
            <iframe
              src={url}
              className="w-full h-full border-none"
              title={`Reporte ${fmtPeriod(period.year, period.month)}`}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Abrir período ─────────────────────────────────────────────────────

function OpenPeriodModal({
  onClose, onSuccess, nextPeriod,
}: {
  onClose: () => void
  onSuccess: (p: PeriodOpenOut) => void
  nextPeriod: { year: number; month: number } | null
}) {
  const now = new Date()
  const [year, setYear]     = useState(nextPeriod?.year ?? now.getFullYear())
  const [month, setMonth]   = useState(nextPeriod?.month ?? now.getMonth() + 1)
  const [error, setError]   = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const p = await userApi.periods.open({ year, month })
      onSuccess(p as PeriodOpenOut)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al abrir el período')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/30">
            <Unlock size={18} className="text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Abrir período</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              {nextPeriod ? 'El siguiente período disponible es:' : 'Selecciona el mes y año a gestionar'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {nextPeriod ? (
            /* Período fijo: solo mostrar, no editable */
            <div className="flex items-center justify-center gap-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-4">
              <CalendarRange size={18} className="text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-base font-semibold text-green-800 dark:text-green-300">
                {fmtPeriod(nextPeriod.year, nextPeriod.month)}
              </span>
            </div>
          ) : (
            /* Primer período: dropdowns libres */
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Mes</label>
                <select
                  value={month}
                  onChange={e => setMonth(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Año</label>
                <select
                  value={year}
                  onChange={e => setYear(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Abriendo…' : 'Abrir período'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Cerrar período ────────────────────────────────────────────────────

function ClosePeriodModal({
  period, pendingExpCount, pendingIncCount, onClose, onSuccess,
}: {
  period: Period
  pendingExpCount: number
  pendingIncCount: number
  onClose: () => void
  onSuccess: (p: Period) => void
}) {
  const [notes, setNotes]   = useState('')
  const [error, setError]   = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const hasPending = pendingExpCount > 0 || pendingIncCount > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const p = await userApi.periods.close(period.id, {
        notes: notes || null,
        handle_pending: 'carry',
      })
      onSuccess(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cerrar el período')
      setSaving(false)
    }
  }

  const pendingParts: string[] = []
  if (pendingExpCount > 0) pendingParts.push(`${pendingExpCount} egreso${pendingExpCount !== 1 ? 's' : ''}`)
  if (pendingIncCount > 0) pendingParts.push(`${pendingIncCount} ingreso${pendingIncCount !== 1 ? 's' : ''}`)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-xl p-6 overflow-hidden">

        {/* Overlay de procesamiento */}
        {saving && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-2xl bg-white/97 dark:bg-slate-900/97">
            <Loader2 size={34} className="animate-spin text-primary-500" />
            <div className="text-center">
              <p className="font-semibold text-gray-900 dark:text-slate-100">Procesando cierre…</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                Generando reporte PDF, por favor espera
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
            <Lock size={18} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Cerrar período</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">{fmtPeriod(period.year, period.month)}</p>
          </div>
        </div>

        {/* Aviso de pendientes */}
        {hasPending && (
          <div className="mb-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-3">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">
              Tienes {pendingParts.join(' y ')} pendiente{pendingParts.length > 1 || (pendingExpCount + pendingIncCount) > 1 ? 's' : ''} de pago.
            </p>
            <p className="mt-1.5 text-[11px] text-orange-600 dark:text-orange-500 leading-relaxed">
              Existen ingresos o egresos pendientes en este período. Al confirmar el cierre, estos movimientos serán trasladados automáticamente al próximo período que abras. Si prefieres regularizarlos antes, cancela el cierre y actualiza su estado.
            </p>
          </div>
        )}

        {!hasPending && (
          <div className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-400">
            Se calculará el resumen final y se generará el reporte PDF.
            Podrás verlo inmediatamente al finalizar.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
              Notas de cierre <span className="text-gray-400">(opcional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Observaciones del período…"
              className="w-full resize-none rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-slate-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              Cerrar período
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal: Confirmar reapertura ──────────────────────────────────────────────

function ConfirmReopenModal({
  period, onClose, onConfirm,
}: {
  period: Period
  onClose: () => void
  onConfirm: () => void
}) {
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    await onConfirm()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/30">
            <RotateCcw size={18} className="text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Reabrir período</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">{fmtPeriod(period.year, period.month)}</p>
          </div>
        </div>

        <div className="rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-3 text-xs text-orange-700 dark:text-orange-400 mb-5">
          Se eliminará el reporte PDF generado y se restablecerán los totales.
          Podrás volver a cerrar el período una vez realizados los ajustes.
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Reabrir período'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: Eliminar período ──────────────────────────────────────────────────

function DeletePeriodModal({
  period, onClose, onDeleted,
}: {
  period: Period
  onClose: () => void
  onDeleted: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await userApi.periods.delete(period.id)
      onDeleted(period.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el período')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30">
            <Trash2 size={18} className="text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Eliminar período</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">{fmtPeriod(period.year, period.month)}</p>
          </div>
        </div>

        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-400 mb-5">
          <p className="font-medium mb-1">Esta acción no se puede deshacer.</p>
          <p>Se eliminará el registro del período. Los movimientos asociados quedarán sin período asignado.</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400 mb-4">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} disabled={deleting}
            className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
            Cancelar
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
            {deleting ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Eliminar período'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tarjeta de período ──────────────────────────────────────────────────────

function PeriodCard({
  period, onClose, onPreview, onReopen, onDelete, isLastPeriod, live,
}: {
  period: Period
  onClose: (p: Period) => void
  onPreview: (p: Period) => void
  onReopen: (p: Period) => void
  onDelete: (p: Period) => void
  isLastPeriod: boolean
  live?: LiveSummary
}) {
  const [expanded, setExpanded] = useState(period.status === 'abierto')
  const isOpen = period.status === 'abierto'

  const balance        = live ? live.balance        : (period.balance        !== null ? parseFloat(period.balance)        : null)
  const totalIngresos  = live ? live.totalIngresos  : (period.total_incomes  !== null ? parseFloat(period.total_incomes)  : null)
  const totalEgresos   = live ? live.totalEgresos   : (period.total_expenses !== null ? parseFloat(period.total_expenses) : null)

  return (
    <div className={cn(
      'rounded-2xl border bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all',
      isOpen
        ? 'border-green-200 dark:border-green-800 ring-1 ring-green-200 dark:ring-green-800'
        : 'border-gray-100 dark:border-slate-800',
    )}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            isOpen ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-slate-800',
          )}>
            <CalendarRange size={16} className={isOpen ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-slate-100 text-sm">{fmtPeriod(period.year, period.month)}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">Abierto el {fmtDate(period.opened_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={period.status} />
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-100 dark:border-slate-800">
          <div className="grid grid-cols-3 gap-3 mt-4 mb-4">
            <div className="rounded-xl bg-green-50 dark:bg-green-900/10 p-3 text-center">
              <TrendingUp size={14} className="mx-auto mb-1 text-green-500" />
              <p className="text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">Ingresos</p>
              <p className="text-sm font-bold text-green-700 dark:text-green-400 tabular-nums">
                {totalIngresos !== null ? fmtMoney(totalIngresos) : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-red-50 dark:bg-red-900/10 p-3 text-center">
              <TrendingDown size={14} className="mx-auto mb-1 text-red-500" />
              <p className="text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">Egresos</p>
              <p className="text-sm font-bold text-red-700 dark:text-red-400 tabular-nums">
                {totalEgresos !== null ? fmtMoney(totalEgresos) : '—'}
              </p>
            </div>
            <div className={cn(
              'rounded-xl p-3 text-center',
              balance === null ? 'bg-gray-50 dark:bg-slate-800' :
              balance >= 0 ? 'bg-blue-50 dark:bg-blue-900/10' : 'bg-orange-50 dark:bg-orange-900/10',
            )}>
              <Scale size={14} className={cn(
                'mx-auto mb-1',
                balance === null ? 'text-gray-400' :
                balance >= 0 ? 'text-blue-500' : 'text-orange-500',
              )} />
              <p className="text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">Balance</p>
              <p className={cn(
                'text-sm font-bold tabular-nums',
                balance === null ? 'text-gray-400' :
                balance >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-orange-700 dark:text-orange-400',
              )}>
                {fmtMoney(period.balance)}
              </p>
            </div>
          </div>

          {period.notes && (
            <p className="mb-3 rounded-lg bg-gray-50 dark:bg-slate-800 px-3 py-2 text-xs text-gray-600 dark:text-slate-400 italic">
              "{period.notes}"
            </p>
          )}

          {period.closed_at && (
            <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">
              Cerrado el {fmtDate(period.closed_at)}
            </p>
          )}

          <div className="flex gap-2">
            {isOpen && (
              <button
                onClick={() => onClose(period)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 text-sm font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
              >
                <Lock size={15} />
                Cerrar período
              </button>
            )}

            {!isOpen && period.report_key && (
              <button
                onClick={() => onPreview(period)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                <Eye size={15} />
                Ver reporte
              </button>
            )}

            {!isOpen && (
              <button
                onClick={() => onReopen(period)}
                className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                title="Reabrir período"
              >
                <RotateCcw size={15} />
                Reabrir
              </button>
            )}

            {isLastPeriod && (
              <button
                onClick={() => onDelete(period)}
                className="flex items-center justify-center gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                title="Eliminar período"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function PeriodsPage() {
  const [periods, setPeriods]             = useState<Period[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [showOpenModal, setShowOpenModal]  = useState(false)
  const [closingPeriod, setClosingPeriod] = useState<Period | null>(null)
  const [previewPeriod, setPreviewPeriod] = useState<Period | null>(null)
  const [reopenPeriod, setReopenPeriod]   = useState<Period | null>(null)
  const [carryToast, setCarryToast]       = useState<number | null>(null)
  const [liveSummary, setLiveSummary]     = useState<LiveSummary | null>(null)
  const [pendingExpCount, setPendingExpCount] = useState(0)
  const [pendingIncCount, setPendingIncCount] = useState(0)
  const [deletingPeriod, setDeletingPeriod] = useState<Period | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await userApi.periods.list()
      setPeriods(data)
      const openP = data.find(p => p.status === 'abierto')
      if (openP) {
        const [expensesRaw, incomes] = await Promise.all([
          userApi.expenses.list(openP.year, openP.month),
          userApi.incomes.list(openP.year, openP.month),
        ])
        // Borradores de ingesta (bot/OCR) sin confirmar no cuentan como egreso real.
        const expenses = confirmedOnly(expensesRaw)
        const totalIngresos = incomes.reduce((s, i) => s + parseFloat(i.amount), 0)
        const totalEgresos  = expenses.reduce((s, e) => s + parseFloat(e.amount), 0)
        setLiveSummary({ totalIngresos, totalEgresos, balance: totalIngresos - totalEgresos })
        setPendingExpCount(expenses.filter(e => e.payment_status === 'pendiente').length)
        setPendingIncCount(incomes.filter(i => i.payment_status === 'pendiente').length)
      } else {
        setLiveSummary(null)
        setPendingExpCount(0)
        setPendingIncCount(0)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar períodos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openPeriod    = periods.find(p => p.status === 'abierto')
  const closedPeriods = periods.filter(p => p.status === 'cerrado')
  const totalBalance  = closedPeriods.reduce((acc, p) => acc + (p.balance ? parseFloat(p.balance) : 0), 0)

  const nextPeriod = periods.length > 0 ? (() => {
    const last = periods[0]
    return last.month === 12
      ? { year: last.year + 1, month: 1 }
      : { year: last.year, month: last.month + 1 }
  })() : null

  const handleOpened = (p: PeriodOpenOut) => {
    setPeriods(prev => [p, ...prev])
    setShowOpenModal(false)
    if (p.carry_forward_count > 0) {
      setCarryToast(p.carry_forward_count)
      setTimeout(() => setCarryToast(null), 5000)
    }
  }

  const handleClosed = (p: Period) => {
    setPeriods(prev => prev.map(x => x.id === p.id ? p : x))
    setClosingPeriod(null)
    // Abrir preview automáticamente si se generó el PDF
    if (p.report_key) {
      setPreviewPeriod(p)
    }
  }

  const handleReopen = async () => {
    if (!reopenPeriod) return
    try {
      const updated = await userApi.periods.reopen(reopenPeriod.id)
      setPeriods(prev => prev.map(x => x.id === updated.id ? updated : x))
      setReopenPeriod(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al reabrir el período')
      setReopenPeriod(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Períodos</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
            Gestión de corte y apertura de períodos contables
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            title="Actualizar"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowOpenModal(true)}
            disabled={!!openPeriod}
            className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={openPeriod ? 'Cierra el período actual antes de abrir uno nuevo' : undefined}
          >
            <Plus size={15} />
            Abrir período
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard icon={CalendarRange} label="Total períodos"    value={String(periods.length)}                              color="blue" />
        <KpiCard icon={openPeriod ? Unlock : Lock} label="Período activo"
          value={openPeriod ? fmtPeriod(openPeriod.year, openPeriod.month) : 'Ninguno'}
          sub={openPeriod ? 'Abierto' : 'Sin período abierto'}
          color={openPeriod ? 'green' : 'gray'} />
        <KpiCard icon={Lock}  label="Períodos cerrados"  value={String(closedPeriods.length)}                              color="gray" />
        <KpiCard icon={Scale} label="Balance histórico"
          value={closedPeriods.length > 0 ? fmtMoney(totalBalance) : '—'}
          color={totalBalance >= 0 ? 'green' : 'red'} />
      </div>

      {/* Estado vacío / loading / error */}
      {loading && (
        <div className="flex h-32 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-8 text-center">
          <AlertCircle size={28} className="text-red-400" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button onClick={load} className="text-sm font-medium text-primary-600 hover:underline">Reintentar</button>
        </div>
      )}

      {!loading && !error && periods.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-slate-800">
            <CalendarRange size={24} className="text-gray-400" />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-slate-100">Sin períodos registrados</p>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              Abre tu primer período para comenzar a gestionar tus finanzas mes a mes
            </p>
          </div>
          <button
            onClick={() => setShowOpenModal(true)}
            className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
          >
            <Plus size={15} />
            Abrir período
          </button>
        </div>
      )}

      {/* Lista de períodos */}
      {!loading && !error && periods.length > 0 && (
        <div className="space-y-3">
          {!openPeriod && (
            <div className="flex items-center gap-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 px-4 py-3">
              <CheckCircle size={16} className="text-blue-500 shrink-0" />
              <p className="text-sm text-blue-700 dark:text-blue-400">
                No hay un período abierto. Abre uno para registrar nuevos egresos e ingresos.
              </p>
            </div>
          )}

          {periods.map((period, idx) => (
            <PeriodCard
              key={period.id}
              period={period}
              onClose={p => setClosingPeriod(p)}
              onPreview={p => setPreviewPeriod(p)}
              onReopen={p => setReopenPeriod(p)}
              onDelete={p => setDeletingPeriod(p)}
              isLastPeriod={idx === 0}
              live={period.status === 'abierto' ? liveSummary ?? undefined : undefined}
            />
          ))}
        </div>
      )}

      {/* Toast de carry-forward */}
      {carryToast !== null && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl bg-green-600 px-5 py-3 shadow-lg text-white text-sm font-medium">
          <Copy size={15} className="shrink-0" />
          Se importaron <strong>{carryToast}</strong> gasto{carryToast !== 1 ? 's' : ''} recurrente{carryToast !== 1 ? 's' : ''} como borradores
        </div>
      )}

      {/* Modales */}
      {showOpenModal && (
        <OpenPeriodModal
          onClose={() => setShowOpenModal(false)}
          onSuccess={handleOpened}
          nextPeriod={nextPeriod}
        />
      )}
      {closingPeriod && (
        <ClosePeriodModal
          period={closingPeriod}
          pendingExpCount={pendingExpCount}
          pendingIncCount={pendingIncCount}
          onClose={() => setClosingPeriod(null)}
          onSuccess={handleClosed}
        />
      )}
      {previewPeriod && (
        <PdfPreviewModal
          period={previewPeriod}
          onClose={() => setPreviewPeriod(null)}
        />
      )}
      {reopenPeriod && (
        <ConfirmReopenModal
          period={reopenPeriod}
          onClose={() => setReopenPeriod(null)}
          onConfirm={handleReopen}
        />
      )}
      {deletingPeriod && (
        <DeletePeriodModal
          period={deletingPeriod}
          onClose={() => setDeletingPeriod(null)}
          onDeleted={id => {
            setPeriods(prev => prev.filter(p => p.id !== id))
            setDeletingPeriod(null)
          }}
        />
      )}
    </div>
  )
}
