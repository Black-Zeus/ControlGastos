import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminApi, type IncomeType, type IncomeTypePayload } from '@/lib/adminApi'
import { DataTable, type Column, type RowAction } from '@/components/ui/DataTable'
import { FilterBar, type FilterControlDef } from '@/components/ui/FilterBar'

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-xl">
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

// ─── Formulario ───────────────────────────────────────────────────────────────

interface IncomeTypeFormProps {
  initial?: Partial<IncomeTypePayload>
  onSubmit: (data: IncomeTypePayload) => Promise<void>
  onCancel: () => void
  submitLabel: string
}

function IncomeTypeForm({ initial, onSubmit, onCancel, submitLabel }: IncomeTypeFormProps) {
  const [name, setName]     = useState(initial?.name ?? '')
  const [active, setActive] = useState(initial?.default_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setSaving(true)
    try { await onSubmit({ name, default_active: active }) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
          Nombre <span className="text-red-500">*</span>
        </label>
        <input
          value={name} onChange={e => setName(e.target.value)} required placeholder="Ej: Comisión"
          className={cn(
            'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900',
            'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500',
            'placeholder:text-gray-400 outline-none transition-colors',
            'focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:border-primary-500 dark:focus:ring-primary-900/30',
          )}
        />
      </div>

      <div className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-slate-800 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Activo por defecto</p>
          <p className="text-[11px] text-gray-400 dark:text-slate-500">Los usuarios nuevos lo verán activado</p>
        </div>
        <button type="button" onClick={() => setActive(v => !v)}
          className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors', active ? 'bg-primary-500' : 'bg-gray-200 dark:bg-slate-600')}>
          <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', active ? 'translate-x-[18px]' : 'translate-x-[3px]')} />
        </button>
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

type ModalState = { type: 'create' } | { type: 'edit'; it: IncomeType } | null
type Filters = Record<string, string | string[]>

const FILTER_CONTROLS: FilterControlDef[] = [
  { type: 'input', key: 'search', label: 'Buscar', placeholder: 'Nombre del tipo…' },
  {
    type: 'radio', key: 'status', label: 'Por defecto',
    options: [{ value: '', label: 'Todos' }, { value: 'active', label: 'Activos' }, { value: 'inactive', label: 'Inactivos' }],
  },
]

export function AdminIncomeTypesPage() {
  const [items, setItems]     = useState<IncomeType[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState<ModalState>(null)
  const [filters, setFilters] = useState<Filters>({ search: '', status: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await adminApi.incomeTypes.list()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = items.filter(it => {
    const s = (filters.search as string).toLowerCase()
    if (s && !it.name.toLowerCase().includes(s)) return false
    if (filters.status === 'active' && !it.default_active) return false
    if (filters.status === 'inactive' && it.default_active) return false
    return true
  })

  async function toggleDefault(it: IncomeType) {
    try {
      const updated = await adminApi.incomeTypes.update(it.id, { default_active: !it.default_active })
      setItems(prev => prev.map(x => x.id === updated.id ? updated : x))
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  const columns: Column<IncomeType>[] = [
    {
      key: 'name', label: 'Nombre', sortable: true,
      render: it => <span className="font-medium text-gray-900 dark:text-slate-100">{it.name}</span>,
    },
    {
      key: 'default_active', label: 'Por defecto', sortable: true,
      render: it => (
        <button onClick={() => toggleDefault(it)} title="Click para cambiar">
          <span className={cn(
            'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
            it.default_active
              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400',
          )}>
            {it.default_active ? 'Activo' : 'Inactivo'}
          </span>
        </button>
      ),
    },
  ]

  const actions: RowAction<IncomeType>[] = [
    { icon: Pencil, label: 'Editar', onClick: it => setModal({ type: 'edit', it }) },
  ]

  const stats = {
    total:    items.length,
    active:   items.filter(i => i.default_active).length,
    inactive: items.filter(i => !i.default_active).length,
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Tipos de ingreso</h1>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total',    value: stats.total,    color: 'text-gray-900 dark:text-slate-100' },
          { label: 'Activos',  value: stats.active,   color: 'text-primary-600 dark:text-primary-400' },
          { label: 'Inactivos',value: stats.inactive, color: 'text-gray-400 dark:text-slate-500' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-soft">
            <p className="text-xs text-gray-500 dark:text-slate-400">{s.label}</p>
            <p className={cn('mt-1 text-2xl font-semibold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros + acción */}
      <FilterBar
        controls={FILTER_CONTROLS}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onClear={() => setFilters({ search: '', status: '' })}
        actions={[{ label: 'Nuevo tipo', icon: Plus, onClick: () => setModal({ type: 'create' }) }]}
      />

      {/* Tabla */}
      <DataTable
        data={filtered}
        columns={columns}
        actions={actions}
        rowKey={it => it.id}
        loading={loading}
        emptyMessage="No hay tipos de ingreso que coincidan con los filtros"
      />

      {modal?.type === 'create' && (
        <Modal title="Nuevo tipo de ingreso" onClose={() => setModal(null)}>
          <IncomeTypeForm
            submitLabel="Crear"
            onCancel={() => setModal(null)}
            onSubmit={async data => {
              const created = await adminApi.incomeTypes.create(data)
              setItems(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
              setModal(null)
            }}
          />
        </Modal>
      )}
      {modal?.type === 'edit' && (
        <Modal title={`Editar — ${modal.it.name}`} onClose={() => setModal(null)}>
          <IncomeTypeForm
            initial={modal.it}
            submitLabel="Guardar"
            onCancel={() => setModal(null)}
            onSubmit={async data => {
              const updated = await adminApi.incomeTypes.update(modal.it.id, data)
              setItems(prev => prev.map(x => x.id === updated.id ? updated : x))
              setModal(null)
            }}
          />
        </Modal>
      )}
    </div>
  )
}
