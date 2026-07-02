import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminApi, type Category, type CategoryPayload } from '@/lib/adminApi'
import { DataTable, type Column, type RowAction } from '@/components/ui/DataTable'
import { FilterBar, type FilterControlDef } from '@/components/ui/FilterBar'

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

// ─── Badges ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  return type === 'recurrente' ? (
    <span className="inline-flex rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
      Recurrente
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-amber-50 dark:bg-amber-900/30 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
      Puntual
    </span>
  )
}

function ActiveBadge({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title="Click para cambiar">
      <span className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
        active
          ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
          : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400',
      )}>
        {active ? 'Activa' : 'Inactiva'}
      </span>
    </button>
  )
}

// ─── Formulario de categoría ──────────────────────────────────────────────────

interface CategoryFormProps {
  initial?: Partial<CategoryPayload>
  onSubmit: (data: CategoryPayload) => Promise<void>
  onCancel: () => void
  submitLabel: string
}

function CategoryForm({ initial, onSubmit, onCancel, submitLabel }: CategoryFormProps) {
  const [name, setName]               = useState(initial?.name ?? '')
  const [type, setType]               = useState<'recurrente' | 'puntual'>(initial?.type ?? 'puntual')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [obviable, setObviable]       = useState(initial?.default_obviable ?? false)
  const [active, setActive]           = useState(initial?.default_active ?? true)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSaving(true)
    try {
      await onSubmit({ name, type, default_obviable: obviable, description: description || null, default_active: active })
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

  const toggleCls = (on: boolean) => cn(
    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
    on ? 'bg-primary-500' : 'bg-gray-200 dark:bg-slate-600',
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
          Nombre <span className="text-red-500">*</span>
        </label>
        <input value={name} onChange={e => setName(e.target.value)} required placeholder="Ej: Supermercado" className={inputCls} />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-slate-300">Tipo de egreso</p>
        <div className="flex gap-2">
          {(['recurrente', 'puntual'] as const).map(t => (
            <button key={t} type="button" onClick={() => setType(t)}
              className={cn(
                'flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium capitalize transition-colors',
                type === t
                  ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-gray-400 dark:text-slate-500">
          {type === 'recurrente' ? 'Se repite todos los meses (arriendo, servicios…)' : 'Ocurre de forma esporádica (ropa, regalos…)'}
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">Descripción</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción breve (opcional)" className={inputCls} />
      </div>

      <div className="space-y-3 rounded-xl border border-gray-100 dark:border-slate-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Obviable</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500">El usuario puede marcarlo como gasto no esencial</p>
          </div>
          <button type="button" onClick={() => setObviable(v => !v)} className={toggleCls(obviable)}>
            <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', obviable ? 'translate-x-[18px]' : 'translate-x-[3px]')} />
          </button>
        </div>
        <div className="h-px bg-gray-100 dark:bg-slate-800" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Activo por defecto</p>
            <p className="text-[11px] text-gray-400 dark:text-slate-500">Los usuarios nuevos lo verán activado</p>
          </div>
          <button type="button" onClick={() => setActive(v => !v)} className={toggleCls(active)}>
            <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', active ? 'translate-x-[18px]' : 'translate-x-[3px]')} />
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60 transition-colors">
          {saving ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

type ModalState = { type: 'create' } | { type: 'edit'; cat: Category } | null
type Filters = Record<string, string | string[]>

const FILTER_CONTROLS: FilterControlDef[] = [
  { type: 'input', key: 'search', label: 'Buscar', placeholder: 'Nombre o descripción…' },
  {
    type: 'radio', key: 'type', label: 'Tipo',
    options: [{ value: '', label: 'Todas' }, { value: 'recurrente', label: 'Recurrentes' }, { value: 'puntual', label: 'Puntuales' }],
  },
  {
    type: 'radio', key: 'obviable', label: 'Obviable',
    options: [{ value: '', label: 'Todas' }, { value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }],
  },
]

export function AdminCategoriesPage() {
  const [cats, setCats]       = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<ModalState>(null)
  const [filters, setFilters] = useState<Filters>({ search: '', type: '', obviable: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try { setCats(await adminApi.categories.list()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = cats.filter(c => {
    const s = (filters.search as string).toLowerCase()
    if (s && !c.name.toLowerCase().includes(s) && !(c.description ?? '').toLowerCase().includes(s)) return false
    if (filters.type && c.type !== filters.type) return false
    if (filters.obviable === 'yes' && !c.default_obviable) return false
    if (filters.obviable === 'no' && c.default_obviable) return false
    return true
  })

  async function toggleDefault(cat: Category) {
    try {
      const updated = await adminApi.categories.update(cat.id, { default_active: !cat.default_active })
      setCats(prev => prev.map(c => c.id === updated.id ? updated : c))
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  const stats = {
    total:      cats.length,
    recurrente: cats.filter(c => c.type === 'recurrente').length,
    puntual:    cats.filter(c => c.type === 'puntual').length,
    obviables:  cats.filter(c => c.default_obviable).length,
  }

  const columns: Column<Category>[] = [
    {
      key: 'name', label: 'Nombre', sortable: true,
      render: c => (
        <div>
          <p className="font-medium text-gray-900 dark:text-slate-100">{c.name}</p>
          {c.description && <p className="mt-0.5 max-w-[220px] truncate text-xs text-gray-400 dark:text-slate-500">{c.description}</p>}
        </div>
      ),
    },
    {
      key: 'type', label: 'Tipo', sortable: true,
      render: c => <TypeBadge type={c.type} />,
    },
    {
      key: 'default_obviable', label: 'Obviable', sortable: true,
      render: c => (
        <span className={cn(
          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
          c.default_obviable
            ? 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300'
            : 'text-gray-300 dark:text-slate-600',
        )}>
          {c.default_obviable ? 'Sí' : 'No'}
        </span>
      ),
    },
    {
      key: 'default_active', label: 'Por defecto', sortable: true,
      render: c => <ActiveBadge active={c.default_active} onClick={() => toggleDefault(c)} />,
    },
  ]

  const actions: RowAction<Category>[] = [
    { icon: Pencil, label: 'Editar', onClick: cat => setModal({ type: 'edit', cat }) },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Categorías del sistema</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total',       value: stats.total,      color: 'text-gray-900 dark:text-slate-100' },
          { label: 'Recurrentes', value: stats.recurrente, color: 'text-blue-600 dark:text-blue-400' },
          { label: 'Puntuales',   value: stats.puntual,    color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Obviables',   value: stats.obviables,  color: 'text-gray-500 dark:text-slate-400' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-soft">
            <p className="text-xs text-gray-500 dark:text-slate-400">{s.label}</p>
            <p className={cn('mt-1 text-2xl font-semibold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <FilterBar
        controls={FILTER_CONTROLS}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onClear={() => setFilters({ search: '', type: '', obviable: '' })}
        actions={[{ label: 'Nueva categoría', icon: Plus, onClick: () => setModal({ type: 'create' }) }]}
      />

      {/* Tabla */}
      <DataTable
        data={filtered}
        columns={columns}
        actions={actions}
        rowKey={c => c.id}
        loading={loading}
        emptyMessage="No hay categorías que coincidan con los filtros"
      />

      {modal?.type === 'create' && (
        <Modal title="Nueva categoría del sistema" onClose={() => setModal(null)}>
          <CategoryForm
            submitLabel="Crear categoría"
            onCancel={() => setModal(null)}
            onSubmit={async data => {
              const created = await adminApi.categories.create(data)
              setCats(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
              setModal(null)
            }}
          />
        </Modal>
      )}
      {modal?.type === 'edit' && (
        <Modal title={`Editar — ${modal.cat.name}`} onClose={() => setModal(null)}>
          <CategoryForm
            initial={modal.cat}
            submitLabel="Guardar"
            onCancel={() => setModal(null)}
            onSubmit={async data => {
              const updated = await adminApi.categories.update(modal.cat.id, data)
              setCats(prev => prev.map(c => c.id === updated.id ? updated : c))
              setModal(null)
            }}
          />
        </Modal>
      )}
    </div>
  )
}
