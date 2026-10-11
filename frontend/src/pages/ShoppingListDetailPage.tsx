import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeft, Trash2, Plus, RotateCcw, Pencil, Check, Repeat, Send, Minus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import {
  userApi,
  type ShoppingList, type ShoppingListItem, type UserCategory,
} from '@/lib/userApi'
import { KpiCard, fmtMoney } from '@/components/ui/KpiCard'
import { FilterBar, type FilterControlDef } from '@/components/ui/FilterBar'
import { DataTable, type Column, type RowAction } from '@/components/ui/DataTable'
import { amountStepFor, parseAmountInput, fmtAmountInput, purchasedTotal } from '@/lib/money'
import { ShoppingListSendToExpenseModal } from '@/components/ShoppingListSendToExpenseModal'
import { FormGrid, KpiGrid } from '@/components/ui/Grids'
import { Modal } from '@/components/ui/Modal'
import { useOpenPeriodBounds } from '@/hooks/useOpenPeriodBounds'

// ─── Badge de estado de envío ──────────────────────────────────────────────────

function SentStatusBadge({ sent }: { sent: boolean }) {
  return sent ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 dark:bg-green-900/30 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
      <Check size={12} /> Ya se envió a egreso
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-slate-700 px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-slate-400">
      Aún no se ha enviado a egreso
    </span>
  )
}

const btnBase = 'flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors'
const inputCls = cn(
  'rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors',
  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500',
  'placeholder:text-gray-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:border-primary-500 dark:focus:ring-primary-900/30',
)

function normalizeQuantity(value: string | number | null | undefined, fallback = '1') {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? String(Math.max(1, Math.trunc(num))) : fallback
}

// ─── Celdas editables de la tabla de productos ────────────────────────────────

function ItemQuantityCell({ item, onChange, stepper = false }: {
  item: ShoppingListItem
  onChange: (v: string) => void
  /** Botones − / + grandes (tarjeta mobile). */
  stepper?: boolean
}) {
  const [value, setValue] = useState(() => normalizeQuantity(item.quantity))

  useEffect(() => { setValue(normalizeQuantity(item.quantity)) }, [item.quantity])

  function commit(raw: string) {
    const normalized = normalizeQuantity(raw, normalizeQuantity(item.quantity))
    setValue(normalized)
    if (normalized !== normalizeQuantity(item.quantity)) onChange(normalized)
  }

  const input = (
    <input
      type="number"
      min="1"
      step="1"
      inputMode="numeric"
      aria-label="Cantidad"
      value={value}
      onChange={e => setValue(e.target.value)}
      onFocus={e => e.currentTarget.select()}
      onBlur={e => commit(e.currentTarget.value)}
      className={cn(inputCls, stepper ? 'h-9 w-12 px-1 text-center' : 'w-20 text-center')}
    />
  )
  if (!stepper) return input

  const current = Number(normalizeQuantity(value))
  const stepBtn = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-600 active:bg-gray-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:active:bg-slate-800'
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="Restar uno" disabled={current <= 1} onClick={() => commit(String(current - 1))} className={stepBtn}>
        <Minus size={16} />
      </button>
      {input}
      <button type="button" aria-label="Sumar uno" onClick={() => commit(String(current + 1))} className={stepBtn}>
        <Plus size={16} />
      </button>
    </div>
  )
}

function ItemUnitPriceCell({ item, currency, onChange, className }: {
  item: ShoppingListItem
  currency: string
  onChange: (v: string) => void
  className?: string
}) {
  const amountStep = amountStepFor(currency)
  const [amount, setAmount] = useState(() => fmtAmountInput(item.unit_price ?? '', amountStep))

  useEffect(() => {
    setAmount(fmtAmountInput(item.unit_price ?? '', amountStep))
  }, [item.unit_price, amountStep])

  function commit(raw: string) {
    const parsed = parseAmountInput(raw, amountStep)
    setAmount(fmtAmountInput(parsed, amountStep))
    const current = item.unit_price == null ? '' : String(Number(item.unit_price))
    const next = parsed ? String(Number(parsed)) : ''
    if (next !== current) onChange(parsed || '')
  }

  return (
    <input
      type="text"
      inputMode={amountStep === '1' ? 'numeric' : 'decimal'}
      placeholder={amountStep === '1' ? '0' : '0.00'}
      value={amount}
      onChange={e => setAmount(e.target.value)}
      aria-label="Valor unitario"
      onFocus={e => { setAmount(parseAmountInput(e.currentTarget.value, amountStep)); const el = e.currentTarget; requestAnimationFrame(() => el.select()) }}
      onBlur={e => commit(e.currentTarget.value)}
      className={cn(inputCls, 'text-center', className ?? 'w-28', item.purchased && !item.unit_price && 'border-amber-400 dark:border-amber-500')}
    />
  )
}

