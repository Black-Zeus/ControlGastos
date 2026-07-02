import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, KeyRound, ShieldCheck, User as UserIcon, X, Trash2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminApi, type User, type UserCreatePayload, type UserUpdatePayload } from '@/lib/adminApi'
import { DataTable, type Column, type RowAction } from '@/components/ui/DataTable'
import { FilterBar, type FilterControlDef } from '@/components/ui/FilterBar'

// ─── Modal ────────────────────────────────────────────────────────────────────

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

// ─── Campos de formulario ─────────────────────────────────────────────────────

function Field({ label, id, type = 'text', placeholder, required, value, onChange }: {
  label: string; id: string; type?: string; placeholder?: string
  required?: boolean; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <input
        id={id} type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className={cn(
          'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900',
          'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500',
          'placeholder:text-gray-400 outline-none transition-colors',
          'focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:border-primary-500 dark:focus:ring-primary-900/30',
        )}
      />
    </div>
  )
}

function RoleToggle({ isAdmin, onChange }: { isAdmin: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-slate-300">Tipo de acceso</p>
      <div className="flex gap-2">
        {[
          { value: false, label: 'Usuario', icon: UserIcon },
          { value: true,  label: 'Admin',   icon: ShieldCheck },
        ].map(opt => (
          <button key={String(opt.value)} type="button" onClick={() => onChange(opt.value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
              isAdmin === opt.value
                ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-900/30 dark:text-primary-400'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
            )}>
            <opt.icon size={14} /> {opt.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400 dark:text-slate-500">
        {isAdmin ? 'Solo accede al panel de administración' : 'Solo accede a la app de usuario'}
      </p>
    </div>
  )
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function RoleBadge({ isAdmin }: { isAdmin: boolean }) {
  return isAdmin ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 dark:bg-violet-900/30 px-2.5 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-400">
      <ShieldCheck size={11} /> Admin
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-slate-300">
      <UserIcon size={11} /> Usuario
    </span>
  )
}

function StatusBadge({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title="Click para cambiar estado">
      <span className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
        active
          ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
          : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400',
      )}>
        {active ? 'Activo' : 'Inactivo'}
      </span>
    </button>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

type ModalState = { type: 'create' } | { type: 'edit'; user: User } | { type: 'password'; user: User } | { type: 'delete'; user: User } | null
type Filters = Record<string, string | string[]>

const FILTER_CONTROLS: FilterControlDef[] = [
  { type: 'input',  key: 'search', label: 'Buscar', placeholder: 'Nombre o email…' },
  {
    type: 'select', key: 'role', label: 'Rol', searchable: false, placeholder: 'Todos los roles',
    options: [{ value: 'user', label: 'Usuario' }, { value: 'admin', label: 'Admin' }],
  },
  {
    type: 'radio', key: 'status', label: 'Estado',
    options: [{ value: '', label: 'Todos' }, { value: 'active', label: 'Activos' }, { value: 'inactive', label: 'Inactivos' }],
  },
]

export function AdminUsersPage() {
  const [users, setUsers]         = useState<User[]>([])
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState<ModalState>(null)
  const [filters, setFilters]     = useState<Filters>({ search: '', role: '', status: '' })
  const [smtpOk, setSmtpOk]       = useState<boolean | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [userList, smtp] = await Promise.all([
        adminApi.users.list(),
        adminApi.settings.smtp.get(),
      ])
      setUsers(userList)
      setSmtpOk(!!smtp.smtp_host)
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Filtrado
  const filtered = users.filter(u => {
    const s = (filters.search as string).toLowerCase()
    if (s && !u.name.toLowerCase().includes(s) && !u.email.toLowerCase().includes(s)) return false
    if (filters.role === 'admin' && !u.is_admin) return false
    if (filters.role === 'user' && u.is_admin) return false
    if (filters.status === 'active' && !u.is_active) return false
    if (filters.status === 'inactive' && u.is_active) return false
    return true
  })

  async function toggleActive(user: User) {
    try {
      const updated = await adminApi.users.update(user.id, { is_active: !user.is_active })
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
  }

  const columns: Column<User>[] = [
    {
      key: 'name', label: 'Usuario', sortable: true,
      render: u => (
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
            u.is_admin
              ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400'
              : 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-400',
          )}>
            {u.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900 dark:text-slate-100">{u.name}</p>
            <p className="truncate text-xs text-gray-400 dark:text-slate-500">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'is_admin', label: 'Rol', sortable: true,
      render: u => <RoleBadge isAdmin={u.is_admin} />,
    },
    {
      key: 'is_active', label: 'Estado', sortable: true,
      render: u => <StatusBadge active={u.is_active} onClick={() => toggleActive(u)} />,
    },
  ]

  const adminCount = users.filter(u => u.is_admin).length

  const actions: RowAction<User>[] = [
    { icon: Pencil,   label: 'Editar',             onClick: u => setModal({ type: 'edit', user: u }) },
    { icon: KeyRound, label: 'Cambiar contraseña',  onClick: u => setModal({ type: 'password', user: u }) },
    {
      icon: Trash2,
      label: 'Eliminar',
      onClick: u => setModal({ type: 'delete', user: u }),
      disabled: u => u.is_admin && adminCount <= 1,
      variant: 'danger',
    },
  ]

  const stats = {
    total:   users.length,
    active:  users.filter(u => u.is_active).length,
    admins:  users.filter(u => u.is_admin).length,
    regular: users.filter(u => !u.is_admin).length,
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Usuarios</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total',    value: stats.total,   color: 'text-gray-900 dark:text-slate-100' },
          { label: 'Activos',  value: stats.active,  color: 'text-primary-600 dark:text-primary-400' },
          { label: 'Admins',   value: stats.admins,  color: 'text-violet-600 dark:text-violet-400' },
          { label: 'Usuarios', value: stats.regular, color: 'text-gray-600 dark:text-slate-400' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-soft">
            <p className="text-xs text-gray-500 dark:text-slate-400">{s.label}</p>
            <p className={cn('mt-1 text-2xl font-semibold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Alerta SMTP */}
      {smtpOk === false && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 text-amber-500" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            No hay servidor de correo configurado. Configura SMTP antes de crear usuarios para que puedan recibir el email de bienvenida.
          </p>
        </div>
      )}

      {/* Filtros */}
      <FilterBar
        controls={FILTER_CONTROLS}
        values={filters}
        onChange={(k, v) => setFilters(f => ({ ...f, [k]: v }))}
        onClear={() => setFilters({ search: '', role: '', status: '' })}
        actions={[{ label: 'Nuevo usuario', icon: Plus, onClick: () => setModal({ type: 'create' }) }]}
      />

      {/* Tabla */}
      <DataTable
        data={filtered}
        columns={columns}
        actions={actions}
        rowKey={u => u.id}
        loading={loading}
        emptyMessage="No hay usuarios que coincidan con los filtros"
      />

      {/* Modales */}
      {modal?.type === 'create' && (
        <CreateModal onClose={() => setModal(null)} onCreated={u => { setUsers(p => [u, ...p]); setModal(null) }} />
      )}
      {modal?.type === 'edit' && (
        <EditModal user={modal.user} onClose={() => setModal(null)}
          onSaved={u => { setUsers(p => p.map(x => x.id === u.id ? u : x)); setModal(null) }} />
      )}
      {modal?.type === 'password' && (
        <PasswordModal user={modal.user} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'delete' && (
        <DeleteModal user={modal.user} onClose={() => setModal(null)}
          onDeleted={id => { setUsers(p => p.filter(u => u.id !== id)); setModal(null) }} />
      )}
    </div>
  )
}

// ─── Modal crear ──────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: User) => void }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSaving(true)
    try { onCreated(await adminApi.users.create({ name, email, password, is_admin: isAdmin } as UserCreatePayload)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Nuevo usuario" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nombre" id="c-name" value={name} onChange={setName} placeholder="Juan Pérez" required />
        <Field label="Email" id="c-email" type="email" value={email} onChange={setEmail} placeholder="juan@correo.com" required />
        <Field label="Contraseña" id="c-pass" type="password" value={password} onChange={setPassword} required />
        <RoleToggle isAdmin={isAdmin} onChange={setIsAdmin} />
        {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60 transition-colors">{saving ? 'Creando…' : 'Crear usuario'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Modal editar ─────────────────────────────────────────────────────────────

function EditModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: (u: User) => void }) {
  const [name, setName]       = useState(user.name)
  const [isAdmin, setIsAdmin] = useState(user.is_admin)
  const [active, setActive]   = useState(user.is_active)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setSaving(true)
    try { onSaved(await adminApi.users.update(user.id, { name, is_admin: isAdmin, is_active: active } as UserUpdatePayload)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  return (
    <Modal title="Editar usuario" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Nombre" id="e-name" value={name} onChange={setName} required />
        <div>
          <p className="mb-1 text-xs text-gray-400 dark:text-slate-500">Email</p>
          <p className="text-sm text-gray-700 dark:text-slate-300">{user.email}</p>
        </div>
        <RoleToggle isAdmin={isAdmin} onChange={setIsAdmin} />
        <div className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Cuenta activa</p>
            <p className="text-xs text-gray-400 dark:text-slate-500">El usuario puede iniciar sesión</p>
          </div>
          <button type="button" onClick={() => setActive(a => !a)}
            className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors', active ? 'bg-primary-500' : 'bg-gray-200 dark:bg-slate-600')}>
            <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform', active ? 'translate-x-[18px]' : 'translate-x-[3px]')} />
          </button>
        </div>
        {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
          <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60 transition-colors">{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Modal eliminar ───────────────────────────────────────────────────────────

function DeleteModal({ user, onClose, onDeleted }: { user: User; onClose: () => void; onDeleted: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleDelete() {
    setError(null); setDeleting(true)
    try {
      await adminApi.users.delete(user.id)
      onDeleted(user.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar')
      setDeleting(false)
    }
  }

  return (
    <Modal title="Eliminar usuario" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-900/20 p-4">
          <AlertTriangle size={18} className="shrink-0 text-red-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-300">Esta acción no se puede deshacer</p>
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Se eliminará permanentemente la cuenta de <strong>{user.name}</strong> ({user.email}).
              Solo es posible si el usuario no tiene períodos registrados.
            </p>
          </div>
        </div>
        {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
          <button type="button" onClick={handleDelete} disabled={deleting}
            className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60 transition-colors">
            {deleting ? 'Eliminando…' : 'Eliminar usuario'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Modal contraseña ─────────────────────────────────────────────────────────

function PasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [done, setDone]         = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    setError(null); setSaving(true)
    try { await adminApi.users.update(user.id, { password }); setDone(true) }
    catch (e) { setError(e instanceof Error ? e.message : 'Error') }
    finally { setSaving(false) }
  }

  return (
    <Modal title={`Contraseña — ${user.name}`} onClose={onClose}>
      {done ? (
        <div className="py-4 text-center">
          <p className="text-sm font-medium text-primary-600 dark:text-primary-400">Contraseña actualizada correctamente</p>
          <button onClick={onClose} className="mt-4 rounded-xl bg-primary-500 px-6 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors">Cerrar</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nueva contraseña" id="p-new" type="password" value={password} onChange={setPassword} required />
          <Field label="Confirmar contraseña" id="p-conf" type="password" value={confirm} onChange={setConfirm} required />
          {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60 transition-colors">{saving ? 'Guardando…' : 'Cambiar'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
