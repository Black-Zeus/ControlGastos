import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderOpen, Copy, Archive, ArchiveRestore, Trash2, X, RefreshCw, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  userApi,
  type ShoppingList, type ShoppingListCreatePayload, type UserCategory,
} from '@/lib/userApi'
import { DataTable, type Column, type RowAction } from '@/components/ui/DataTable'
import { FilterBar, type FilterControlDef } from '@/components/ui/FilterBar'
import { ShoppingListSendToExpenseModal } from '@/components/ShoppingListSendToExpenseModal'
import { useAuth } from '@/contexts/AuthContext'

// ─── Modal genérico (mismo patrón que CatalogsPage/ExpensesPage) ──────────────

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

function Field({ label, id, placeholder, required, value, onChange }: {
  label: string; id: string; placeholder?: string
  required?: boolean; value: string; onChange: (v: string) => void
}) {
  const cls = cn(
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900',
    'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500',
    'placeholder:text-gray-400 outline-none transition-colors',
    'focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:border-primary-500 dark:focus:ring-primary-900/30',
  )
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input id={id} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} className={cls} />
    </div>
  )
}

const btnBase = 'flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors'
const selectCls = cn(
  'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors',
  'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
  'focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:border-primary-500 dark:focus:ring-primary-900/30',
)

// ─── Badges ───────────────────────────────────────────────────────────────────

function ArchivedBadge({ archived }: { archived: boolean }) {
  return archived ? (
    <span className="inline-flex rounded-full bg-gray-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-slate-400">Archivada</span>
  ) : (
    <span className="inline-flex rounded-full bg-green-50 dark:bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">Activa</span>
  )
}

