import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight, ChevronDown, Check, ListTree, Wallet,
  CreditCard, Repeat, Lock, Unlock, AlertTriangle, CalendarRange,
  FileText, Upload, Eye, RefreshCw, ShoppingCart, Undo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import {
  userApi, authToken,
  type Expense, type AttachmentOut, type ShoppingList,
  type ExpenseCreatePayload, type ExpenseUpdatePayload, type ExpenseItem,
  type UserCategory, type Period, type OcrPreview, type Income,
} from '@/lib/userApi'
import { DataTable, type Column, type RowAction } from '@/components/ui/DataTable'
import { FilterBar, type FilterControlDef } from '@/components/ui/FilterBar'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { EMPTY_RANGE, isInRange, isRangeActive, toLocalISODate, type DateRange } from '@/lib/dateRange'
import { KpiCard, fmtMoney } from '@/components/ui/KpiCard'
import { amountStepFor, parseAmountInput, fmtAmountInput } from '@/lib/money'
import { useResponsibleTags } from '@/hooks/useResponsibleTags'
import { FormGrid, KpiGrid } from '@/components/ui/Grids'
import { Modal } from '@/components/ui/Modal'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function ResponsibleCombobox({
  value,
  options,
  onChange,
  inputClassName,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
  inputClassName: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const filtered = options.filter(option => option.toLowerCase().includes(value.toLowerCase()))

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          value={value}
          onFocus={() => setOpen(true)}
          onChange={e => { onChange(e.target.value); setOpen(true) }}
          placeholder="Ej: familia"
          className={cn(inputClassName, 'pr-9')}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
        >
          <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card dark:border-slate-700 dark:bg-slate-900">
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-400 dark:text-slate-500">Sin resultados</li>
            ) : filtered.map(option => (
              <li key={option}>
                <button
                  type="button"
                  onClick={() => { onChange(option); setOpen(false) }}
                  className={cn(
                    'flex w-full items-center justify-between px-3 py-2 text-sm transition-colors',
                    option === value
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800',
                  )}
                >
                  {option}
                  {option === value && <Check size={13} className="text-primary-500" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function PaymentBadge({ status }: { status: 'pendiente' | 'saldado' }) {
  return status === 'saldado' ? (
    <span className="inline-flex rounded-full bg-green-50 dark:bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">Saldado</span>
  ) : (
    <span className="inline-flex rounded-full bg-amber-50 dark:bg-amber-900/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Pendiente</span>
  )
}


function CategoryBadge({ name }: { name: string }) {
  return <p className="text-sm text-gray-800 dark:text-slate-200">{name}</p>
}

function TypeBadge({ type }: { type: string }) {
  return type === 'recurrente' ? (
    <span className="inline-flex rounded-full bg-blue-50 dark:bg-blue-900/20 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">Recurrente</span>
  ) : (
    <span className="inline-flex rounded-full bg-amber-50 dark:bg-amber-900/20 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">Puntual</span>
  )
}

// Egreso creado por ingesta (bot/OCR) aún sin confirmar por el usuario —
// no cuenta en los totales de esta página ni en dashboard/reportes/cierre
// de período hasta que se confirme.
function DraftBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-900/30 px-2.5 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-400">
      Borrador
    </span>
  )
}

// ─── PeriodIndicator ──────────────────────────────────────────────────────────

function PeriodIndicator({ openPeriod }: { openPeriod: Period | null }) {
  if (!openPeriod) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15 px-3 py-2">
        <AlertTriangle size={13} className="shrink-0 text-amber-500" />
        <span className="text-xs text-amber-700 dark:text-amber-400">
          No hay período abierto — abre un período en <strong>Períodos</strong> antes de registrar egresos
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/15 px-3 py-2">
      <CalendarRange size={13} className="shrink-0 text-green-500" />
      <span className="text-xs text-green-700 dark:text-green-400">
        Período activo: <strong>{MONTHS[openPeriod.month - 1]} {openPeriod.year}</strong>
        <span className="ml-2 inline-flex items-center gap-1 font-medium"><Unlock size={11} />Abierto</span>
      </span>
    </div>
  )
}

// ─── AttachmentPanel ──────────────────────────────────────────────────────────

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

interface PendingFile { file: File; previewUrl: string | null }

interface AttachmentPanelProps {
  expenseId: string | null
  pendingFile: PendingFile | null
  onPendingChange: (f: PendingFile | null) => void
  onPreviewUploaded: (att: AttachmentOut) => void
  // Solo dispara en el flujo de creación (sin expenseId todavía) — intenta
  // leer monto/categoría de la imagen para proponerlos en el formulario.
  onNewPendingFile?: (file: File) => void
  /** El adjunto actual es el PDF de evidencia de una lista de compra: se pide confirmación antes de perderlo. */
  isListEvidence?: boolean
}

const LIST_EVIDENCE_WARNING =
  'Este adjunto es el PDF de evidencia de la lista de compra. Cada egreso admite un solo adjunto, ' +
  'así que se perderá. ¿Continuar?'

function AttachmentPanel({ expenseId, pendingFile, onPendingChange, onPreviewUploaded, onNewPendingFile, isListEvidence }: AttachmentPanelProps) {
  const [uploaded, setUploaded] = useState<AttachmentOut | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!expenseId) return
    userApi.attachments.list(expenseId)
      .then(atts => setUploaded(atts[0] ?? null))
      .catch(() => {})
  }, [expenseId])

  // Thumbnail para adjunto ya subido (imágenes)
  useEffect(() => {
    if (!uploaded || !expenseId || !uploaded.mime_type.startsWith('image/')) {
      setThumbUrl(null); return
    }
    let url = ''
    fetch(userApi.attachments.contentUrl(expenseId, uploaded.id), {
      headers: { Authorization: `Bearer ${authToken()}` },
    })
      .then(r => r.blob())
      .then(b => { url = URL.createObjectURL(b); setThumbUrl(url) })
      .catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
    // Depende del id del adjunto, no del objeto: evita re-descargar la miniatura en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploaded?.id, expenseId])

  function pickFile(rawFile: File | null) {
    if (!rawFile || !ALLOWED_TYPES.includes(rawFile.type)) return

    if (expenseId) {
      setUploading(true)
      userApi.attachments.upload(expenseId, rawFile)
        .then(att => { setUploaded(att); setUploading(false) })
        .catch(() => setUploading(false))
    } else {
      if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl)
      onPendingChange({
        file: rawFile,
        previewUrl: rawFile.type.startsWith('image/') ? URL.createObjectURL(rawFile) : null,
      })
      if (rawFile.type.startsWith('image/')) onNewPendingFile?.(rawFile)
    }
  }

  // El PDF de evidencia solo se protege mientras es el adjunto original (generado al enviar la lista).
  const guardsEvidence = !!isListEvidence && uploaded?.mime_type === 'application/pdf' && uploaded.original_filename.startsWith('lista-')

  function replaceFile() {
    if (guardsEvidence && !window.confirm(LIST_EVIDENCE_WARNING)) return
    inputRef.current?.click()
  }

  async function removeFile() {
    if (guardsEvidence && !window.confirm(LIST_EVIDENCE_WARNING)) return
    if (expenseId && uploaded) {
      try {
        await userApi.attachments.delete(expenseId, uploaded.id)
        setUploaded(null); setThumbUrl(null)
      } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
    } else {
      if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl)
      onPendingChange(null)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    pickFile(e.dataTransfer.files[0] ?? null)
  }

  const hasFile = expenseId ? !!uploaded : !!pendingFile
  const isPdf = (expenseId ? uploaded?.mime_type : pendingFile?.file.type) === 'application/pdf'
  const fileName = expenseId ? uploaded?.original_filename : pendingFile?.file.name
  const fileSize = expenseId ? (uploaded?.size_bytes ?? 0) : (pendingFile?.file.size ?? 0)
  const previewSrc = expenseId ? thumbUrl : pendingFile?.previewUrl

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Evidencia</p>

      {hasFile ? (
        /* Slot con archivo */
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          {/* Preview */}
          <div
            className="flex h-32 items-center justify-center bg-gray-50 dark:bg-slate-800 cursor-pointer"
            onClick={() => uploaded && onPreviewUploaded(uploaded)}
          >
            {uploading ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            ) : isPdf ? (
              <div className="flex flex-col items-center gap-1 text-red-400">
                <FileText size={36} />
                <span className="text-[10px] font-medium">PDF</span>
              </div>
            ) : previewSrc ? (
              <img src={previewSrc} alt="" className="h-full w-full object-contain" />
            ) : (
              <div className="h-full w-full animate-pulse bg-gray-100 dark:bg-slate-700" />
            )}
          </div>
          {/* Info + acciones */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-700 dark:text-slate-300">{fileName}</p>
              <p className="text-[10px] text-gray-400">{fmtBytes(fileSize)}</p>
            </div>
            <button
              type="button"
              onClick={replaceFile}
              className="shrink-0 rounded-lg border border-gray-200 dark:border-slate-700 px-2 py-1 text-[10px] font-medium text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              Reemplazar
            </button>
            <button
              type="button"
              onClick={removeFile}
              className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ) : (
        /* Zona drag-and-drop vacía */
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-8 text-center transition-colors',
            dragOver
              ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/15'
              : 'border-gray-200 dark:border-slate-700 hover:border-primary-300 hover:bg-gray-50 dark:hover:bg-slate-800/50',
          )}
        >
          <Upload size={20} className="text-gray-400" />
          <p className="text-xs text-gray-400 dark:text-slate-500">Arrastra o haz clic</p>
          <p className="text-[10px] text-gray-300 dark:text-slate-600">PDF · PNG · JPG · máx 20 MB</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        className="hidden"
        onChange={e => { pickFile(e.target.files?.[0] ?? null); e.target.value = '' }}
      />
    </div>
  )
}

