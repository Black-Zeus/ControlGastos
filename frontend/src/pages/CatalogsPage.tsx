import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, X, Tags, TrendingUp, ToggleLeft, ToggleRight, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  userApi,
  type UserCategory, type CategoryCreatePayload, type CategoryUpdatePayload,
  type UserIncomeType,
} from '@/lib/userApi'
import { DataTable, type Column, type RowAction } from '@/components/ui/DataTable'
import { FilterBar, type FilterControlDef } from '@/components/ui/FilterBar'

// ─── Badges ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: 'recurrente' | 'puntual' }) {
  return type === 'recurrente' ? (
    <span className="inline-flex rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">Recurrente</span>
  ) : (
    <span className="inline-flex rounded-full bg-amber-50 dark:bg-amber-900/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Puntual</span>
  )
}

function SourceBadge({ isSystem }: { isSystem: boolean }) {
  return isSystem ? (
    <span className="inline-flex rounded-full bg-gray-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-slate-400">Sistema</span>
  ) : (
    <span className="inline-flex rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-0.5 text-xs font-medium text-primary-600 dark:text-primary-400">Personal</span>
  )
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex rounded-full bg-green-50 dark:bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">Activa</span>
  ) : (
    <span className="inline-flex rounded-full bg-gray-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-slate-400">Inactiva</span>
  )
}

