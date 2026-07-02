import { useEffect, useState, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight, Unlock, AlertTriangle, CalendarRange, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import {
  userApi,
  type Income,
  type IncomeCreatePayload,
  type UserIncomeType,
  type Period,
} from '@/lib/userApi'
import { DataTable, type Column, type RowAction } from '@/components/ui/DataTable'
import { FilterBar, type FilterControlDef } from '@/components/ui/FilterBar'
import { useResponsibleTags } from '@/hooks/useResponsibleTags'
import { KpiCard, fmtMoney } from '@/components/ui/KpiCard'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function IncomeTypeBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex rounded-full bg-green-50 dark:bg-green-900/25 px-2 py-1 text-[10px] font-medium text-green-700 dark:text-green-300">
      {name}
    </span>
  )
}

function PaymentStatusBadge({ status }: { status: 'recibido' | 'pendiente' }) {
  return status === 'recibido'
    ? <span className="inline-flex rounded-full bg-green-50 dark:bg-green-900/20 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-300">Recibido</span>
    : <span className="inline-flex rounded-full bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">Pendiente</span>
}

function Modal({ title, onClose, children, size = 'md' }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  size?: 'md' | 'lg' | 'xl' | '2xl'
}) {
  const maxW = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-5xl' }[size]
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative w-full rounded-2xl bg-white dark:bg-slate-900 shadow-xl my-auto', maxW)}>
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function PeriodIndicator({ openPeriod }: { openPeriod: Period | null }) {
  if (!openPeriod) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15 px-3 py-2">
        <AlertTriangle size={13} className="shrink-0 text-amber-500" />
        <span className="text-xs text-amber-700 dark:text-amber-400">
          No hay período abierto — abre un período en <strong>Períodos</strong> antes de registrar ingresos
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

// ─── Helpers de monto ────────────────────────────────────────────────────────

function parseAmountInput(value: string, step: string): string {
  const v = value.trim().replace(/[^\d.,]/g, '')
  if (!v) return ''
  const hasDot = v.includes('.')
  const hasComma = v.includes(',')
  let n = v
  if (hasDot && hasComma) {
    const li = v.lastIndexOf('.'), lc = v.lastIndexOf(',')
    n = lc > li ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '')
  } else if (hasComma) {
    n = /^(\d{1,3})(,\d{3})*$/.test(v) ? v.replace(/,/g, '') : v.replace(',', '.')
  } else if (hasDot) {
    if (step === '1' || /^(\d{1,3})(\.\d{3})+$/.test(v)) n = v.replace(/\./g, '')
  }
  const num = parseFloat(n)
  if (!Number.isFinite(num)) return ''
  return step === '1' ? String(Math.round(num)) : String(num)
}

function fmtAmountInput(value: string, step: string): string {
  if (!value) return ''
  const num = parseFloat(value)
  if (!Number.isFinite(num)) return value
  const dec = step === '1' ? 0 : 2
  return num.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

interface IncomeFormProps {
  initial?: Partial<IncomeCreatePayload> & { payment_status?: 'recibido' | 'pendiente' }
  incomeTypes: UserIncomeType[]
  openPeriod: Period | null
  amountStep?: string
  currency: string
  onSubmit: (data: IncomeCreatePayload) => Promise<void>
  onCancel: () => void
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

function IncomeForm({ initial, incomeTypes, openPeriod, amountStep = '0.01', currency: _currency, onSubmit, onCancel }: IncomeFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const { min: dateMin, max: dateMax } = periodDateRange(openPeriod)
  const [date, setDate] = useState(initial?.date ?? today)
  const [label, setLabel] = useState(initial?.label ?? '')
  const [incomeTypeId, setIncomeTypeId] = useState(initial?.income_type_id ?? '')
  const [amount, setAmount] = useState(() => fmtAmountInput(initial?.amount ?? '', amountStep))
  const [paymentStatus, setPaymentStatus] = useState<'recibido' | 'pendiente'>(initial?.payment_status ?? 'recibido')
  const [responsible, setResponsible] = useState(initial?.responsible_tag ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { tags: responsibleTags, addTag: addResponsibleTag } = useResponsibleTags()

  const [localTypes, setLocalTypes]       = useState<UserIncomeType[]>(incomeTypes)
  const [refreshingTypes, setRefreshingTypes] = useState(false)
  const [showNewType, setShowNewType]     = useState(false)
  const [newTypeName, setNewTypeName]     = useState('')
  const [savingType, setSavingType]       = useState(false)
  const [newTypeError, setNewTypeError]   = useState<string | null>(null)

  async function handleRefreshTypes() {
    setRefreshingTypes(true)
    try { setLocalTypes(await userApi.incomeTypes.list()) }
    finally { setRefreshingTypes(false) }
  }

  async function handleCreateType() {
    if (!newTypeName.trim()) return
    setSavingType(true); setNewTypeError(null)
    try {
      const created = await userApi.incomeTypes.create({ name: newTypeName.trim() })
      setLocalTypes(prev => [...prev, created])
      setIncomeTypeId(created.id)
      setShowNewType(false); setNewTypeName('')
    } catch (err) {
      setNewTypeError(err instanceof Error ? err.message : 'Error al crear tipo')
    } finally { setSavingType(false) }
  }

  const activeTypes = localTypes.filter(it => it.active)

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(',', '.')
    if (amountStep === '1') {
      if (/^\d*$/.test(v)) setAmount(v)
    } else {
      if (/^\d*\.?\d*$/.test(v)) setAmount(v)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (dateMin && dateMax && (date < dateMin || date > dateMax)) {
      setError(`La fecha debe estar dentro del período ${MONTHS[openPeriod!.month - 1]} ${openPeriod!.year}`)
      return
    }
    setSaving(true)
    try {
      if (responsible.trim()) addResponsibleTag(responsible)
      await onSubmit({ date, label, income_type_id: incomeTypeId, amount: parseAmountInput(amount, amountStep) || '0', payment_status: paymentStatus, responsible_tag: responsible || null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = cn(
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900',
    'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500',
    'placeholder:text-gray-400 outline-none transition-colors',
    'focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:border-primary-500 dark:focus:ring-primary-900/30',
  )
  const labelCls = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300'

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_220px]">
        <div className="space-y-4">
          <PeriodIndicator openPeriod={openPeriod} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Fecha <span className="text-red-500">*</span></label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required min={dateMin} max={dateMax} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Monto <span className="text-red-500">*</span></label>
              <input
                type="text"
                inputMode={amountStep === '1' ? 'numeric' : 'decimal'}
                value={amount}
                onChange={handleAmountChange}
                onFocus={e => setAmount(parseAmountInput(e.currentTarget.value, amountStep))}
                onBlur={e => setAmount(fmtAmountInput(parseAmountInput(e.currentTarget.value, amountStep), amountStep))}
                required
                placeholder={amountStep === '1' ? '0' : '0.00'}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                Tipo de ingreso <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleRefreshTypes}
                  disabled={refreshingTypes}
                  title="Sincronizar tipos"
                  className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs text-gray-400 hover:text-primary-500 hover:bg-gray-50 dark:hover:bg-slate-800 dark:text-slate-500 dark:hover:text-primary-400 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={11} className={refreshingTypes ? 'animate-spin' : ''} />
                  Sincronizar
                </button>
                <span className="text-gray-200 dark:text-slate-700">·</span>
                <button
                  type="button"
                  onClick={() => { setShowNewType(v => !v); setNewTypeName(''); setNewTypeError(null) }}
                  className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs text-gray-400 hover:text-green-600 hover:bg-gray-50 dark:hover:bg-slate-800 dark:text-slate-500 dark:hover:text-green-400 transition-colors"
                >
                  <Plus size={11} />
                  Nuevo
                </button>
              </div>
            </div>
            <select value={incomeTypeId} onChange={e => setIncomeTypeId(e.target.value)} required className={inputCls}>
              <option value="">Seleccionar tipo…</option>
              {activeTypes.map(it => (
                <option key={it.id} value={it.id}>{it.name}{it.is_system ? '' : ' ★'}</option>
              ))}
            </select>

            {showNewType && (
              <div className="mt-2 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10 p-3 space-y-2">
                <p className="text-xs font-semibold text-green-700 dark:text-green-400">Nuevo tipo personal</p>
                <input
                  autoFocus
                  value={newTypeName}
                  onChange={e => setNewTypeName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateType() } }}
                  placeholder="Nombre del tipo…"
                  className={cn(inputCls, 'py-2 text-xs')}
                />
                {newTypeError && <p className="text-xs text-red-600 dark:text-red-400">{newTypeError}</p>}
                <div className="flex gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowNewType(false)}
                    className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 py-1.5 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                  >Cancelar</button>
                  <button
                    type="button"
                    onClick={handleCreateType}
                    disabled={savingType || !newTypeName.trim()}
                    className="flex-1 rounded-lg bg-green-600 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >{savingType ? 'Guardando…' : 'Crear y seleccionar'}</button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Estado</label>
            <div className="flex gap-2">
              {(['recibido', 'pendiente'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPaymentStatus(s)}
                  className={cn(
                    'flex-1 rounded-xl border py-2 text-sm font-medium transition-colors',
                    paymentStatus === s
                      ? s === 'recibido'
                        ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 dark:border-green-600'
                        : 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-500'
                      : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800',
                  )}
                >
                  {s === 'recibido' ? 'Recibido' : 'Pendiente'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Descripción <span className="text-red-500">*</span></label>
            <textarea value={label} onChange={e => setLabel(e.target.value)} required rows={3} placeholder="Ej: Venta de servicios" className={cn(inputCls, 'resize-none')} />
          </div>

          <div>
            <label className={labelCls}>Responsable</label>
            <input
              list="income-responsible-datalist"
              value={responsible}
              onChange={e => setResponsible(e.target.value)}
              placeholder="Ej: cliente"
              className={inputCls}
            />
            <datalist id="income-responsible-datalist">
              {responsibleTags.map(tag => <option key={tag} value={tag} />)}
            </datalist>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-slate-800 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
          <div className="rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 p-4 text-sm text-gray-500 dark:text-slate-400">
            <p className="font-medium text-gray-900 dark:text-slate-100">Detalles</p>
            <p className="mt-3 text-xs leading-5">
              Registra ingresos dentro del período abierto. Los ingresos solo pueden editarse o eliminarse cuando el período está abierto.
            </p>
          </div>
        </div>
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
        <button type="submit" disabled={saving || !openPeriod} title={!openPeriod ? 'No hay período abierto' : undefined} className="flex-1 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed">{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

type ModalState =
  | { type: 'create' }
  | { type: 'edit'; income: Income }
  | { type: 'delete'; income: Income }
  | null

type Filters = Record<string, string | string[]>

const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'CRC', 'COP', 'PYG', 'JPY', 'KRW', 'IDR', 'VND'])

export function IncomesPage() {
  const { user } = useAuth()
  const currency = user?.currency ?? 'CRC'
  const amountStep = ZERO_DECIMAL_CURRENCIES.has(currency) ? '1' : '0.01'
  const [year, setYear] = useState<number | null>(null)
  const [month, setMonth] = useState<number | null>(null)
  const [ready, setReady] = useState(false)

  const [incomes, setIncomes] = useState<Income[]>([])
  const [incomeTypes, setIncomeTypes] = useState<UserIncomeType[]>([])
  const [allPeriods, setAllPeriods] = useState<Period[]>([])
  const [period, setPeriod] = useState<Period | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState>(null)
  const [filters, setFilters] = useState<Filters>({ search: '', type: '' })

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
      const [incs, types, periods] = await Promise.all([
        userApi.incomes.list(year, month),
        userApi.incomeTypes.list(),
        userApi.periods.list(),
      ])
      setIncomes(incs)
      setIncomeTypes(types)
      setAllPeriods(periods)
      setPeriod(periods.find(p => p.year === year && p.month === month) ?? null)
    } finally {
      setLoading(false)
    }
  }, [year, month, ready])

  useEffect(() => { load() }, [load])

  const periodIdx = allPeriods.findIndex(p => p.year === year && p.month === month)
  const canGoPrev = periodIdx < allPeriods.length - 1
  const canGoNext = periodIdx > 0
  const openPeriod = useMemo(() => allPeriods.find(p => p.status === 'abierto') ?? null, [allPeriods])
  const isOpenPeriod = period?.status === 'abierto'
  const typeOptions = useMemo(() => incomeTypes.filter(it => it.active).map(it => ({ value: it.id, label: it.name })), [incomeTypes])

  const FILTER_CONTROLS: FilterControlDef[] = [
    { type: 'input', key: 'search', label: 'Buscar', placeholder: 'Descripción o responsable…' },
    { type: 'select', key: 'type', label: 'Tipo', placeholder: 'Todos los tipos', options: typeOptions, searchable: true },
  ]

  const filtered = useMemo(() => incomes.filter(i => {
    const s = (filters.search as string).toLowerCase()
    if (s && !i.label.toLowerCase().includes(s) && !(i.responsible_tag ?? '').toLowerCase().includes(s)) return false
    if (filters.type && i.income_type_id !== filters.type) return false
    return true
  }), [incomes, filters])

  const total           = filtered.reduce((sum, income) => sum + Number(income.amount), 0)
  const totalRecibidos  = filtered.filter(i => i.payment_status === 'recibido').reduce((s, i) => s + Number(i.amount), 0)
  const totalPendientes = filtered.filter(i => i.payment_status === 'pendiente').reduce((s, i) => s + Number(i.amount), 0)
  const incomeCount     = filtered.length
  const recibidosCount  = filtered.filter(i => i.payment_status === 'recibido').length
  const pendientesCount = filtered.filter(i => i.payment_status === 'pendiente').length

  const columns: Column<Income>[] = [
    { key: 'date', label: 'Fecha', sortable: true, render: i => <span className="whitespace-nowrap text-sm text-gray-600 dark:text-slate-400">{fmtDate(i.date)}</span> },
    { key: 'label', label: 'Descripción', sortable: true, render: i => <p className="font-medium text-gray-900 dark:text-slate-100">{i.label}</p> },
    { key: 'income_type_name', label: 'Tipo', sortable: true, render: i => <IncomeTypeBadge name={i.income_type_name} /> },
    { key: 'responsible_tag', label: 'Responsable', sortable: true, render: i => i.responsible_tag
      ? <span className="inline-flex rounded-full bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">{i.responsible_tag}</span>
      : <span className="text-gray-300 dark:text-slate-600 text-xs">—</span>
    },
    { key: 'payment_status', label: 'Estado', sortable: true, render: i => <PaymentStatusBadge status={i.payment_status} /> },
    { key: 'amount', label: 'Monto', sortable: true, className: 'text-right', headerClassName: 'text-right', render: i => <span className="whitespace-nowrap font-semibold tabular-nums text-gray-900 dark:text-slate-100">{fmtMoney(Number(i.amount), currency)}</span> },
  ]

  async function handleDelete(income: Income) {
    try {
      await userApi.incomes.delete(income.id)
      setIncomes(prev => prev.filter(i => i.id !== income.id))
      setModal(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    }
  }

  const actions: RowAction<Income>[] = [
    { icon: Pencil, label: 'Editar', disabled: () => !!period?.status && period.status === 'cerrado', onClick: income => setModal({ type: 'edit', income }) },
    { icon: Trash2, label: 'Eliminar', variant: 'danger', disabled: () => !!period?.status && period.status === 'cerrado', onClick: income => setModal({ type: 'delete', income }) },
  ]

  function prevPeriod() { if (canGoPrev) { const p = allPeriods[periodIdx + 1]; setYear(p.year); setMonth(p.month) } }
  function nextPeriod() { if (canGoNext) { const p = allPeriods[periodIdx - 1]; setYear(p.year); setMonth(p.month) } }

  if (!ready || year === null || month === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Ingresos</h1>
        <div className="flex items-center gap-2">
          <button onClick={prevPeriod} disabled={!canGoPrev} className="rounded-xl border border-gray-200 dark:border-slate-700 p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"><ChevronLeft size={16} /></button>
          <div className="min-w-[180px] text-center">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{MONTHS[month - 1]} {year}</p>
            {period && <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium', isOpenPeriod ? 'text-green-500' : 'text-gray-400')}><Unlock size={9} />{isOpenPeriod ? 'Abierto' : 'Cerrado'}</span>}
            {!period && allPeriods.length > 0 && <span className="text-[10px] text-gray-400">Sin período</span>}
          </div>
          <button onClick={nextPeriod} disabled={!canGoNext} className="rounded-xl border border-gray-200 dark:border-slate-700 p-2 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total ingresos" amount={total}          currency={currency} count={incomeCount}     color="text-primary-600 dark:text-primary-400" />
        <KpiCard label="Recibidos"      amount={totalRecibidos}  currency={currency} count={recibidosCount}  color="text-green-600 dark:text-green-400" />
        <KpiCard label="Pendientes"     amount={totalPendientes} currency={currency} count={pendientesCount} color="text-amber-600 dark:text-amber-400" />
      </div>

      <FilterBar controls={FILTER_CONTROLS} values={filters} onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))} onClear={() => setFilters({ search: '', type: '' })} actions={[{ label: 'Nuevo ingreso', icon: Plus, onClick: () => setModal({ type: 'create' }) }]} />

      <DataTable data={filtered} columns={columns} actions={actions} rowKey={i => i.id} loading={loading} emptyMessage="No hay ingresos en este período" defaultPageSize={15} pageSizeOptions={[15, 30, 50]} />

      {modal?.type === 'create' && (
        <Modal title="Nuevo ingreso" onClose={() => setModal(null)} size="xl">
          <IncomeForm incomeTypes={incomeTypes} openPeriod={openPeriod} amountStep={amountStep} currency={currency} onCancel={() => setModal(null)} onSubmit={async (data) => {
            await userApi.incomes.create(data)
            setModal(null)
            await load()
          }} />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal title="Editar ingreso" onClose={() => setModal(null)} size="xl">
          <IncomeForm initial={modal.income} incomeTypes={incomeTypes} openPeriod={openPeriod} amountStep={amountStep} currency={currency} onCancel={() => setModal(null)} onSubmit={async (data) => {
            await userApi.incomes.update(modal.income.id, data)
            setModal(null)
            await load()
          }} />
        </Modal>
      )}

      {modal?.type === 'delete' && (
        <Modal title="Eliminar ingreso" onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            ¿Eliminar <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.income.label}"</span> del {fmtDate(modal.income.date)} por <span className="font-semibold">{fmtMoney(Number(modal.income.amount), currency)}</span>?
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">Esta acción no se puede deshacer.</p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setModal(null)} className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
            <button onClick={() => handleDelete(modal.income)} className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors">Eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