// ─── Modal agregar / editar producto ───────────────────────────────────────────

interface ItemFormData {
  label: string
  quantity: string
  unit_price: string | null
  observation: string | null
  obviable: boolean
}

// ─── Editar lista (nombre + fecha de compra) ──────────────────────────────────

function EditListModal({ initialName, initialDate, onClose, onSubmit }: {
  initialName: string
  initialDate: string | null
  onClose: () => void
  onSubmit: (data: { name: string; planned_date: string | null }) => Promise<void>
}) {
  const [name, setName] = useState(initialName)
  const [plannedDate, setPlannedDate] = useState(initialDate ?? '')
  const periodBounds = useOpenPeriodBounds()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSaving(true)
    try { await onSubmit({ name: name.trim(), planned_date: plannedDate || null }) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  return (
    <Modal size="sm" title="Editar lista" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="rl-name" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            id="rl-name" autoFocus value={name} onChange={e => setName(e.target.value)}
            required maxLength={150} className={cn(inputCls, 'w-full')}
          />
        </div>
        <div>
          <label htmlFor="rl-date" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
            Fecha de compra
          </label>
          <input id="rl-date" type="date" value={plannedDate} min={periodBounds.min} max={periodBounds.max} onChange={e => setPlannedDate(e.target.value)} className={cn(inputCls, 'w-full')} />
          <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">
            Dentro del período abierto. Se imputa en Egresos y es la fecha sugerida al enviar. Vacía = hoy.
          </p>
        </div>
        {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
          <button
            type="submit"
            disabled={saving || !name.trim() || (name.trim() === initialName && (plannedDate || null) === initialDate)}
            className={cn(btnBase, 'font-semibold bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60')}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ItemFormModal({ title, submitLabel, currency, initial, onClose, onSubmit }: {
  title: string
  submitLabel: string
  currency: string
  initial?: ItemFormData
  onClose: () => void
  onSubmit: (data: ItemFormData) => Promise<void>
}) {
  const amountStep = amountStepFor(currency)
  const [label, setLabel] = useState(initial?.label ?? '')
  const [quantity, setQuantity] = useState(() => normalizeQuantity(initial?.quantity))
  const [unitPrice, setUnitPrice] = useState(() => fmtAmountInput(initial?.unit_price ?? '', amountStep))
  const [observation, setObservation] = useState(initial?.observation ?? '')
  const [obviable, setObviable] = useState(initial?.obviable ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = Number(normalizeQuantity(quantity)) * (Number(parseAmountInput(unitPrice, amountStep)) || 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSaving(true)
    try {
      await onSubmit({
        label: label.trim(),
        quantity: normalizeQuantity(quantity),
        unit_price: parseAmountInput(unitPrice, amountStep) || null,
        observation: observation.trim() || null,
        obviable,
      })
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  return (
    <Modal size="sm" title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="if-label" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
            Producto <span className="text-red-500">*</span>
          </label>
          <input
            id="if-label" autoFocus value={label} onChange={e => setLabel(e.target.value)}
            placeholder="Ej: Arroz" required className={cn(inputCls, 'w-full')}
          />
        </div>
        <FormGrid className="gap-3">
          <div>
            <label htmlFor="if-qty" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
              Cantidad
            </label>
            <input
              id="if-qty" type="number" min="1" step="1"
              value={quantity} onChange={e => setQuantity(e.target.value)}
              onBlur={e => setQuantity(normalizeQuantity(e.currentTarget.value))}
              className={cn(inputCls, 'w-full')}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="if-price" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
              Precio unitario <span className="hidden font-normal text-gray-400 dark:text-slate-500 sm:inline">(opcional)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                id="if-price" type="text" inputMode={amountStep === '1' ? 'numeric' : 'decimal'}
                placeholder={amountStep === '1' ? '0' : '0.00'}
                value={unitPrice} onChange={e => setUnitPrice(e.target.value.replace(/[^0-9.,]/g, ''))}
                onBlur={e => setUnitPrice(fmtAmountInput(parseAmountInput(e.currentTarget.value, amountStep), amountStep))}
                className={cn(inputCls, 'min-w-0 flex-1')}
              />
              <span className="shrink-0 text-xs text-gray-400 dark:text-slate-500">{currency}</span>
            </div>
          </div>
        </FormGrid>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">Obviable</label>
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
              {obviable ? 'Sí, no es obligatorio comprarlo' : 'No aplica'}
            </span>
            <div className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0', obviable ? 'bg-primary-500' : 'bg-gray-200 dark:bg-slate-600')}>
              <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', obviable ? 'translate-x-[18px]' : 'translate-x-[3px]')} />
            </div>
          </button>
        </div>

        <p className="rounded-xl bg-gray-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-gray-600 dark:text-slate-300">
          Total estimado: <span className="font-semibold text-gray-900 dark:text-slate-100">{fmtMoney(total, currency)}</span>
        </p>
        <div>
          <label htmlFor="if-observation" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
            Observación
          </label>
          <textarea
            id="if-observation"
            value={observation}
            onChange={e => setObservation(e.target.value)}
            placeholder="Ej: otra marca, otro tamaño o nota puntual"
            rows={3}
            className={cn(inputCls, 'w-full resize-none')}
          />
        </div>
        {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
          <button type="submit" disabled={saving || !label.trim()} className={cn(btnBase, 'font-semibold bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60')}>
            {saving ? 'Guardando…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

const ITEM_FILTERS: FilterControlDef[] = [
  { type: 'input', key: 'search', label: 'Buscar', placeholder: 'Nombre del producto…' },
  {
    type: 'radio', key: 'status', label: 'Estado',
    options: [{ value: '', label: 'Todos' }, { value: 'purchased', label: 'Comprados' }, { value: 'pending', label: 'Pendientes' }],
  },
]

type ModalState =
  | { type: 'add-item' }
  | { type: 'edit-item'; item: ShoppingListItem }
  | { type: 'reset' }
  | { type: 'send' }
  | { type: 'edit-list' }
  | null

export function ShoppingListDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // Si se llegó desde otra vista (p. ej. el borrador de la lista en Egresos), "Volver" regresa ahí.
  const backTo = (useLocation().state as { from?: string } | null)?.from ?? '/listas-compra'
  const { user } = useAuth()
  const currency = user?.currency ?? 'CRC'
  const userName = user?.name ?? ''

  const [list, setList] = useState<ShoppingList | null>(null)
  const [categories, setCategories] = useState<UserCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState>(null)
  const [filters, setFilters] = useState<Record<string, string | string[]>>({ search: '', status: '' })

  // Solo la carga inicial muestra "Cargando…": los refrescos tras editar un producto son
  // silenciosos para no desmontar la tabla (se perdían página, orden y posición). El contador
  // descarta respuestas viejas cuando hay varias ediciones seguidas en vuelo.
  const loadSeq = useRef(0)
  const load = useCallback(async (silent = false) => {
    if (!id) return
    const seq = ++loadSeq.current
    if (!silent) setLoading(true)
    try {
      const [nextList, nextCategories] = await Promise.all([
        userApi.shoppingLists.get(id),
        userApi.categories.list(),
      ])
      if (seq !== loadSeq.current) return
      setList(nextList)
      setCategories(nextCategories)
    } finally { if (!silent) setLoading(false) }
  }, [id])

  const refresh = useCallback(() => load(true), [load])

  /** Refleja el cambio del producto al instante y luego sincroniza los totales con el backend. */
  async function patchItem(item: ShoppingListItem, data: Partial<Pick<ShoppingListItem, 'purchased' | 'unit_price' | 'quantity' | 'obviable'>>) {
    if (!id) return
    loadSeq.current++  // invalida cualquier refresco en vuelo con el estado anterior
    setList(prev => prev && { ...prev, items: prev.items.map(i => i.id === item.id ? { ...i, ...data } : i) })
    try {
      await userApi.shoppingLists.items.update(id, item.id, data)
    } finally {
      await refresh()
    }
  }

  useEffect(() => { load() }, [load])

  async function addItem(data: ItemFormData) {
    if (!id) return
    await userApi.shoppingLists.items.create(id, data)
    setModal(null)
    await refresh()
  }

  async function updateItemForm(item: ShoppingListItem, data: ItemFormData) {
    if (!id) return
    await userApi.shoppingLists.items.update(id, item.id, data)
    setModal(null)
    await refresh()
  }

  function toggleItem(item: ShoppingListItem) {
    return patchItem(item, { purchased: !item.purchased })
  }

  function updateItemUnitPrice(item: ShoppingListItem, value: string) {
    return patchItem(item, { unit_price: value || null })
  }

  function updateItemQuantity(item: ShoppingListItem, value: string) {
    return patchItem(item, { quantity: value })
  }

  async function deleteItem(item: ShoppingListItem) {
    if (!id) return
    await userApi.shoppingLists.items.delete(id, item.id)
    await refresh()
  }

  function toggleItemObviable(item: ShoppingListItem) {
    return patchItem(item, { obviable: !item.obviable })
  }

  async function handleEditList(data: { name: string; planned_date: string | null }) {
    if (!id) return
    await userApi.shoppingLists.update(id, data)
    setModal(null)
    await refresh()
  }

  async function handleReset() {
    if (!id) return
    await userApi.shoppingLists.reset(id)
    setModal(null)
    await refresh()
  }

  if (loading || !list) {
    return <p className="text-sm text-gray-400 dark:text-slate-500">Cargando…</p>
  }

  const purchasedAmount = purchasedTotal(list.items)
  const wasSent = list.items.some(i => i.sent_at)
  const pendingCount = list.item_count - list.purchased_count

  const filteredItems = list.items.filter(item => {
    const s = (filters.search as string).toLowerCase()
    if (s && !item.label.toLowerCase().includes(s)) return false
    if (filters.status === 'purchased' && !item.purchased) return false
    if (filters.status === 'pending' && item.purchased) return false
    return true
  })

  const columns: Column<ShoppingListItem>[] = [
    {
      key: 'purchased', label: 'Comprado', sortable: true,
      className: 'text-center', headerClassName: 'text-center',
      render: item => (
        <input
          type="checkbox" checked={item.purchased} onChange={() => toggleItem(item)}
          className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-400 dark:border-slate-600"
        />
      ),
    },
    {
      key: 'label', label: 'Producto', sortable: true,
      render: item => (
        <span className={cn('text-sm', item.purchased ? 'text-gray-400 line-through dark:text-slate-500' : 'text-gray-800 dark:text-slate-200')}>
          {item.label}
        </span>
      ),
    },
    {
      key: 'quantity', label: 'Cantidad', sortable: true,
      sortValue: item => Number(item.quantity),
      className: 'text-center', headerClassName: 'text-center [&>span]:justify-center',
      render: item => <ItemQuantityCell item={item} onChange={v => updateItemQuantity(item, v)} />,
    },
    {
      key: 'unit_price', label: 'Valor unitario', sortable: true,
      sortValue: item => item.unit_price == null ? null : Number(item.unit_price),
      className: 'text-center', headerClassName: 'text-center [&>span]:justify-center',
      render: item => <ItemUnitPriceCell item={item} currency={currency} onChange={v => updateItemUnitPrice(item, v)} />,
    },
    {
      key: 'total', label: 'Total', sortable: true,
      sortValue: item => item.unit_price == null ? null : Number(item.quantity) * Number(item.unit_price),
      className: 'text-right', headerClassName: 'text-right',
      render: item => (
        <span className="text-sm font-medium tabular-nums text-gray-700 dark:text-slate-300">
          {item.unit_price ? fmtMoney(Number(item.quantity) * Number(item.unit_price), currency) : '—'}
        </span>
      ),
    },
    {
      key: 'obviable', label: 'Obviable', sortable: true,
      className: 'text-center', headerClassName: 'text-center',
      render: item => item.obviable ? (
        <span className="inline-flex rounded-full bg-gray-100 dark:bg-slate-700 px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-slate-300">Sí</span>
      ) : (
        <span className="inline-flex rounded-full bg-gray-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-medium text-gray-400">No</span>
      ),
    },
    {
      key: 'sent_at', label: 'Estado', sortable: true,
      className: 'text-center', headerClassName: 'text-center',
      render: item => item.sent_at ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <Check size={9} /> Enviado
        </span>
      ) : (
        <span className="text-xs text-gray-300 dark:text-slate-600">—</span>
      ),
    },
  ]

  // Tarjeta para teléfono: check grande + nombre; cantidad con − / + y valor a mano; total.
  function renderItemCard(item: ShoppingListItem) {
    const total = item.unit_price ? Number(item.quantity) * Number(item.unit_price) : null
    return (
      <div className="space-y-2.5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox" checked={item.purchased} onChange={() => toggleItem(item)}
            aria-label={item.purchased ? 'Desmarcar comprado' : 'Marcar comprado'}
            className="mt-0.5 h-6 w-6 shrink-0 rounded border-gray-300 text-primary-500 accent-primary-500 focus:ring-primary-400 dark:border-slate-600"
          />
          <span className="min-w-0 flex-1">
            <span className={cn('block break-words font-medium', item.purchased ? 'text-gray-400 line-through dark:text-slate-500' : 'text-gray-900 dark:text-slate-100')}>
              {item.label}
            </span>
            {item.observation && <span className="mt-0.5 block text-xs text-gray-500 dark:text-slate-400">{item.observation}</span>}
            {(item.obviable || item.sent_at) && (
              <span className="mt-1 flex flex-wrap gap-1.5">
                {item.obviable && <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-slate-700 dark:text-slate-300">Obviable</span>}
                {item.sent_at && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <Check size={9} /> Enviado
                  </span>
                )}
              </span>
            )}
          </span>
        </label>
        <div className="flex items-center gap-2">
          <ItemQuantityCell item={item} stepper onChange={v => updateItemQuantity(item, v)} />
          <ItemUnitPriceCell item={item} currency={currency} className="h-9 min-w-0 flex-1" onChange={v => updateItemUnitPrice(item, v)} />
        </div>
        <div className="flex items-center justify-between text-sm">
          {item.purchased && !item.unit_price
            ? <span className="text-xs text-amber-600 dark:text-amber-400">Falta el valor</span>
            : <span />}
          <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">{total !== null ? fmtMoney(total, currency) : '—'}</span>
        </div>
      </div>
    )
  }

  const itemActions: RowAction<ShoppingListItem>[] = [
    { icon: Pencil, label: 'Editar', onClick: item => setModal({ type: 'edit-item', item }) },
    {
      icon: Repeat,
      label: item => item.obviable ? 'Obviable: Sí' : 'Obviable: No',
      onClick: toggleItemObviable,
    },
    { icon: Trash2, label: 'Eliminar', variant: 'danger', onClick: deleteItem },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 break-words text-xl font-semibold text-gray-900 dark:text-slate-100">{list.name}</h1>
            <button
              onClick={() => setModal({ type: 'edit-list' })}
              title="Editar lista"
              aria-label="Editar lista"
              className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <Pencil size={15} />
            </button>
          </div>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            {list.purchased_count} de {list.item_count} productos comprados · Total comprado: {fmtMoney(purchasedAmount, currency)}
            {list.planned_date && <> · Fecha de compra: {list.planned_date.split('-').reverse().join('/')}</>}
          </p>
        </div>
        <SentStatusBadge sent={wasSent} />
      </div>

      <div className="hidden sm:block">
      <KpiGrid cols={4}>
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-soft">
          <p className="text-xs text-gray-500 dark:text-slate-400">Total productos</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-slate-100">{list.item_count}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-soft">
          <p className="text-xs text-gray-500 dark:text-slate-400">Comprados</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-green-600 dark:text-green-400">{list.purchased_count}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-soft">
          <p className="text-xs text-gray-500 dark:text-slate-400">Pendientes</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">{pendingCount}</p>
        </div>
        <KpiCard label="Total comprado" amount={purchasedAmount} currency={currency} color="text-primary-600 dark:text-primary-400" />
      </KpiGrid>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button onClick={() => navigate(backTo)} className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-slate-800">
          <ArrowLeft size={14} /> Volver
        </button>
        <button onClick={() => setModal({ type: 'reset' })} className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-slate-800">
          <RotateCcw size={14} /> Reiniciar lista
        </button>
        <button
          onClick={() => setModal({ type: 'send' })}
          disabled={list.pending_send_count === 0}
          className="hidden items-center gap-1.5 rounded-xl bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60 sm:flex"
        >
          <Send size={14} /> Enviar a egreso
        </button>
      </div>

      <FilterBar
        controls={ITEM_FILTERS}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onClear={() => setFilters({ search: '', status: '' })}
        actions={[
          { label: 'Agregar producto', icon: Plus, onClick: () => setModal({ type: 'add-item' }) },
        ]}
      />

      <DataTable
        data={filteredItems}
        columns={columns}
        actions={itemActions}
        rowKey={item => item.id}
        pageResetKey={JSON.stringify(filters)}
        renderCard={renderItemCard}
        emptyMessage={list.items.length === 0 ? 'Todavía no agregaste productos a esta lista.' : 'Ningún producto coincide con los filtros.'}
      />

      {/* Barra inferior fija (mobile): progreso, total y envío siempre a mano */}
      <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-gray-100 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 sm:hidden">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-slate-400">{list.purchased_count} de {list.item_count} comprados</p>
          <p className="font-semibold tabular-nums text-gray-900 dark:text-slate-100">{fmtMoney(purchasedAmount, currency)}</p>
        </div>
        <button
          onClick={() => setModal({ type: 'send' })}
          disabled={list.pending_send_count === 0}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send size={15} /> Enviar a egreso
        </button>
      </div>

      {modal?.type === 'add-item' && (
        <ItemFormModal
          title="Agregar producto" submitLabel="Agregar" currency={currency}
          onClose={() => setModal(null)} onSubmit={addItem}
        />
      )}

      {modal?.type === 'edit-item' && (
        <ItemFormModal
          title="Editar producto" submitLabel="Guardar" currency={currency}
          initial={{
            label: modal.item.label,
            quantity: modal.item.quantity,
            unit_price: modal.item.unit_price,
            observation: modal.item.observation,
            obviable: modal.item.obviable,
          }}
          onClose={() => setModal(null)}
          onSubmit={data => updateItemForm(modal.item, data)}
        />
      )}

      {modal?.type === 'edit-list' && (
        <EditListModal initialName={list.name} initialDate={list.planned_date} onClose={() => setModal(null)} onSubmit={handleEditList} />
      )}

      {modal?.type === 'reset' && (
        <Modal size="sm" title="Reiniciar lista" onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Se desmarcarán los {list.purchased_count} productos comprados y se borrarán sus montos,
            dejando la lista lista para la próxima compra. Esta acción no afecta a los egresos ya generados.
          </p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setModal(null)} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
            <button onClick={handleReset} className={cn(btnBase, 'font-semibold bg-primary-500 text-white hover:bg-primary-600')}>Reiniciar</button>
          </div>
        </Modal>
      )}

      {modal?.type === 'send' && (
        <ShoppingListSendToExpenseModal
          list={list}
          categories={categories}
          currency={currency}
          defaultResponsible={userName}
          onClose={() => setModal(null)}
          onSuccess={async outcome => {
            setModal(null)
            if (outcome === 'deleted') navigate(backTo)
            else await refresh()
          }}
        />
      )}
    </div>
  )
}