function ActiveBadgeIT({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex rounded-full bg-green-50 dark:bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">Activo</span>
  ) : (
    <span className="inline-flex rounded-full bg-gray-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-slate-400">Inactivo</span>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

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

// ─── Campo genérico ───────────────────────────────────────────────────────────

function Field({ label, id, type = 'text', placeholder, required, value, onChange }: {
  label: string; id: string; type?: string; placeholder?: string
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
      <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} className={cls} />
    </div>
  )
}

const btnBase = 'flex-1 rounded-xl py-2.5 text-sm font-medium transition-colors'

// ─────────────────────────────────────────────────────────────────────────────
// TAB: CATEGORÍAS
// ─────────────────────────────────────────────────────────────────────────────

const CAT_FILTERS: FilterControlDef[] = [
  { type: 'input',  key: 'search', label: 'Buscar', placeholder: 'Nombre o descripción…' },
  {
    type: 'radio', key: 'type', label: 'Tipo',
    options: [{ value: '', label: 'Todas' }, { value: 'recurrente', label: 'Recurrentes' }, { value: 'puntual', label: 'Puntuales' }],
  },
  {
    type: 'radio', key: 'source', label: 'Origen',
    options: [{ value: '', label: 'Todas' }, { value: 'system', label: 'Sistema' }, { value: 'personal', label: 'Personal' }],
  },
  {
    type: 'radio', key: 'status', label: 'Estado',
    options: [{ value: '', label: 'Todas' }, { value: 'active', label: 'Activas' }, { value: 'inactive', label: 'Inactivas' }],
  },
]

type CatFilters = Record<string, string | string[]>
type CatModal = { type: 'create' } | { type: 'edit'; cat: UserCategory } | { type: 'delete'; cat: UserCategory } | { type: 'toggle'; cat: UserCategory } | null

function CategoryForm({
  initial, onSubmit, onCancel, submitLabel,
}: {
  initial?: Partial<CategoryCreatePayload>
  onSubmit: (data: CategoryCreatePayload) => Promise<void>
  onCancel: () => void
  submitLabel: string
}) {
  const [name, setName]               = useState(initial?.name ?? '')
  const [type, setType]               = useState<'recurrente' | 'puntual'>(initial?.type ?? 'puntual')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [obviable, setObviable]       = useState(initial?.default_obviable ?? false)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSaving(true)
    try { await onSubmit({ name, type, description: description || null, default_obviable: obviable }) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  const toggleCls = (on: boolean) => cn(
    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
    on ? 'bg-primary-500' : 'bg-gray-200 dark:bg-slate-600',
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Nombre" id="cf-name" value={name} onChange={setName} placeholder="Ej: Supermercado" required />

      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-slate-300">Tipo</p>
        <div className="flex gap-2">
          {(['recurrente', 'puntual'] as const).map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={cn(
                'flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium capitalize transition-colors',
                type === t
                  ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
              )}>{t}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">
          {type === 'recurrente' ? 'Gasto que se repite mensualmente' : 'Gasto esporádico o eventual'}
        </p>
      </div>

      <Field label="Descripción" id="cf-desc" value={description as string} onChange={setDescription} placeholder="Descripción breve (opcional)" />

      <div className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-slate-800 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Obviable</p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500">Puede marcarse como gasto no esencial</p>
        </div>
        <button type="button" onClick={() => setObviable(v => !v)} className={toggleCls(obviable)}>
          <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', obviable ? 'translate-x-[18px]' : 'translate-x-[3px]')} />
        </button>
      </div>

      {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
        <button type="submit" disabled={saving} className={cn(btnBase, 'font-semibold bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60')}>
          {saving ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

function CategoriesTab() {
  const [cats, setCats]       = useState<UserCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<CatFilters>({ search: '', type: '', source: '', status: '' })
  const [modal, setModal]     = useState<CatModal>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setCats(await userApi.categories.list()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = cats.filter(c => {
    const s = (filters.search as string).toLowerCase()
    if (s && !c.name.toLowerCase().includes(s) && !(c.description ?? '').toLowerCase().includes(s)) return false
    if (filters.type   && c.type !== filters.type) return false
    if (filters.source === 'system'   && !c.is_system) return false
    if (filters.source === 'personal' && c.is_system)  return false
    if (filters.status === 'active'   && !c.active)    return false
    if (filters.status === 'inactive' && c.active)     return false
    return true
  })

  async function toggleActive(cat: UserCategory) {
    try {
      const res = await userApi.categories.toggle(cat.id)
      setCats(prev => prev.map(c => c.id === cat.id ? { ...c, active: res.active } : c))
      setModal(null)
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function handleDelete(cat: UserCategory) {
    try {
      await userApi.categories.delete(cat.id)
      setCats(prev => prev.filter(c => c.id !== cat.id))
      setModal(null)
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  const stats = {
    total:    cats.length,
    system:   cats.filter(c => c.is_system).length,
    personal: cats.filter(c => !c.is_system).length,
    active:   cats.filter(c => c.active).length,
  }

  const columns: Column<UserCategory>[] = [
    {
      key: 'name', label: 'Nombre', sortable: true,
      render: c => (
        <div>
          <p className="font-medium text-gray-900 dark:text-slate-100">{c.name}</p>
          {c.description && <p className="mt-0.5 max-w-[200px] truncate text-xs text-gray-400 dark:text-slate-500">{c.description}</p>}
        </div>
      ),
    },
    { key: 'type',     label: 'Tipo',    sortable: true, render: c => <TypeBadge type={c.type} /> },
    {
      key: 'default_obviable', label: 'Obviable', sortable: true,
      render: c => (
        <span className={cn('text-sm', c.default_obviable ? 'text-gray-700 dark:text-slate-300' : 'text-gray-300 dark:text-slate-600')}>
          {c.default_obviable ? 'Sí' : 'No'}
        </span>
      ),
    },
    { key: 'is_system', label: 'Origen', sortable: true, render: c => <SourceBadge isSystem={c.is_system} /> },
    { key: 'active',    label: 'Estado', sortable: true, render: c => <ActiveBadge active={c.active} /> },
  ]

  const actions: RowAction<UserCategory>[] = [
    {
      icon:    (c: UserCategory) => c.active ? ToggleLeft : ToggleRight,
      label:   c => c.active ? 'Desactivar' : 'Activar',
      variant: c => c.active ? 'danger' : 'default',
      onClick: cat => setModal({ type: 'toggle', cat }),
    },
    {
      icon: Pencil, label: 'Editar',
      onClick: cat => setModal({ type: 'edit', cat }),
      disabled: cat => cat.is_system,
    },
    {
      icon: Trash2, label: 'Eliminar', variant: 'danger',
      onClick: cat => setModal({ type: 'delete', cat }),
      disabled: cat => cat.is_system,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Mini KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total',    value: stats.total,    color: 'text-gray-900 dark:text-slate-100' },
          { label: 'Sistema',  value: stats.system,   color: 'text-gray-500 dark:text-slate-400' },
          { label: 'Personal', value: stats.personal, color: 'text-primary-600 dark:text-primary-400' },
          { label: 'Activas',  value: stats.active,   color: 'text-green-600 dark:text-green-400' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white dark:bg-slate-900 p-3 shadow-soft">
            <p className="text-xs text-gray-500 dark:text-slate-400">{s.label}</p>
            <p className={cn('mt-0.5 text-xl font-semibold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <FilterBar
        controls={CAT_FILTERS}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onClear={() => setFilters({ search: '', type: '', source: '', status: '' })}
        actions={[
          { label: 'Actualizar', icon: RefreshCw, onClick: load, variant: 'outline' as const },
          { label: 'Nueva categoría', icon: Plus, onClick: () => setModal({ type: 'create' }) },
        ]}
      />

      <DataTable
        data={filtered}
        columns={columns}
        actions={actions}
        rowKey={c => c.id}
        loading={loading}
        emptyMessage="No hay categorías que coincidan con los filtros"
      />

      {modal?.type === 'create' && (
        <Modal title="Nueva categoría personal" onClose={() => setModal(null)}>
          <CategoryForm submitLabel="Crear" onCancel={() => setModal(null)}
            onSubmit={async data => {
              await userApi.categories.create(data)
              setModal(null)
              await load()
            }}
          />
        </Modal>
      )}
      {modal?.type === 'edit' && (
        <Modal title={`Editar — ${modal.cat.name}`} onClose={() => setModal(null)}>
          <CategoryForm initial={modal.cat as CategoryUpdatePayload} submitLabel="Guardar" onCancel={() => setModal(null)}
            onSubmit={async data => {
              await userApi.categories.update(modal.cat.id, data)
              setModal(null)
              await load()
            }}
          />
        </Modal>
      )}
      {modal?.type === 'toggle' && (
        <Modal title={modal.cat.active ? 'Desactivar categoría' : 'Activar categoría'} onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            {modal.cat.active
              ? <>¿Desactivar <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.cat.name}"</span>? Dejará de aparecer en el formulario de egresos.</>
              : <>¿Activar <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.cat.name}"</span>? Volverá a aparecer en el formulario de egresos.</>
            }
          </p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setModal(null)} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
            <button
              onClick={() => toggleActive(modal.cat)}
              className={cn(btnBase, 'font-semibold text-white', modal.cat.active ? 'bg-red-500 hover:bg-red-600' : 'bg-primary-500 hover:bg-primary-600')}
            >{modal.cat.active ? 'Desactivar' : 'Activar'}</button>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete' && (
        <Modal title="Eliminar categoría" onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            ¿Eliminar <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.cat.name}"</span>?
            Los egresos existentes que usen esta categoría no se verán afectados.
          </p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setModal(null)} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
            <button onClick={() => handleDelete(modal.cat)} className={cn(btnBase, 'font-semibold bg-red-500 text-white hover:bg-red-600')}>Eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: TIPOS DE INGRESO
// ─────────────────────────────────────────────────────────────────────────────

const IT_FILTERS: FilterControlDef[] = [
  { type: 'input', key: 'search', label: 'Buscar', placeholder: 'Nombre del tipo…' },
  {
    type: 'radio', key: 'source', label: 'Origen',
    options: [{ value: '', label: 'Todos' }, { value: 'system', label: 'Sistema' }, { value: 'personal', label: 'Personal' }],
  },
  {
    type: 'radio', key: 'status', label: 'Estado',
    options: [{ value: '', label: 'Todos' }, { value: 'active', label: 'Activos' }, { value: 'inactive', label: 'Inactivos' }],
  },
]

type ITFilters  = Record<string, string | string[]>
type ITModal = { type: 'create' } | { type: 'edit'; it: UserIncomeType } | { type: 'delete'; it: UserIncomeType } | { type: 'toggle'; it: UserIncomeType } | null

function IncomeTypesTab() {
  const [items, setItems]     = useState<UserIncomeType[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<ITFilters>({ search: '', source: '', status: '' })
  const [modal, setModal]     = useState<ITModal>(null)
  const [newName, setNewName]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [saveErr, setSaveErr]   = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editErr, setEditErr]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await userApi.incomeTypes.list()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(it => {
    const s = (filters.search as string).toLowerCase()
    if (s && !it.name.toLowerCase().includes(s)) return false
    if (filters.source === 'system'   && !it.is_system) return false
    if (filters.source === 'personal' && it.is_system)  return false
    if (filters.status === 'active'   && !it.active)    return false
    if (filters.status === 'inactive' && it.active)     return false
    return true
  })

  async function toggleActive(it: UserIncomeType) {
    try {
      const res = await userApi.incomeTypes.toggle(it.id)
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, active: res.active } : x))
      setModal(null)
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function handleDelete(it: UserIncomeType) {
    try {
      await userApi.incomeTypes.delete(it.id)
      setItems(prev => prev.filter(x => x.id !== it.id))
      setModal(null)
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (modal?.type !== 'edit') return
    setEditErr(null); setEditSaving(true)
    try {
      const updated = await userApi.incomeTypes.update(modal.it.id, { name: editName })
      setItems(prev => prev.map(x => x.id === updated.id ? { ...x, name: updated.name } : x))
      setModal(null)
    } catch (e) { setEditErr(e instanceof Error ? e.message : 'Error') }
    finally { setEditSaving(false) }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setSaveErr(null); setSaving(true)
    try {
      const created = await userApi.incomeTypes.create({ name: newName })
      setItems(prev => [created, ...prev])
      setNewName(''); setModal(null)
    } catch (e) { setSaveErr(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  const stats = {
    total:    items.length,
    system:   items.filter(i => i.is_system).length,
    personal: items.filter(i => !i.is_system).length,
    active:   items.filter(i => i.active).length,
  }

  const columns: Column<UserIncomeType>[] = [
    {
      key: 'name', label: 'Nombre', sortable: true,
      render: it => <span className="font-medium text-gray-900 dark:text-slate-100">{it.name}</span>,
    },
    { key: 'is_system', label: 'Origen', sortable: true, render: it => <SourceBadge isSystem={it.is_system} /> },
    { key: 'active',    label: 'Estado', sortable: true, render: it => <ActiveBadgeIT active={it.active} /> },
  ]

  const actions: RowAction<UserIncomeType>[] = [
    {
      icon:    (it: UserIncomeType) => it.active ? ToggleLeft : ToggleRight,
      label:   it => it.active ? 'Desactivar' : 'Activar',
      variant: it => it.active ? 'danger' : 'default',
      onClick: it => setModal({ type: 'toggle', it }),
    },
    {
      icon: Pencil, label: 'Editar',
      onClick: it => { setEditName(it.name); setEditErr(null); setModal({ type: 'edit', it }) },
      disabled: it => it.is_system,
    },
    {
      icon: Trash2, label: 'Eliminar', variant: 'danger',
      onClick: it => setModal({ type: 'delete', it }),
      disabled: it => it.is_system,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Mini KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total',    value: stats.total,    color: 'text-gray-900 dark:text-slate-100' },
          { label: 'Sistema',  value: stats.system,   color: 'text-gray-500 dark:text-slate-400' },
          { label: 'Personal', value: stats.personal, color: 'text-primary-600 dark:text-primary-400' },
          { label: 'Activos',  value: stats.active,   color: 'text-green-600 dark:text-green-400' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white dark:bg-slate-900 p-3 shadow-soft">
            <p className="text-xs text-gray-500 dark:text-slate-400">{s.label}</p>
            <p className={cn('mt-0.5 text-xl font-semibold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <FilterBar
        controls={IT_FILTERS}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onClear={() => setFilters({ search: '', source: '', status: '' })}
        actions={[
          { label: 'Actualizar', icon: RefreshCw, onClick: load, variant: 'outline' as const },
          { label: 'Nuevo tipo', icon: Plus, onClick: () => { setNewName(''); setSaveErr(null); setModal({ type: 'create' }) } },
        ]}
      />

      <DataTable
        data={filtered}
        columns={columns}
        actions={actions}
        rowKey={it => it.id}
        loading={loading}
        emptyMessage="No hay tipos de ingreso que coincidan con los filtros"
      />

      {modal?.type === 'edit' && (
        <Modal title={`Editar — ${modal.it.name}`} onClose={() => setModal(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <Field label="Nombre" id="it-edit-name" value={editName} onChange={setEditName} placeholder="Ej: Comisión" required />
            {editErr && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{editErr}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(null)} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
              <button type="submit" disabled={editSaving || !editName.trim()} className={cn(btnBase, 'font-semibold bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60')}>
                {editSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal?.type === 'create' && (
        <Modal title="Nuevo tipo de ingreso personal" onClose={() => setModal(null)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="Nombre" id="it-name" value={newName} onChange={setNewName} placeholder="Ej: Comisión" required />
            {saveErr && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{saveErr}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModal(null)} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
              <button type="submit" disabled={saving} className={cn(btnBase, 'font-semibold bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-60')}>
                {saving ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal?.type === 'toggle' && (
        <Modal title={modal.it.active ? 'Desactivar tipo' : 'Activar tipo'} onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            {modal.it.active
              ? <>¿Desactivar <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.it.name}"</span>? Dejará de aparecer en el formulario de ingresos.</>
              : <>¿Activar <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.it.name}"</span>? Volverá a aparecer en el formulario de ingresos.</>
            }
          </p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setModal(null)} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
            <button
              onClick={() => toggleActive(modal.it)}
              className={cn(btnBase, 'font-semibold text-white', modal.it.active ? 'bg-red-500 hover:bg-red-600' : 'bg-primary-500 hover:bg-primary-600')}
            >{modal.it.active ? 'Desactivar' : 'Activar'}</button>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete' && (
        <Modal title="Eliminar tipo de ingreso" onClose={() => setModal(null)}>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            ¿Eliminar <span className="font-semibold text-gray-900 dark:text-slate-100">"{modal.it.name}"</span>?
          </p>
          <div className="mt-5 flex gap-3">
            <button onClick={() => setModal(null)} className={cn(btnBase, 'border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800')}>Cancelar</button>
            <button onClick={() => handleDelete(modal.it)} className={cn(btnBase, 'font-semibold bg-red-500 text-white hover:bg-red-600')}>Eliminar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'categories' | 'incomeTypes'

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'categories',  label: 'Categorías de egreso', icon: Tags },
  { key: 'incomeTypes', label: 'Tipos de ingreso',     icon: TrendingUp },
]

export function CatalogsPage() {
  const [tab, setTab] = useState<Tab>('categories')

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Mis catálogos</h1>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-gray-100 dark:bg-slate-800 p-1 w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                tab === t.key
                  ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200',
              )}
            >
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'categories'  && <CategoriesTab />}
      {tab === 'incomeTypes' && <IncomeTypesTab />}
    </div>
  )
}