// ─── AttachmentViewerModal ────────────────────────────────────────────────────

function AttachmentViewerModal({
  expense,
  initialAtt,
  onClose,
}: {
  expense: Expense
  initialAtt?: AttachmentOut
  onClose: () => void
}) {
  const [attachments, setAttachments] = useState<AttachmentOut[]>([])
  const [preview, setPreview] = useState<{ att: AttachmentOut; blobUrl: string } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  useEffect(() => {
    userApi.attachments.list(expense.id).then(atts => {
      setAttachments(atts)
      // Con 1 adjunto máximo, ir directo al preview
      const target = initialAtt
        ? atts.find(a => a.id === initialAtt.id) ?? atts[0]
        : atts[0]
      if (target) openPreview(target)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expense.id])

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.blobUrl)
    }
  }, [preview])

  async function openPreview(att: AttachmentOut) {
    setLoadingPreview(true)
    try {
      const resp = await fetch(userApi.attachments.contentUrl(expense.id, att.id), {
        headers: { Authorization: `Bearer ${authToken()}` },
      })
      const blob = await resp.blob()
      if (preview) URL.revokeObjectURL(preview.blobUrl)
      setPreview({ att, blobUrl: URL.createObjectURL(blob) })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al cargar adjunto')
    } finally {
      setLoadingPreview(false)
    }
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.blobUrl)
    setPreview(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-slate-900 shadow-xl flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 dark:border-slate-800 px-4 py-3 sm:px-6 sm:py-4 shrink-0">
          <div className="min-w-0">
            {preview ? (
              <>
                <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{preview.att.original_filename}</h2>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">
                  Registrado el {fmtDate(preview.att.uploaded_at.split('T')[0])} · {fmtBytes(preview.att.size_bytes)}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Adjuntos</h2>
                <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">{expense.label}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-4">
            {preview && (
              <button
                onClick={closePreview}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Volver
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {loadingPreview && (
            <div className="flex h-64 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          )}

          {!loadingPreview && preview && (
            <div className="flex items-center justify-center min-h-[300px]">
              {preview.att.mime_type.startsWith('image/') ? (
                <img
                  src={preview.blobUrl}
                  alt={preview.att.original_filename}
                  className="max-h-[65vh] max-w-full rounded-lg object-contain shadow"
                />
              ) : (
                <object
                  data={preview.blobUrl}
                  type="application/pdf"
                  className="h-[65vh] w-full rounded-lg"
                >
                  <p className="text-sm text-gray-500">No se puede mostrar el PDF en este navegador.</p>
                </object>
              )}
            </div>
          )}

          {!loadingPreview && !preview && (
            <div>
              {attachments.length === 0 ? (
                <p className="text-center text-sm text-gray-400 dark:text-slate-500 py-8">Sin adjuntos</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {attachments.map(att => (
                    <button
                      key={att.id}
                      onClick={() => openPreview(att)}
                      className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 dark:border-slate-700 p-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-left group"
                    >
                      {att.mime_type.startsWith('image/') ? (
                        <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-slate-800">
                          <Eye size={18} className="text-gray-300 group-hover:text-primary-400 transition-colors" />
                        </div>
                      ) : (
                        <div className="flex h-20 w-full items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20">
                          <FileText size={28} className="text-red-400" />
                        </div>
                      )}
                      <p className="w-full truncate text-center text-xs font-medium text-gray-600 dark:text-slate-400">{att.original_filename}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Vista de solo lectura de la lista de compra de origen ────────────────────

function ShoppingListPreviewModal({ listId, currency, onClose }: {
  listId: string
  currency: string
  onClose: () => void
}) {
  const [list, setList] = useState<ShoppingList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    userApi.shoppingLists.get(listId)
      .then(setList)
      .catch(e => setError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false))
  }, [listId])

  const purchasedItems = list?.items.filter(item => item.purchased) ?? []
  const total = purchasedItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price ?? 0), 0)

  return (
    <Modal title="Lista de compra de origen" onClose={onClose}>
      {loading && <p className="text-sm text-gray-400 dark:text-slate-500">Cargando…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {list && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-900 dark:text-slate-100">{list.name}</p>
            {list.archived && (
              <span className="inline-flex rounded-full bg-gray-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-slate-400">Archivada</span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500">
            Productos comprados de esta lista — vista de solo lectura, puede haber cambiado desde
            que se generó este egreso.
          </p>
          <div className="rounded-xl border border-gray-100 dark:border-slate-800">
            <div className="divide-y divide-gray-100 dark:divide-slate-800">
              {purchasedItems.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 text-sm text-gray-700 dark:text-slate-300">
                    {item.label} <span className="text-gray-400 dark:text-slate-500">× {item.quantity}</span>
                  </span>
                  <span className="text-sm tabular-nums text-gray-500 dark:text-slate-400">
                    {item.unit_price ? fmtMoney(Number(item.quantity) * Number(item.unit_price), currency) : '—'}
                  </span>
                </div>
              ))}
              {purchasedItems.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-gray-400 dark:text-slate-500">
                  Ningún producto de esta lista está marcado como comprado.
                </p>
              )}
            </div>
            {purchasedItems.length > 0 && (
              <div className="flex items-center justify-between rounded-b-xl bg-gray-50 px-3 py-2.5 dark:bg-slate-800/60">
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Total</span>
                <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-100">
                  {fmtMoney(total, currency)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}


// ─── Formulario de egreso ─────────────────────────────────────────────────────

interface ExpenseFormProps {
  initial?: Partial<ExpenseCreatePayload & { review_status: string; items_from_list: boolean }>
  expenseId?: string
  categories: UserCategory[]
  openPeriod: Period | null
  amountStep?: string
  currency: string
  defaultResponsible?: string
  onSubmit: (data: ExpenseCreatePayload, pendingFile: File | null) => Promise<void>
  onCancel: () => void
  submitLabel: string
  onPreviewAttachment?: (att: AttachmentOut) => void
  shoppingListId?: string | null
  onViewShoppingList?: () => void
}

function periodDateRange(p: Period | null) {
  if (!p) return { min: undefined, max: undefined }
  const mm = String(p.month).padStart(2, '0')
  const lastDay = new Date(p.year, p.month, 0).getDate()
  return {
    min: `${p.year}-${mm}-01`,
    max: `${p.year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

function ExpenseForm({
  initial, expenseId, categories, openPeriod, amountStep = '0.01', currency,
  defaultResponsible = '',
  onSubmit, onCancel, submitLabel, onPreviewAttachment,
  shoppingListId, onViewShoppingList,
}: ExpenseFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const { min: dateMin, max: dateMax } = periodDateRange(openPeriod)
  const [date, setDate]             = useState(initial?.date ?? today)
  const [label, setLabel]           = useState(initial?.label ?? '')
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '')
  const [amount, setAmount]         = useState(() => fmtAmountInput(initial?.amount ?? '', amountStep))
  const [obviable, setObviable]     = useState(initial?.obviable ?? false)
  const [payment, setPayment]       = useState<'pendiente'|'saldado'>(initial?.payment_status ?? 'pendiente')
  const [responsible, setResponsible] = useState(initial?.responsible_tag ?? defaultResponsible)
  const [pending, setPending]       = useState<PendingFile | null>(null)
  // Desglose manual (no aplica a egresos de lista de compra: su desglose es el snapshot de la lista)
  // Ítems de lista de compra: congelados (ni desglose manual ni cambio de monto), aunque la lista ya no exista.
  const itemsLocked = !!initial?.items_from_list
  const canBreakdown = !shoppingListId && !itemsLocked
  const [items, setItems] = useState<ExpenseItem[]>(
    () => (initial?.items ?? []).map(i => ({ label: i.label, amount: fmtAmountInput(i.amount, amountStep) })),
  )
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [ocrAnalyzing, setOcrAnalyzing] = useState(false)
  const [ocrProposal, setOcrProposal]   = useState<OcrPreview | null>(null)
  const [localCats, setLocalCats]           = useState<UserCategory[]>(categories)
  const [refreshingCats, setRefreshingCats] = useState(false)
  const [showNewCat, setShowNewCat]         = useState(false)
  const [newCatName, setNewCatName]         = useState('')
  const [newCatType, setNewCatType]         = useState<'recurrente' | 'puntual'>('puntual')
  const [savingCat, setSavingCat]           = useState(false)
  const [newCatError, setNewCatError]       = useState<string | null>(null)
  const { tags: responsibleTags, addTag: addResponsibleTag } = useResponsibleTags()

  async function handleRefreshCats() {
    setRefreshingCats(true)
    try {
      const fresh = await userApi.categories.list()
      setLocalCats(fresh)
    } finally {
      setRefreshingCats(false)
    }
  }

  async function handleCreateCat() {
    if (!newCatName.trim()) return
    setSavingCat(true)
    setNewCatError(null)
    try {
      const created = await userApi.categories.create({ name: newCatName.trim(), type: newCatType, default_obviable: false })
      setLocalCats(prev => [...prev, created])
      setCategoryId(created.id)
      setShowNewCat(false)
      setNewCatName('')
    } catch (err) {
      setNewCatError(err instanceof Error ? err.message : 'Error al crear categoría')
    } finally {
      setSavingCat(false)
    }
  }

  const activeCats = localCats.filter(c => c.active)
  const canSubmit = !!openPeriod

  function applyOcrProposal(p: OcrPreview) {
    if (p.amount)      setAmount(fmtAmountInput(p.amount, amountStep))
    if (p.category_id) setCategoryId(p.category_id)
  }

  async function handleOcrAttach(file: File) {
    setOcrAnalyzing(true)
    try {
      const result = await userApi.expenses.ocrPreview(file)
      if (!result.amount && !result.category_id) return  // nada que proponer

      const currentAmount = parseFloat(parseAmountInput(amount, amountStep) || '0')
      const hasData = currentAmount > 0 || !!categoryId

      if (!hasData) applyOcrProposal(result)
      else           setOcrProposal(result)
    } catch {
      // Best-effort: si el OCR falla, el usuario igual puede llenar el formulario a mano.
    } finally {
      setOcrAnalyzing(false)
    }
  }

  /** Normaliza lo tecleado en un campo de monto; null si el texto no es un monto válido. */
  function sanitizeAmount(raw: string): string | null {
    const v = raw.replace(',', '.')
    return (amountStep === '1' ? /^\d*$/ : /^\d*\.?\d*$/).test(v) ? v : null
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = sanitizeAmount(e.target.value)
    if (v !== null) setAmount(v)
  }

  const hasItems = canBreakdown && items.length > 0
  // Con desglose (manual o de lista) el total siempre es la suma de los ítems.
  const amountLocked = hasItems || (itemsLocked && (initial?.items?.length ?? 0) > 0)
  const itemsTotal = items.reduce((sum, i) => sum + (Number(parseAmountInput(i.amount, amountStep)) || 0), 0)
  const itemsTotalStr = amountStep === '1' ? String(Math.round(itemsTotal)) : itemsTotal.toFixed(2)

  function updateItem(index: number, patch: Partial<ExpenseItem>) {
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null)
    if (dateMin && dateMax && (date < dateMin || date > dateMax)) {
      setError(`La fecha debe estar dentro del período ${openPeriod ? MONTHS[openPeriod.month - 1] + ' ' + openPeriod.year : ''}`)
      return
    }
    setSaving(true)
    try {
      if (responsible.trim()) addResponsibleTag(responsible)
      const cleanItems = items.map(i => ({ label: i.label.trim(), amount: parseAmountInput(i.amount, amountStep) }))
      if (hasItems && cleanItems.some(i => !i.label || !(Number(i.amount) > 0))) {
        setError('Cada ítem del desglose necesita descripción y un monto mayor a 0')
        return
      }
      // Sin ítems: se envía [] solo si antes había desglose (para quitarlo); si no, no se toca.
      const itemsPayload = !canBreakdown ? undefined
        : hasItems ? cleanItems
        : (initial?.items?.length ? [] : undefined)
      await onSubmit(
        {
          date, label, category_id: categoryId,
          amount: hasItems ? itemsTotalStr : (parseAmountInput(amount, amountStep) || '0'),
          obviable, payment_status: payment,
          responsible_tag: responsible || null,
          items: itemsPayload,
        },
        pending?.file ?? null,
      )
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  const inputCls = cn(
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900',
    'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500',
    'placeholder:text-gray-400 outline-none transition-colors',
    'focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:border-primary-500 dark:focus:ring-primary-900/30',
  )
  const labelCls = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300'
  const toggleCls = (on: boolean) => cn(
    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
    on ? 'bg-primary-500' : 'bg-gray-200 dark:bg-slate-600',
  )
  const btnBase = 'flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors'

  return (
    <>
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_220px]">

        {/* Columna izquierda: Fecha → Monto → Categoría → Descripción → Responsable|Obviable → Estado pago */}
        <div className="space-y-4">
          <PeriodIndicator openPeriod={openPeriod} />

          {shoppingListId && (
            <button
              type="button"
              onClick={onViewShoppingList}
              className="flex w-full items-center gap-2 rounded-xl border border-primary-100 bg-primary-50 px-3 py-2 text-left text-sm text-primary-700 hover:bg-primary-100 dark:border-primary-900/40 dark:bg-primary-900/20 dark:text-primary-400 dark:hover:bg-primary-900/30"
            >
              <ShoppingCart size={14} className="shrink-0" />
              Este egreso viene de una lista de compra — ver detalle
            </button>
          )}

          {/* Fecha | Monto */}
          <FormGrid>
            <div>
              <label className={labelCls}>Fecha <span className="text-red-500">*</span></label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required min={dateMin} max={dateMax} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monto <span className="text-red-500">*</span></label>
              <input
                type="text"
                inputMode={amountStep === '1' ? 'numeric' : 'decimal'}
                value={hasItems ? fmtAmountInput(itemsTotalStr, amountStep) : amount}
                onChange={handleAmountChange}
                onFocus={e => { if (!amountLocked) setAmount(parseAmountInput(e.currentTarget.value, amountStep)) }}
                onBlur={e => { if (!amountLocked) setAmount(fmtAmountInput(parseAmountInput(e.currentTarget.value, amountStep), amountStep)) }}
                readOnly={amountLocked}
                title={itemsLocked ? 'Calculado desde la lista de compra' : hasItems ? 'Calculado como la suma de los ítems del desglose' : undefined}
                required
                placeholder={amountStep === '1' ? '0' : '0.00'}
                className={cn(inputCls, amountLocked && 'cursor-not-allowed bg-gray-50 dark:bg-slate-900')}
              />
            </div>
          </FormGrid>

          {/* Desglose en ítems (egreso compuesto) */}
          {canBreakdown && (
            <div className="rounded-xl border border-gray-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setItems(prev => (prev.length ? prev : [{ label: '', amount: '' }]))}
                aria-expanded={hasItems}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium',
                  hasItems ? 'text-gray-700 dark:text-slate-300' : 'text-primary-600 hover:bg-gray-50 dark:text-primary-400 dark:hover:bg-slate-800/50',
                )}
              >
                <span className="flex items-center gap-2"><ListTree size={14} /> Desglosar en ítems</span>
                {hasItems && <span className="text-xs font-normal text-gray-400 dark:text-slate-500">{items.length} {items.length === 1 ? 'ítem' : 'ítems'}</span>}
              </button>

              {hasItems && (
                <div className="space-y-2 border-t border-gray-100 px-3 pb-3 pt-3 dark:border-slate-800">
                  {items.map((it, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={it.label}
                        onChange={e => updateItem(i, { label: e.target.value })}
                        placeholder="Descripción"
                        aria-label={`Descripción del ítem ${i + 1}`}
                        maxLength={200}
                        className={cn(inputCls, 'min-w-0 flex-1 px-3 py-2')}
                      />
                      <input
                        type="text"
                        inputMode={amountStep === '1' ? 'numeric' : 'decimal'}
                        value={it.amount}
                        onChange={e => { const v = sanitizeAmount(e.target.value); if (v !== null) updateItem(i, { amount: v }) }}
                        onFocus={e => updateItem(i, { amount: parseAmountInput(e.currentTarget.value, amountStep) })}
                        onBlur={e => updateItem(i, { amount: fmtAmountInput(parseAmountInput(e.currentTarget.value, amountStep), amountStep) })}
                        placeholder={amountStep === '1' ? '0' : '0.00'}
                        aria-label={`Monto del ítem ${i + 1}`}
                        className={cn(inputCls, 'w-28 shrink-0 px-3 py-2 text-right tabular-nums sm:w-32')}
                      />
                      <button
                        type="button"
                        onClick={() => setItems(prev => prev.filter((_, j) => j !== i))}
                        title="Quitar ítem"
                        aria-label={`Quitar ítem ${i + 1}`}
                        className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setItems(prev => [...prev, { label: '', amount: '' }])}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
                    >
                      <Plus size={13} /> Agregar ítem
                    </button>
                    <span className="text-sm text-gray-500 dark:text-slate-400">
                      Total <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">{fmtMoney(itemsTotal, currency)}</span>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Categoría */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                Categoría <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleRefreshCats}
                  disabled={refreshingCats}
                  title="Sincronizar categorías"
                  className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs text-gray-400 hover:text-primary-500 hover:bg-gray-50 dark:hover:bg-slate-800 dark:text-slate-500 dark:hover:text-primary-400 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={11} className={refreshingCats ? 'animate-spin' : ''} />
                  Sincronizar
                </button>
                <span className="text-gray-200 dark:text-slate-700">·</span>
                <button
                  type="button"
                  onClick={() => { setShowNewCat(v => !v); setNewCatName(''); setNewCatError(null) }}
                  className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs text-gray-400 hover:text-green-600 hover:bg-gray-50 dark:hover:bg-slate-800 dark:text-slate-500 dark:hover:text-green-400 transition-colors"
                >
                  <Plus size={11} />
                  Nueva
                </button>
              </div>
            </div>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} required className={inputCls}>
              <option value="">Seleccionar categoría…</option>
              {activeCats.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.is_system ? '' : ' ★'}
                </option>
              ))}
            </select>

            {/* Mini-panel de nueva categoría personal — div, no form anidado */}
            {showNewCat && (
              <div className="mt-2 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10 p-3 space-y-2">
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">Nueva categoría personal</p>
                <input
                  autoFocus
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCat() } }}
                  placeholder="Nombre de la categoría…"
                  className={cn(inputCls, 'py-2 text-xs')}
                />
                <div className="flex gap-1.5">
                  {(['recurrente', 'puntual'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewCatType(t)}
                      className={cn(
                        'flex-1 rounded-lg border py-1.5 text-xs font-medium capitalize transition-colors',
                        newCatType === t
                          ? 'border-green-500 bg-green-100 text-green-700 dark:border-green-600 dark:bg-green-900/30 dark:text-green-400'
                          : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800',
                      )}
                    >{t}</button>
                  ))}
                </div>
                {newCatError && <p className="text-xs text-red-600 dark:text-red-400">{newCatError}</p>}
                <div className="flex gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowNewCat(false)}
                    className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 py-1.5 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                  >Cancelar</button>
                  <button
                    type="button"
                    onClick={handleCreateCat}
                    disabled={savingCat || !newCatName.trim()}
                    className="flex-1 rounded-lg bg-green-600 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >{savingCat ? 'Guardando…' : 'Crear y seleccionar'}</button>
                </div>
              </div>
            )}
          </div>

          {/* Descripción — textarea para más espacio */}
          <div>
            <label className={labelCls}>Descripción <span className="text-red-500">*</span></label>
            <textarea
              value={label}
              onChange={e => setLabel(e.target.value)}
              required
              rows={3}
              placeholder="Ej: Compras del super"
              className={cn(inputCls, 'resize-none')}
            />
          </div>

          {/* Responsable | Obviable — cada uno en su columna */}
          <FormGrid>
            <div>
              <label className={labelCls}>Responsable</label>
              <ResponsibleCombobox
                value={responsible}
                options={responsibleTags}
                onChange={setResponsible}
                inputClassName={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Obviable</label>
              <button
                type="button"
                onClick={() => setObviable(v => !v)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-4 py-2.5 transition-colors',
                  obviable
                    ? 'border-primary-300 bg-primary-50 dark:border-primary-600 dark:bg-primary-900/20'
                    : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800',
                )}
              >
                <span className={cn('text-sm', obviable ? 'text-primary-700 dark:text-primary-400' : 'text-gray-500 dark:text-slate-400')}>
                  {obviable ? 'Sí, no esencial' : 'No aplica'}
                </span>
                <div className={toggleCls(obviable)}>
                  <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', obviable ? 'translate-x-[18px]' : 'translate-x-[3px]')} />
                </div>
              </button>
            </div>
          </FormGrid>

          {/* Estado de pago — al final */}
          <div>
            <p className={labelCls}>Estado de pago</p>
            <div className="flex gap-2">
              {(['pendiente', 'saldado'] as const).map(s => (
                <button key={s} type="button" onClick={() => setPayment(s)}
                  className={cn(
                    'flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium capitalize transition-colors',
                    payment === s
                      ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-900/30 dark:text-primary-400'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
                  )}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Columna derecha: adjuntos */}
        <div className="border-t border-gray-100 dark:border-slate-800 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
          <AttachmentPanel
            expenseId={expenseId ?? null}
            pendingFile={pending}
            onPendingChange={setPending}
            onPreviewUploaded={onPreviewAttachment ?? (() => {})}
            onNewPendingFile={handleOcrAttach}
            isListEvidence={itemsLocked}
          />
        </div>
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button type="button" onClick={onCancel} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
        <button
          type="submit"
          disabled={saving || !canSubmit}
          title={!canSubmit ? 'No hay período abierto' : undefined}
          className={cn(btnBase, 'font-semibold bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed')}
        >
          {saving ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>

    {/* Overlay: analizando imagen con OCR (cubre el modal de nuevo egreso) */}
    {ocrAnalyzing && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white dark:bg-slate-900 px-8 py-6 shadow-xl">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Analizando imagen…</p>
        </div>
      </div>
    )}

    {/* Overlay: la imagen propone datos distintos a los ya cargados — confirmar reemplazo */}
    {ocrProposal && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-xl p-4 sm:p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">Datos detectados en la imagen</h3>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            El formulario ya tiene datos cargados. La imagen sugiere{' '}
            {ocrProposal.amount && <>monto <span className="font-semibold text-gray-900 dark:text-slate-100">{fmtMoney(Number(ocrProposal.amount), currency)}</span></>}
            {ocrProposal.amount && ocrProposal.category_name && ' y '}
            {ocrProposal.category_name && <>categoría <span className="font-semibold text-gray-900 dark:text-slate-100">{ocrProposal.category_name}</span></>}
            . ¿Quieres reemplazar lo que ya ingresaste?
          </p>
          <div className="mt-5 flex gap-3">
            <button
              onClick={() => setOcrProposal(null)}
              className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
            >
              Mantener lo actual
            </button>
            <button
              onClick={() => { applyOcrProposal(ocrProposal); setOcrProposal(null) }}
              className="flex-1 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
            >
              Reemplazar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'create' }
  | { type: 'edit'; expense: Expense }
  | { type: 'delete'; expense: Expense }
  | { type: 'confirm-draft'; expense: Expense }
  | { type: 'attachments'; expense: Expense; att?: AttachmentOut }
  | { type: 'shopping-list-preview'; listId: string }
  | { type: 'to-list'; expense: Expense }
  | null

type Filters = Record<string, string | string[]>

// ─── Borradores de listas de compra ───────────────────────────────────────────
// Una lista activa con productos comprados sin enviar se muestra en Egresos como
// fila de solo lectura: no existe en la base (se calcula aquí), no suma en los KPIs
// (es borrador) y desaparece sola al enviarla, porque esos ítems dejan de estar
// pendientes. Su fecha es la "fecha de compra" de la lista, o hoy si no tiene.

const LIST_DRAFT_PREFIX = 'lista-'

function isListDraft(e: Expense): boolean {
  return e.id.startsWith(LIST_DRAFT_PREFIX)
}

function buildListDrafts(lists: ShoppingList[], categories: UserCategory[], periodId: string | null): Expense[] {
  const today = toLocalISODate(new Date())
  return lists
    .filter(l => !l.archived && Number(l.pending_send_amount) > 0)
    .map(l => {
      const cat = categories.find(c => c.id === l.default_category_id)
      const pendingIds = new Set(l.pending_send_item_ids)
      return {
        id: `${LIST_DRAFT_PREFIX}${l.id}`,
        period_id: periodId,
        date: l.planned_date ?? today,
        label: `Lista compra [Borrador] - ${l.name}`,
        amount: l.pending_send_amount,
        category_id: l.default_category_id ?? '',
        category_name: cat?.name ?? 'Sin categoría',
        category_type: cat?.type ?? '',
        obviable: false,
        payment_status: 'pendiente',
        review_status: 'borrador',
        source: 'web',
        observation: null,
        responsible_tag: null,
        created_at: l.updated_at,
        attachment_count: 0,
        shopping_list_id: l.id,
        items_from_list: true,
        items: l.items
          .filter(i => pendingIds.has(i.id))
          .map(i => ({ label: i.label, amount: String(Number(i.quantity) * Number(i.unit_price ?? 0)) })),
      } satisfies Expense
    })
}

export function ExpensesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const currency  = user?.currency ?? 'CRC'
  const userName  = user?.name ?? ''
  const amountStep = amountStepFor(currency)
  const [year, setYear]   = useState<number | null>(null)
  const [month, setMonth] = useState<number | null>(null)
  const [ready, setReady] = useState(false)

  const [expenses, setExpenses]     = useState<Expense[]>([])
  const [incomes, setIncomes]       = useState<Income[]>([])
  const [shoppingLists, setShoppingLists] = useState<ShoppingList[]>([])
  const [range, setRange]           = useState<DateRange>(EMPTY_RANGE)
  const [categories, setCategories] = useState<UserCategory[]>([])
  const [allPeriods, setAllPeriods] = useState<Period[]>([])
  const [period, setPeriod]         = useState<Period | null>(null)
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState<ModalState>(null)
  const [filters, setFilters]       = useState<Filters>({ search: '', category: '', payment: '', responsible: '', tipo: '', obviable: '' })

  useEffect(() => {
    userApi.periods.current()
      .then(open => { setYear(open.year); setMonth(open.month) })
      .catch(() => {
        const now = new Date()
        setYear(now.getFullYear())
        setMonth(now.getMonth() + 1)
      })
      .finally(() => setReady(true))
  }, [])

  const load = useCallback(async () => {
    if (!ready || year === null || month === null) return
    setLoading(true)
    try {
      const [exps, incs, lists, cats, periods] = await Promise.all([
        userApi.expenses.list(year, month),
        userApi.incomes.list(year, month),
        userApi.shoppingLists.list(false),
        userApi.categories.list(),
        userApi.periods.list(),
      ])
      setExpenses(exps)
      setIncomes(incs)
      setShoppingLists(lists)
      setCategories(cats)
      setAllPeriods(periods)
      setPeriod(periods.find(p => p.year === year && p.month === month) ?? null)
    } finally {
      setLoading(false)
    }
  }, [year, month, ready])

  useEffect(() => { load() }, [load])

  const periodIdx  = allPeriods.findIndex(p => p.year === year && p.month === month)
  const canGoPrev  = periodIdx < allPeriods.length - 1
  const canGoNext  = periodIdx > 0
  const openPeriod = useMemo(() => allPeriods.find(p => p.status === 'abierto') ?? null, [allPeriods])
  const isOpenPeriod = period?.status === 'abierto'
  const periodClosed = period?.status === 'cerrado'

  // El rango de fechas es relativo al período visible: se limpia al cambiar de período.
  function goToPeriod(p: { year: number; month: number }) { setYear(p.year); setMonth(p.month); setRange(EMPTY_RANGE) }
  function prevPeriod() { if (canGoPrev) goToPeriod(allPeriods[periodIdx + 1]) }
  function nextPeriod() { if (canGoNext) goToPeriod(allPeriods[periodIdx - 1]) }
  function jumpToOpenPeriod() { if (openPeriod) goToPeriod(openPeriod) }

  const catOptions = useMemo(() =>
    categories.filter(c => c.active).map(c => ({ value: c.id, label: c.name })),
    [categories]
  )

  const responsibleOptions = useMemo(() => {
    const tags = [...new Set(expenses.map(e => e.responsible_tag).filter(Boolean))] as string[]
    return [{ value: '', label: 'Todos' }, ...tags.map(t => ({ value: t, label: t }))]
  }, [expenses])

  const FILTER_CONTROLS: FilterControlDef[] = [
    { type: 'input',  key: 'search',   label: 'Buscar',   placeholder: 'Descripción…' },
    { type: 'select', key: 'category', label: 'Categoría', placeholder: 'Todas las categorías', options: catOptions, searchable: true },
    { type: 'select', key: 'responsible', label: 'Responsable', placeholder: 'Todos', options: responsibleOptions },
    {
      type: 'radio', key: 'tipo', label: 'Tipo',
      options: [{ value: '', label: 'Todos' }, { value: 'recurrente', label: 'Recurrente' }, { value: 'puntual', label: 'Puntual' }],
    },
    {
      type: 'radio', key: 'obviable', label: 'Obviable',
      options: [{ value: '', label: 'Todos' }, { value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }],
    },
    {
      type: 'radio', key: 'payment', label: 'Pago',
      options: [{ value: '', label: 'Todos' }, { value: 'pendiente', label: 'Pendiente' }, { value: 'saldado', label: 'Saldado' }],
    },
  ]

  const listDrafts = useMemo(() => {
    if (year === null || month === null) return []
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`
    return buildListDrafts(shoppingLists, categories, period?.id ?? null).filter(d => d.date.startsWith(monthPrefix))
  }, [shoppingLists, categories, period, year, month])

  const filtered = useMemo(() => [...expenses, ...listDrafts].filter(e => {
    const s = (filters.search as string).toLowerCase()
    if (s && !e.label.toLowerCase().includes(s)) return false
    if (filters.category    && e.category_id !== filters.category) return false
    if (filters.responsible && e.responsible_tag !== filters.responsible) return false
    if (filters.tipo        && e.category_type !== filters.tipo) return false
    if (filters.obviable === 'si' && !e.obviable) return false
    if (filters.obviable === 'no' && e.obviable)  return false
    if (filters.payment  && e.payment_status !== filters.payment)  return false
    if (!isInRange(e.date, range)) return false
    return true
  }), [expenses, listDrafts, filters, range])

  // La tabla sigue mostrando los borradores (con su badge) para que el usuario
  // los revise, pero un borrador sin confirmar no cuenta en estos resúmenes —
  // mismo criterio que dashboard/reportes/cierre de período.
  const confirmed       = useMemo(() => filtered.filter(e => e.review_status !== 'borrador'), [filtered])
  const draftCount      = filtered.filter(e => e.review_status === 'borrador' && !isListDraft(e)).length
  const listasEnCurso   = filtered.filter(isListDraft).reduce((s, e) => s + Number(e.amount), 0)

  const total          = confirmed.reduce((s, e) => s + Number(e.amount), 0)
  const pendingCount   = confirmed.filter(e => e.payment_status === 'pendiente').length
  const saldadoCount   = confirmed.filter(e => e.payment_status === 'saldado').length
  const obviableCount  = confirmed.filter(e => e.obviable).length
  const montoPendiente = confirmed.filter(e => e.payment_status === 'pendiente').reduce((s, e) => s + Number(e.amount), 0)
  const montoSaldado   = confirmed.filter(e => e.payment_status === 'saldado').reduce((s, e) => s + Number(e.amount), 0)
  const obviableTotal  = confirmed.filter(e => e.obviable).reduce((s, e) => s + Number(e.amount), 0)

  // Disponible = ingresos del período − todo lo ya pagado en el período − lo pendiente
  // en la vista actual (rango + filtros). Responde "¿cuánto me queda si pago solo lo
  // comprometido en estas fechas?". Ingresos con el mismo criterio que el Dashboard.
  const ingresosPeriodo = incomes.reduce((s, i) => s + Number(i.amount), 0)
  const pagadoPeriodo   = expenses
    .filter(e => e.review_status !== 'borrador' && e.payment_status === 'saldado')
    .reduce((s, e) => s + Number(e.amount), 0)
  const disponible      = ingresosPeriodo - pagadoPeriodo - montoPendiente - listasEnCurso
  const periodBounds    = month !== null && year !== null
    ? { min: `${year}-${String(month).padStart(2, '0')}-01`, max: `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}` }
    : { min: undefined, max: undefined }
  const rangeExceedsPeriod = isRangeActive(range) && !!periodBounds.min &&
    ((!!range.from && range.from < periodBounds.min) || (!!range.to && range.to > periodBounds.max!))

  async function handleToList(expense: Expense) {
    try {
      const list = await userApi.shoppingLists.fromExpense(expense.id)
      setModal(null)
      navigate(`/listas-compra/${list.id}`, { state: { from: '/egresos' } })
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function togglePayment(expense: Expense) {
    const next: 'pendiente' | 'saldado' = expense.payment_status === 'pendiente' ? 'saldado' : 'pendiente'
    try {
      const updated = await userApi.expenses.update(expense.id, { payment_status: next })
      setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e))
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function handleDelete(expense: Expense) {
    try {
      await userApi.expenses.delete(expense.id)
      setExpenses(prev => prev.filter(e => e.id !== expense.id))
      setModal(null)
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  const columns: Column<Expense>[] = [
    {
      key: 'date', label: 'Fecha', sortable: true,
      render: e => <span className="whitespace-nowrap text-sm text-gray-600 dark:text-slate-400">{fmtDate(e.date)}</span>,
    },
    {
      key: 'label', label: 'Descripción', sortable: true,
      render: e => (
        <div className="flex items-center gap-2">
          {isListDraft(e) ? (
            <p className="flex items-center gap-1.5 font-medium italic text-gray-500 dark:text-slate-400">
              <ShoppingCart size={13} className="shrink-0" /> {e.label}
            </p>
          ) : (
            <>
              <p className="font-medium text-gray-900 dark:text-slate-100">{e.label}</p>
              {e.review_status === 'borrador' && <DraftBadge />}
            </>
          )}
        </div>
      ),
    },
    {
      key: 'responsible_tag', label: 'Responsable', sortable: true,
      render: e => e.responsible_tag ? (
        <span className="inline-flex rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
          {e.responsible_tag}
        </span>
      ) : (
        <span className="text-xs text-gray-300 dark:text-slate-600">—</span>
      ),
    },
    {
      key: 'category_name', label: 'Categoría', sortable: true,
      render: e => <CategoryBadge name={e.category_name} />,
    },
    {
      key: 'category_type', label: 'Tipo', sortable: true,
      render: e => <TypeBadge type={e.category_type} />,
    },
    {
      key: 'obviable', label: 'Obviable', sortable: true,
      className: 'text-center',
      headerClassName: 'text-center',
      render: e => e.obviable ? (
        <span className="inline-flex rounded-full bg-gray-100 dark:bg-slate-700 px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-slate-300">Sí</span>
      ) : (
        <span className="inline-flex rounded-full bg-gray-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-medium text-gray-400">No</span>
      ),
    },
    {
      key: 'amount', label: 'Monto', sortable: true,
      className: 'text-right',
      headerClassName: 'text-right',
      render: e => (
        <span className="whitespace-nowrap font-semibold tabular-nums text-gray-900 dark:text-slate-100">
          {fmtMoney(Number(e.amount), currency)}
        </span>
      ),
    },
    {
      key: 'payment_status', label: 'Pago', sortable: true,
      render: e => <PaymentBadge status={e.payment_status} />,
    },
  ]

  async function toggleObviable(expense: Expense) {
    try {
      const updated = await userApi.expenses.update(expense.id, { obviable: !expense.obviable })
      setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e))
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function confirmDraft(expense: Expense) {
    try {
      const updated = await userApi.expenses.update(expense.id, { review_status: 'confirmado' })
      setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e))
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  const expenseActions: RowAction<Expense>[] = [
    {
      icon:     Check,
      label:    'Confirmar borrador',
      // Botón visible solo en filas en borrador; en el resto no aplica.
      primary:  true,
      hidden:   e => e.review_status !== 'borrador',
      disabled: () => !!periodClosed,
      onClick:  expense => setModal({ type: 'confirm-draft', expense }),
    },
    {
      icon:     Pencil,
      label:    'Editar',
      primary:  true,
      disabled: () => !!periodClosed,
      onClick:  expense => setModal({ type: 'edit', expense }),
    },
    {
      icon:     CreditCard,
      label:    'Pasar a saldado',
      primary:  true,
      disabled: e => e.payment_status !== 'pendiente' || !!periodClosed,
      onClick:  togglePayment,
    },
    {
      icon:     Repeat,
      label:    e => e.obviable ? 'Obviable: Sí' : 'Obviable: No',
      disabled: () => !!periodClosed,
      onClick:  toggleObviable,
    },
    {
      icon:     Eye,
      label:    'Ver adjunto',
      disabled: e => e.attachment_count === 0,
      onClick:  e => setModal({ type: 'attachments', expense: e }),
    },
    {
      icon:     ShoppingCart,
      label:    'Ver lista de compra',
      disabled: e => !e.shopping_list_id,
      onClick:  e => setModal({ type: 'shopping-list-preview', listId: e.shopping_list_id! }),
    },
    {
      icon:     Undo2,
      label:    'Devolver a lista de compra',
      hidden:   e => !e.items?.length,
      disabled: () => !!periodClosed,
      onClick:  e => setModal({ type: 'to-list', expense: e }),
    },
    {
      icon: Trash2, label: 'Eliminar', variant: 'danger',
      disabled: () => !!periodClosed,
      onClick:  expense => setModal({ type: 'delete', expense }),
    },
  ]
  // Un borrador de lista no se edita desde Egresos: su única acción lleva a la lista de compra.
  const actions: RowAction<Expense>[] = [
    {
      icon: Pencil, label: 'Editar lista', primary: true,
      hidden: e => !isListDraft(e),
      onClick: e => navigate(`/listas-compra/${e.shopping_list_id}`, { state: { from: '/egresos' } }),
    },
    ...expenseActions.map(a => ({ ...a, hidden: (e: Expense) => isListDraft(e) || !!a.hidden?.(e) })),
  ]


  if (!ready || year === null || month === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* Header + navegación de períodos */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Egresos</h1>

        <div className="flex items-center gap-2">
          <button onClick={prevPeriod} disabled={!canGoPrev}
            className="rounded-xl border border-gray-200 dark:border-slate-700 p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
            <ChevronLeft size={16} />
          </button>

          <div className="min-w-[180px] text-center">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{MONTHS[month - 1]} {year}</p>
            {period && (
              <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium', isOpenPeriod ? 'text-green-500' : 'text-gray-400')}>
                {isOpenPeriod ? <Unlock size={9} /> : <Lock size={9} />}
                {isOpenPeriod ? 'Abierto' : 'Cerrado'}
              </span>
            )}
            {!period && allPeriods.length > 0 && <span className="text-[10px] text-gray-400">Sin período</span>}
          </div>

          <button onClick={nextPeriod} disabled={!canGoNext}
            className="rounded-xl border border-gray-200 dark:border-slate-700 p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors">
            <ChevronRight size={16} />
          </button>

          {openPeriod && !isOpenPeriod && (
            <button onClick={jumpToOpenPeriod}
              className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-100 transition-colors">
              Ir al activo
            </button>
          )}
        </div>
      </div>

      {/* Rango de fechas — filtra tabla y KPIs */}
      <DateRangeFilter value={range} onChange={setRange} min={periodBounds.min} max={periodBounds.max} />
      {rangeExceedsPeriod && (
        <p className="-mt-2 text-xs text-gray-400 dark:text-slate-500">
          El rango sale del período: solo se consideran los egresos de {MONTHS[month - 1]} {year}.
        </p>
      )}

      {/* KPIs — excluyen borradores sin confirmar (ver DraftBadge en la tabla) */}
      <KpiGrid cols={4}>
        <KpiCard label={isRangeActive(range) ? 'Total en el rango' : 'Total período'} amount={total} currency={currency} count={confirmed.length} />
        <KpiCard label="Monto saldado"   amount={montoSaldado}   currency={currency} count={saldadoCount}    color="text-green-600 dark:text-green-400" />
        <KpiCard label="Monto pendiente" amount={montoPendiente} currency={currency} count={pendingCount}    color="text-amber-600 dark:text-amber-400" />
        <KpiCard label="Monto obviable"  amount={obviableTotal}  currency={currency} count={obviableCount}   color="text-primary-600 dark:text-primary-400" />
      </KpiGrid>

      {/* Disponible pagando solo lo comprometido en la vista */}
      <div className="rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-slate-400">
              <Wallet size={13} />
              {isRangeActive(range)
                ? `Disponible pagando lo pendiente ${range.from ? `del ${fmtDate(range.from)}` : ''} ${range.to ? `al ${fmtDate(range.to)}` : ''}`.replace(/\s+/g, ' ')
                : 'Disponible pagando todo lo pendiente del período'}
            </p>
            <p className={cn(
              'mt-1 break-words text-[clamp(1.25rem,6vw,1.5rem)] font-semibold leading-tight tabular-nums',
              disponible >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
            )}>
              {fmtMoney(disponible, currency)}
            </p>
            {listasEnCurso > 0 && (
              <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">
                Sin contar listas en curso: <span className="tabular-nums">{fmtMoney(disponible + listasEnCurso, currency)}</span>
              </p>
            )}
          </div>
          <dl className={cn(
            'grid grid-cols-1 gap-2 text-sm lg:gap-6',
            listasEnCurso > 0 ? 'min-[420px]:grid-cols-2 lg:min-w-[600px] lg:grid-cols-4' : 'min-[420px]:grid-cols-3 lg:min-w-[480px]',
          )}>
            <div className="flex items-baseline justify-between gap-3 min-[420px]:block">
              <dt className="text-xs text-gray-400 dark:text-slate-500">Ingresos del período</dt>
              <dd className="font-medium tabular-nums text-gray-800 dark:text-slate-200">{fmtMoney(ingresosPeriodo, currency)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 min-[420px]:block">
              <dt className="text-xs text-gray-400 dark:text-slate-500">− Ya pagado (período)</dt>
              <dd className="font-medium tabular-nums text-gray-800 dark:text-slate-200">{fmtMoney(pagadoPeriodo, currency)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 min-[420px]:block">
              <dt className="text-xs text-gray-400 dark:text-slate-500">− Pendiente {isRangeActive(range) ? 'en el rango' : 'del período'}</dt>
              <dd className="font-medium tabular-nums text-amber-600 dark:text-amber-400">{fmtMoney(montoPendiente, currency)}</dd>
            </div>
            {listasEnCurso > 0 && (
              <div className="flex items-baseline justify-between gap-3 min-[420px]:block">
                <dt className="text-xs text-gray-400 dark:text-slate-500">− Listas en curso</dt>
                <dd className="font-medium tabular-nums text-gray-500 dark:text-slate-400">{fmtMoney(listasEnCurso, currency)}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {draftCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-purple-200 dark:border-purple-800/50 bg-purple-50 dark:bg-purple-900/20 px-4 py-3">
          <p className="text-sm text-purple-700 dark:text-purple-400">
            Hay <span className="font-semibold">{draftCount}</span> {draftCount === 1 ? 'egreso en borrador' : 'egresos en borrador'} (recibidos por bot, pendientes de revisión) que no se cuentan en los totales de arriba.
          </p>
        </div>
      )}

      {periodClosed && (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-4 py-3">
          <Lock size={15} className="shrink-0 text-gray-400" />
          <p className="text-sm text-gray-600 dark:text-slate-400">
            El período <span className="font-medium">{MONTHS[month - 1]} {year}</span> está <span className="font-semibold">cerrado</span>. Los egresos son de solo lectura.
          </p>
        </div>
      )}

      <FilterBar
        controls={FILTER_CONTROLS}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onClear={() => setFilters({ search: '', category: '', payment: '', responsible: '', tipo: '', obviable: '' })}
        actions={periodClosed ? [] : [{ label: 'Nuevo egreso', icon: Plus, onClick: () => setModal({ type: 'create' }) }]}
      />

      <DataTable
        data={filtered}
        columns={columns}
        actions={actions}
        rowKey={e => e.id}
        loading={loading}
        emptyMessage="No hay egresos en este período"
        defaultPageSize={15}
        pageSizeOptions={[15, 30, 50]}
        defaultSort={{ key: 'date', dir: 'asc' }}
        isExpandable={e => !!e.items && e.items.length > 0}
        renderExpanded={e => (
          <div className="max-w-xs space-y-1 pl-8">
            {e.items!.map((item, i) => (
              <div key={i} className="flex items-center gap-4 text-sm">
                <span className="flex-1 text-gray-600 dark:text-slate-400">{item.label}</span>
                <span className="whitespace-nowrap tabular-nums text-gray-700 dark:text-slate-300">{fmtMoney(Number(item.amount), currency)}</span>
              </div>
            ))}
          </div>
        )}
      />

      {/* Modal: crear egreso */}
      {modal?.type === 'create' && (
        <Modal title="Nuevo egreso" onClose={() => setModal(null)} size="xl">
          <ExpenseForm
            categories={categories}
            openPeriod={openPeriod}
            amountStep={amountStep}
            currency={currency}
            defaultResponsible={userName}
            submitLabel="Crear egreso"
            onCancel={() => setModal(null)}
            onSubmit={async (data, pendingFile) => {
              const created = await userApi.expenses.create(data)
              let attCount = 0
              if (pendingFile) {
                try { await userApi.attachments.upload(created.id, pendingFile); attCount++ } catch { /* el egreso ya se creó; el adjunto puede subirse después */ }
              }
              setExpenses(prev => [{ ...created, attachment_count: attCount }, ...prev])
              setModal(null)
            }}
          />
        </Modal>
      )}

      {/* Modal: editar egreso */}
      {modal?.type === 'edit' && (
        <Modal title="Editar egreso" onClose={() => setModal(null)} size="xl">
          <ExpenseForm
            initial={modal.expense}
            expenseId={modal.expense.id}
            categories={categories}
            openPeriod={openPeriod}
            amountStep={amountStep}
            currency={currency}
            submitLabel="Guardar"
            onCancel={() => setModal(null)}
            onPreviewAttachment={att => setModal({ type: 'attachments', expense: modal.expense, att })}
            shoppingListId={modal.expense.shopping_list_id}
            onViewShoppingList={() => setModal({ type: 'shopping-list-preview', listId: modal.expense.shopping_list_id! })}
            onSubmit={async (data) => {
              const updated = await userApi.expenses.update(modal.expense.id, data as ExpenseUpdatePayload)
              setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e))
              setModal(null)
            }}
          />
        </Modal>
      )}

      {modal?.type === 'shopping-list-preview' && (
        <ShoppingListPreviewModal listId={modal.listId} currency={currency} onClose={() => setModal(null)} />
      )}

      {/* Modal: eliminar egreso */}
      {modal?.type === 'delete' && (
        <Modal title="Eliminar egreso" onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            ¿Eliminar <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.expense.label}"</span> del {fmtDate(modal.expense.date)} por{' '}
            <span className="font-semibold">{fmtMoney(Number(modal.expense.amount), currency)}</span>?
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Esta acción no se puede deshacer.</p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setModal(null)} className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
            <button onClick={() => handleDelete(modal.expense)} className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors">Eliminar</button>
          </div>
        </Modal>
      )}

      {modal?.type === 'to-list' && (
        <Modal size="sm" title="Devolver a lista de compra" onClose={() => setModal(null)}>
          <div className="space-y-3 text-sm text-gray-600 dark:text-slate-400">
            <p>
              Se creará una lista de compra <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.expense.label}"</span> con
              los {modal.expense.items?.length ?? 0} productos del desglose, ya marcados como comprados, para que puedas corregirlos y volver a enviarla.
            </p>
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              El egreso de {fmtMoney(Number(modal.expense.amount), currency)} se eliminará
              {modal.expense.attachment_count > 0 && <> junto con su adjunto (la evidencia o la boleta que tenga)</>}.
              Al reenviar la lista se generará un egreso nuevo con su PDF.
            </p>
          </div>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setModal(null)} className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
            <button onClick={() => handleToList(modal.expense)} className="flex-1 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 transition-colors">Devolver a lista</button>
          </div>
        </Modal>
      )}

      {modal?.type === 'confirm-draft' && (
        <Modal title="Confirmar borrador" onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            ¿Confirmar <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.expense.label}"</span> del {fmtDate(modal.expense.date)} por{' '}
            <span className="font-semibold">{fmtMoney(Number(modal.expense.amount), currency)}</span> como egreso definitivo?
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
            Revisa el monto y la categoría antes de confirmar — a partir de acá cuenta en los totales del período.
          </p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setModal(null)} className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
            <button
              onClick={async () => { await confirmDraft(modal.expense); setModal(null) }}
              className="flex-1 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
            >
              Confirmar
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: adjuntos (vista desde tabla) */}
      {modal?.type === 'attachments' && (
        <AttachmentViewerModal
          expense={modal.expense}
          initialAtt={modal.att}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
