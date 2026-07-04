import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Trash2, Plus, RotateCcw, X, Pencil, Check, Repeat, Send,
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
import { amountStepFor, parseAmountInput, fmtAmountInput } from '@/lib/money'
import { ShoppingListSendToExpenseModal } from '@/components/ShoppingListSendToExpenseModal'

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

// ─── Modal genérico ───────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-xl">
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

function ItemQuantityCell({ item, onChange }: { item: ShoppingListItem; onChange: (v: string) => void }) {
  const [value, setValue] = useState(() => normalizeQuantity(item.quantity))

  useEffect(() => { setValue(normalizeQuantity(item.quantity)) }, [item.quantity])

  function commit(raw: string) {
    const normalized = normalizeQuantity(raw, normalizeQuantity(item.quantity))
    setValue(normalized)
    if (normalized !== normalizeQuantity(item.quantity)) onChange(normalized)
  }

  return (
    <input
      type="number"
      min="1"
      step="1"
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={e => commit(e.currentTarget.value)}
      className={cn(inputCls, 'w-20 text-center')}
    />
  )
}

function ItemUnitPriceCell({ item, currency, onChange }: {
  item: ShoppingListItem
  currency: string
  onChange: (v: string) => void
}) {
  const amountStep = amountStepFor(currency)
  const [amount, setAmount] = useState(() => fmtAmountInput(item.unit_price ?? '', amountStep))

  useEffect(() => {
    setAmount(fmtAmountInput(item.unit_price ?? '', amountStep))
  }, [item.unit_price, amountStep])

  function commit(raw: string) {
    const parsed = parseAmountInput(raw, amountStep)
    setAmount(fmtAmountInput(parsed, amountStep))
    onChange(parsed || '')
  }

  return (
    <input
      type="text"
      inputMode={amountStep === '1' ? 'numeric' : 'decimal'}
      placeholder={amountStep === '1' ? '0' : '0.00'}
      value={amount}
      onChange={e => setAmount(e.target.value)}
      onFocus={e => setAmount(parseAmountInput(e.currentTarget.value, amountStep))}
      onBlur={e => commit(e.currentTarget.value)}
      className={cn(inputCls, 'w-28 text-center')}
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
    <Modal title={title} onClose={onClose}>
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
        <div className="grid grid-cols-2 gap-3">
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
              Precio unitario <span className="font-normal text-gray-400 dark:text-slate-500">(opcional)</span>
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
        </div>

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
  | null

export function ShoppingListDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const currency = user?.currency ?? 'CRC'
  const userName = user?.name ?? ''

  const [list, setList] = useState<ShoppingList | null>(null)
  const [categories, setCategories] = useState<UserCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState>(null)
  const [filters, setFilters] = useState<Record<string, string | string[]>>({ search: '', status: '' })

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [nextList, nextCategories] = await Promise.all([
        userApi.shoppingLists.get(id),
        userApi.categories.list(),
      ])
      setList(nextList)
      setCategories(nextCategories)
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  async function addItem(data: ItemFormData) {
    if (!id) return
    await userApi.shoppingLists.items.create(id, data)
    setModal(null)
    await load()
  }

  async function updateItemForm(item: ShoppingListItem, data: ItemFormData) {
    if (!id) return
    await userApi.shoppingLists.items.update(id, item.id, data)
    setModal(null)
    await load()
  }

  async function toggleItem(item: ShoppingListItem) {
    if (!id) return
    await userApi.shoppingLists.items.update(id, item.id, { purchased: !item.purchased })
    await load()
  }

  async function updateItemUnitPrice(item: ShoppingListItem, value: string) {
    if (!id) return
    await userApi.shoppingLists.items.update(id, item.id, { unit_price: value || null })
    await load()
  }

  async function updateItemQuantity(item: ShoppingListItem, value: string) {
    if (!id) return
    await userApi.shoppingLists.items.update(id, item.id, { quantity: value })
    await load()
  }

  async function deleteItem(item: ShoppingListItem) {
    if (!id) return
    await userApi.shoppingLists.items.delete(id, item.id)
    await load()
  }

  async function toggleItemObviable(item: ShoppingListItem) {
    if (!id) return
    await userApi.shoppingLists.items.update(id, item.id, { obviable: !item.obviable })
    await load()
  }

  async function handleReset() {
    if (!id) return
    await userApi.shoppingLists.reset(id)
    setModal(null)
    await load()
  }

  if (loading || !list) {
    return <p className="text-sm text-gray-400 dark:text-slate-500">Cargando…</p>
  }

  const purchasedTotal = list.items
    .filter(i => i.purchased)
    .reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price ?? 0), 0)
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
      className: 'text-center', headerClassName: 'text-center [&>span]:justify-center',
      render: item => <ItemQuantityCell item={item} onChange={v => updateItemQuantity(item, v)} />,
    },
    {
      key: 'unit_price', label: 'Valor unitario',
      className: 'text-center', headerClassName: 'text-center [&>span]:justify-center',
      render: item => <ItemUnitPriceCell item={item} currency={currency} onChange={v => updateItemUnitPrice(item, v)} />,
    },
    {
      key: 'total', label: 'Total', sortable: true,
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
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">{list.name}</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
            {list.purchased_count} de {list.item_count} productos comprados · Total comprado: {fmtMoney(purchasedTotal, currency)}
          </p>
        </div>
        <SentStatusBadge sent={wasSent} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
        <KpiCard label="Total comprado" amount={purchasedTotal} currency={currency} color="text-primary-600 dark:text-primary-400" />
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={() => navigate('/listas-compra')} className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-slate-800">
          <ArrowLeft size={14} /> Volver
        </button>
        <button onClick={() => setModal({ type: 'reset' })} className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-slate-800">
          <RotateCcw size={14} /> Reiniciar lista
        </button>
        <button
          onClick={() => setModal({ type: 'send' })}
          disabled={list.pending_send_count === 0}
          className="flex items-center gap-1.5 rounded-xl bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
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
        emptyMessage={list.items.length === 0 ? 'Todavía no agregaste productos a esta lista.' : 'Ningún producto coincide con los filtros.'}
      />

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

      {modal?.type === 'reset' && (
        <Modal title="Reiniciar lista" onClose={() => setModal(null)}>
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
          onSuccess={async () => {
            setModal(null)
            await load()
          }}
        />
      )}
    </div>
  )
}