function ProcessingStatusBadge({ list }: { list: ShoppingList }) {
  if (list.purchased_count === 0) {
    return (
      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-slate-700 dark:text-slate-400">
        Sin compras
      </span>
    )
  }
  if (list.pending_send_count === 0) {
    return (
      <span className="inline-flex rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
        Procesada
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      En proceso
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Formulario de creación ───────────────────────────────────────────────────

function CreateForm({ categories, onSubmit, onCancel }: {
  categories: UserCategory[]
  onSubmit: (data: ShoppingListCreatePayload) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSaving(true)
    try { await onSubmit({ name, default_category_id: categoryId || null }) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Nombre" id="sl-name" value={name} onChange={setName} placeholder="Ej: Supermercado semanal" required />
      <div>
        <label htmlFor="sl-cat" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
          Categoría por defecto <span className="font-normal text-gray-400 dark:text-slate-500">(opcional)</span>
        </label>
        <select id="sl-cat" value={categoryId} onChange={e => setCategoryId(e.target.value)} className={selectCls}>
          <option value="">Sin categoría por defecto</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">
          Se usará al enviar la lista a egreso, si no indicas otra en ese momento.
        </p>
      </div>
      {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
        <button type="submit" disabled={saving || !name.trim()} className={cn(btnBase, 'font-semibold bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60')}>
          {saving ? 'Creando…' : 'Crear lista'}
        </button>
      </div>
    </form>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

const FILTERS: FilterControlDef[] = [
  { type: 'input', key: 'search', label: 'Buscar', placeholder: 'Nombre de la lista…' },
  {
    type: 'radio', key: 'archived', label: 'Estado',
    options: [{ value: '', label: 'Activas' }, { value: 'archived', label: 'Archivadas' }],
  },
]

type ModalState =
  | { type: 'create' }
  | { type: 'clone'; list: ShoppingList }
  | { type: 'archive'; list: ShoppingList }
  | { type: 'delete'; list: ShoppingList }
  | { type: 'send'; list: ShoppingList }
  | null

export function ShoppingListsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const currency = user?.currency ?? 'CRC'
  const userName = user?.name ?? ''
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [categories, setCategories] = useState<UserCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Record<string, string | string[]>>({ search: '', archived: '' })
  const [modal, setModal] = useState<ModalState>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const showArchived = filters.archived === 'archived'
      const [ls, cats] = await Promise.all([
        userApi.shoppingLists.list(showArchived),
        userApi.categories.list(),
      ])
      setLists(ls)
      setCategories(cats.filter(c => c.active))
    } finally { setLoading(false) }
  }, [filters.archived])

  useEffect(() => { load() }, [load])

  const filtered = lists.filter(l => {
    const s = (filters.search as string).toLowerCase()
    if (s && !l.name.toLowerCase().includes(s)) return false
    return true
  })

  async function handleArchiveToggle(list: ShoppingList) {
    try {
      await userApi.shoppingLists.update(list.id, { archived: !list.archived })
      setModal(null)
      await load()
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function handleClone(list: ShoppingList) {
    try {
      await userApi.shoppingLists.clone(list.id)
      setModal(null)
      await load()
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function handleDelete(list: ShoppingList) {
    try {
      await userApi.shoppingLists.delete(list.id)
      setModal(null)
      await load()
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  const columns: Column<ShoppingList>[] = [
    {
      key: 'name', label: 'Nombre', sortable: true,
      render: l => <span className="font-medium text-gray-900 dark:text-slate-100">{l.name}</span>,
    },
    {
      key: 'purchased_count', label: 'Progreso', sortable: true,
      render: l => (
        <span className="text-sm text-gray-600 dark:text-slate-400">
          {l.purchased_count} / {l.item_count} comprados
        </span>
      ),
    },
    { key: 'archived', label: 'Archivo', sortable: true, render: l => <ArchivedBadge archived={l.archived} /> },
    { key: 'process_status', label: 'Estado', render: l => <ProcessingStatusBadge list={l} /> },
    {
      key: 'last_sent_at', label: 'Último envío', sortable: true,
      render: l => (
        <span className="text-sm text-gray-500 dark:text-slate-400">
          {l.last_sent_at ? fmtDate(l.last_sent_at) : '—'}
        </span>
      ),
    },
  ]

  const actions: RowAction<ShoppingList>[] = [
    { icon: FolderOpen, label: 'Abrir', onClick: l => navigate(`/listas-compra/${l.id}`) },
    { icon: Copy, label: 'Clonar', onClick: l => setModal({ type: 'clone', list: l }) },
    {
      icon: Send,
      label: 'Enviar a egreso',
      disabled: l => l.pending_send_count === 0,
      onClick: l => setModal({ type: 'send', list: l }),
    },
    {
      icon: (l: ShoppingList) => l.archived ? ArchiveRestore : Archive,
      label: l => l.archived ? 'Desarchivar' : 'Archivar',
      onClick: l => setModal({ type: 'archive', list: l }),
    },
    { icon: Trash2, label: 'Eliminar', variant: 'danger', onClick: l => setModal({ type: 'delete', list: l }) },
  ]

  const stats = {
    total:     lists.length,
    items:     lists.reduce((sum, l) => sum + l.item_count, 0),
    purchased: lists.reduce((sum, l) => sum + l.purchased_count, 0),
    pending:   lists.reduce((sum, l) => sum + l.pending_send_count, 0),
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Listas de compra</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Listas',                value: stats.total,     color: 'text-gray-900 dark:text-slate-100' },
          { label: 'Productos',             value: stats.items,     color: 'text-gray-900 dark:text-slate-100' },
          { label: 'Comprados',              value: stats.purchased, color: 'text-green-600 dark:text-green-400' },
          { label: 'Pendientes de envío',    value: stats.pending,   color: 'text-amber-600 dark:text-amber-400' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-soft">
            <p className="text-xs text-gray-500 dark:text-slate-400">{s.label}</p>
            <p className={cn('mt-1 text-xl font-semibold tabular-nums', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <FilterBar
        controls={FILTERS}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onClear={() => setFilters({ search: '', archived: '' })}
        actions={[
          { label: 'Actualizar', icon: RefreshCw, onClick: load, variant: 'outline' as const },
          { label: 'Nueva lista', icon: Plus, onClick: () => setModal({ type: 'create' }) },
        ]}
      />

      <DataTable
        data={filtered}
        columns={columns}
        actions={actions}
        rowKey={l => l.id}
        loading={loading}
        emptyMessage="No hay listas de compra que coincidan con los filtros"
      />

      {modal?.type === 'create' && (
        <Modal title="Nueva lista de compra" onClose={() => setModal(null)}>
          <CreateForm
            categories={categories}
            onCancel={() => setModal(null)}
            onSubmit={async data => {
              const created = await userApi.shoppingLists.create(data)
              setModal(null)
              await load()
              navigate(`/listas-compra/${created.id}`)
            }}
          />
        </Modal>
      )}

      {modal?.type === 'clone' && (
        <Modal title="Clonar lista" onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Se creará una copia de <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.list.name}"</span> con
            los mismos productos, sin marcar ninguno como comprado.
          </p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setModal(null)} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
            <button onClick={() => handleClone(modal.list)} className={cn(btnBase, 'font-semibold bg-primary-500 text-white hover:bg-primary-600')}>Clonar</button>
          </div>
        </Modal>
      )}

      {modal?.type === 'send' && (
        <ShoppingListSendToExpenseModal
          list={modal.list}
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

      {modal?.type === 'archive' && (
        <Modal title={modal.list.archived ? 'Desarchivar lista' : 'Archivar lista'} onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            {modal.list.archived
              ? <>¿Desarchivar <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.list.name}"</span>? Volverá a aparecer entre las listas activas.</>
              : <>¿Archivar <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.list.name}"</span>? Deja de aparecer entre las activas, pero puedes desarchivarla cuando quieras.</>
            }
          </p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setModal(null)} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
            <button onClick={() => handleArchiveToggle(modal.list)} className={cn(btnBase, 'font-semibold bg-primary-500 text-white hover:bg-primary-600')}>
              {modal.list.archived ? 'Desarchivar' : 'Archivar'}
            </button>
          </div>
        </Modal>
      )}

      {modal?.type === 'delete' && (
        <Modal title="Eliminar lista" onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            ¿Eliminar <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.list.name}"</span>?
            Los egresos que ya generó esta lista no se ven afectados.
          </p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setModal(null)} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
            <button onClick={() => handleDelete(modal.list)} className={cn(btnBase, 'font-semibold bg-red-500 text-white hover:bg-red-600')}>Eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
