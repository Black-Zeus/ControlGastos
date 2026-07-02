import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { ShieldOff, ShieldCheck, Plus, Copy, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminApi, type IngestionToken, type User } from '@/lib/adminApi'
import { DataTable, type Column, type RowAction } from '@/components/ui/DataTable'
import { FilterBar, type FilterControlDef } from '@/components/ui/FilterBar'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
      active
        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
        : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400',
    )}>
      {active ? <ShieldCheck size={10} /> : <ShieldOff size={10} />}
      {active ? 'Activo' : 'Revocado'}
    </span>
  )
}

// ─── Modal confirmación toggle ────────────────────────────────────────────────

function ConfirmToggleModal({
  token,
  onConfirm,
  onCancel,
}: {
  token: IngestionToken
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
            ¿Revocar este token?
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            Token: <strong className="text-gray-700 dark:text-slate-300">{token.label}</strong>
            <br />
            Usuario: {token.user_name}
          </p>
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Esta acción es irreversible. El token dejará de funcionar inmediatamente para cualquier sistema que lo use.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-red-500 hover:bg-red-600 py-2.5 text-sm font-semibold text-white transition-colors"
          >
            Revocar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal crear token ────────────────────────────────────────────────────────

function CreateTokenModal({
  users,
  onClose,
  onCreate,
}: {
  users: User[]
  onClose: () => void
  onCreate: (token: IngestionToken & { token: string }) => void
}) {
  const [userId, setUserId] = useState(users[0]?.id ?? '')
  const [label,  setLabel]  = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [created, setCreated] = useState<{ raw: string; label: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!userId || !label.trim()) return
    setSaving(true)
    setError(null)
    try {
      const result = await adminApi.tokens.create({ user_id: userId, label: label.trim() })
      setCreated({ raw: result.token, label: result.label })
      onCreate(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear token')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    if (!created) return
    await navigator.clipboard.writeText(created.raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputCls =
    'w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 ' +
    'px-3 py-2 text-sm text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Nuevo token de ingesta</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {created ? (
          /* ── Token generado ── */
          <div className="p-5 space-y-4">
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 mb-1">
                Guarda este token ahora — no se puede recuperar después
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-500">
                Una vez cerrado este modal el token en claro no estará disponible.
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-slate-400">Token: <strong className="text-gray-700 dark:text-slate-300">{created.label}</strong></p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-gray-100 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-gray-800 dark:text-slate-200">
                  {created.raw}
                </code>
                <button
                  onClick={handleCopy}
                  className={cn(
                    'shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-600',
                  )}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
            >
              Listo, ya lo guardé
            </button>
          </div>
        ) : (
          /* ── Formulario ── */
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-slate-300">Usuario</label>
              <select
                value={userId}
                onChange={e => setUserId(e.target.value)}
                required
                className={inputCls}
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-slate-300">Etiqueta</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                required
                maxLength={100}
                placeholder="ej. Bot de WhatsApp, Automatización N8N…"
                className={inputCls}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !label.trim() || !userId}
                className="flex-1 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Creando…' : 'Crear token'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Controles de filtro ──────────────────────────────────────────────────────

const FILTER_CONTROLS: FilterControlDef[] = [
  { type: 'input', key: 'search', label: 'Buscar', placeholder: 'Etiqueta o usuario…' },
  {
    type: 'radio', key: 'status', label: 'Estado',
    options: [
      { value: '',         label: 'Todos' },
      { value: 'active',   label: 'Activos' },
      { value: 'revoked',  label: 'Revocados' },
    ],
  },
]

type Filters = Record<string, string | string[]>

// ─── Página ───────────────────────────────────────────────────────────────────

export function AdminTokensPage() {
  const [tokens,      setTokens]     = useState<IngestionToken[]>([])
  const [users,       setUsers]      = useState<User[]>([])
  const [loading,     setLoading]    = useState(true)
  const [filters,     setFilters]    = useState<Filters>({ search: '', status: '' })
  const [showModal,   setShowModal]  = useState(false)
  const [confirmToken, setConfirmToken] = useState<IngestionToken | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [toks, usrs] = await Promise.all([adminApi.tokens.list(), adminApi.users.list()])
      setTokens(toks)
      setUsers(usrs.filter(u => u.is_active))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = tokens.filter(t => {
    const s = (filters.search as string).toLowerCase()
    if (s && !t.label.toLowerCase().includes(s) && !t.user_name.toLowerCase().includes(s) && !t.user_email.toLowerCase().includes(s)) return false
    if (filters.status === 'active'  && !t.active) return false
    if (filters.status === 'revoked' && t.active)  return false
    return true
  })

  async function confirmToggle() {
    if (!confirmToken) return
    try {
      const updated = await adminApi.tokens.toggle(confirmToken.id)
      setTokens(prev => prev.map(t => t.id === updated.id ? updated : t))
    } catch (e) { alert(e instanceof Error ? e.message : 'Error') }
    finally { setConfirmToken(null) }
  }

  function handleCreated(newToken: IngestionToken) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { token: _raw, ...clean } = newToken as IngestionToken & { token: string }
    setTokens(prev => [clean, ...prev])
  }

  const stats = {
    total:       tokens.length,
    active:      tokens.filter(t => t.active).length,
    revoked:     tokens.filter(t => !t.active).length,
    uniqueUsers: new Set(tokens.map(t => t.user_id)).size,
  }

  const columns: Column<IngestionToken>[] = [
    {
      key: 'label', label: 'Etiqueta', sortable: true,
      render: t => (
        <div>
          <p className="font-medium text-gray-900 dark:text-slate-100">{t.label}</p>
          <p className="mt-0.5 font-mono text-[10px] text-gray-300 dark:text-slate-600">
            {t.id.slice(0, 8)}…
          </p>
        </div>
      ),
    },
    {
      key: 'user_name', label: 'Usuario', sortable: true,
      render: t => (
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{t.user_name}</p>
          <p className="text-xs text-gray-400 dark:text-slate-500">{t.user_email}</p>
        </div>
      ),
    },
    {
      key: 'active', label: 'Estado', sortable: true,
      render: t => <StatusBadge active={t.active} />,
    },
    {
      key: 'last_used_at', label: 'Último uso', sortable: true,
      render: t => (
        <span className={cn('text-sm', t.last_used_at ? 'text-gray-700 dark:text-slate-300' : 'text-gray-300 dark:text-slate-600')}>
          {formatDate(t.last_used_at)}
        </span>
      ),
    },
    {
      key: 'created_at', label: 'Creado', sortable: true,
      render: t => <span className="text-sm text-gray-500 dark:text-slate-400">{formatDate(t.created_at)}</span>,
    },
  ]

  const actions: RowAction<IngestionToken>[] = [
    {
      icon:     () => ShieldOff,
      label:    () => 'Revocar',
      onClick:  t => setConfirmToken(t),
      variant:  () => 'danger',
      disabled: t => !t.active,
    },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Tokens de ingesta</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total',     value: stats.total,       color: 'text-gray-900 dark:text-slate-100' },
          { label: 'Activos',   value: stats.active,      color: 'text-primary-600 dark:text-primary-400' },
          { label: 'Revocados', value: stats.revoked,     color: 'text-gray-400 dark:text-slate-500' },
          { label: 'Usuarios',  value: stats.uniqueUsers, color: 'text-violet-600 dark:text-violet-400' },
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
        onClear={() => setFilters({ search: '', status: '' })}
        actions={[{ label: 'Nuevo token', icon: Plus, onClick: () => setShowModal(true) }]}
      />

      {/* Tabla */}
      <DataTable
        data={filtered}
        columns={columns}
        actions={actions}
        rowKey={t => t.id}
        loading={loading}
        emptyMessage="No hay tokens que coincidan con los filtros"
      />

      {/* Modal nuevo token */}
      {showModal && (
        <CreateTokenModal
          users={users}
          onClose={() => setShowModal(false)}
          onCreate={handleCreated}
        />
      )}

      {/* Modal confirmación toggle */}
      {confirmToken && (
        <ConfirmToggleModal
          token={confirmToken}
          onConfirm={confirmToggle}
          onCancel={() => setConfirmToken(null)}
        />
      )}
    </div>
  )
}
