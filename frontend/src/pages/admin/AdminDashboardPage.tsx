import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Tags, TrendingUp, KeyRound,
  ShieldCheck, ShieldOff,
  ArrowRight, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { adminApi, type User, type Category, type IncomeType, type IngestionToken } from '@/lib/adminApi'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface DashboardData {
  users:       User[]
  categories:  Category[]
  incomeTypes: IncomeType[]
  tokens:      IngestionToken[]
}

// ─── Componentes de sección ───────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, color, to,
}: {
  icon: React.ElementType
  label: string
  value: number
  sub?: string
  color: string
  to: string
}) {
  return (
    <Link to={to} className="group flex flex-col gap-3 rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-soft hover:shadow-card transition-shadow">
      <div className="flex items-center justify-between">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', color)}>
          <Icon size={18} className="text-white" />
        </div>
        <ArrowRight size={14} className="text-gray-300 dark:text-slate-600 group-hover:text-gray-400 dark:group-hover:text-slate-500 transition-colors" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{value}</p>
        <p className="text-sm font-medium text-gray-600 dark:text-slate-400">{label}</p>
        {sub && <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">{sub}</p>}
      </div>
    </Link>
  )
}

function SectionCard({ title, icon: Icon, to, children }: {
  title: string
  icon: React.ElementType
  to: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-soft">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-5 py-4">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-gray-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300">{title}</h2>
        </div>
        <Link to={to} className="flex items-center gap-1 text-xs text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
          Ver todo <ArrowRight size={12} />
        </Link>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function StatRow({ label, value, badge }: { label: string; value: number; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-slate-800/60 last:border-0">
      <span className="text-sm text-gray-600 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-2">
        {badge}
        <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">{value}</span>
      </div>
    </div>
  )
}

function Dot({ color }: { color: string }) {
  return <span className={cn('inline-block h-2 w-2 rounded-full', color)} />
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function AdminDashboardPage() {
  const { admin } = useAdminAuth()
  const [data, setData]       = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [users, categories, incomeTypes, tokens] = await Promise.all([
        adminApi.users.list(),
        adminApi.categories.list(),
        adminApi.incomeTypes.list(),
        adminApi.tokens.list(),
      ])
      setData({ users, categories, incomeTypes, tokens })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={load} className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600">
          <RefreshCw size={14} /> Reintentar
        </button>
      </div>
    )
  }

  const d = data!

  // Derivados de usuarios
  const activeUsers   = d.users.filter(u => u.is_active && !u.is_admin)
  const inactiveUsers = d.users.filter(u => !u.is_active && !u.is_admin)
  const adminUsers    = d.users.filter(u => u.is_admin)
  const regularUsers  = d.users.filter(u => !u.is_admin)

  // Derivados de categorías
  const recurrentes = d.categories.filter(c => c.type === 'recurrente')
  const puntuales   = d.categories.filter(c => c.type === 'puntual')
  const obviables   = d.categories.filter(c => c.default_obviable)

  // Derivados de tipos de ingreso
  const activeTypes = d.incomeTypes.filter(t => t.default_active)

  // Derivados de tokens
  const activeTokens  = d.tokens.filter(t => t.active)
  const revokedTokens = d.tokens.filter(t => !t.active)
  const usersWithTokens = new Set(d.tokens.map(t => t.user_id)).size

  // Tokens con actividad reciente
  const recentTokens = [...d.tokens]
    .filter(t => t.last_used_at)
    .sort((a, b) => new Date(b.last_used_at!).getTime() - new Date(a.last_used_at!).getTime())
    .slice(0, 5)

  const today = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
            {greeting()}, {admin?.name?.split(' ')[0]}
          </h1>
          <p className="mt-0.5 text-sm capitalize text-gray-400 dark:text-slate-500">{today}</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2 text-sm text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* KPI cards principales */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={Users} label="Usuarios" value={regularUsers.length}
          sub={`${activeUsers.length} activos · ${inactiveUsers.length} inactivos`}
          color="bg-primary-500" to="/admin/usuarios"
        />
        <StatCard
          icon={Tags} label="Categorías" value={d.categories.length}
          sub={`${recurrentes.length} recurrentes · ${puntuales.length} puntuales`}
          color="bg-blue-500" to="/admin/categorias"
        />
        <StatCard
          icon={TrendingUp} label="Tipos de ingreso" value={d.incomeTypes.length}
          sub={`${activeTypes.length} activos por defecto`}
          color="bg-amber-500" to="/admin/tipos-ingreso"
        />
        <StatCard
          icon={KeyRound} label="Tokens" value={d.tokens.length}
          sub={`${activeTokens.length} activos · ${revokedTokens.length} revocados`}
          color="bg-violet-500" to="/admin/tokens"
        />
      </div>

      {/* Detalle + actividad reciente */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Detalle usuarios */}
        <SectionCard title="Usuarios" icon={Users} to="/admin/usuarios">
          <StatRow label="Usuarios regulares" value={regularUsers.length} badge={<Dot color="bg-primary-400" />} />
          <StatRow label="Activos" value={activeUsers.length} badge={<Dot color="bg-green-400" />} />
          <StatRow label="Inactivos" value={inactiveUsers.length} badge={<Dot color="bg-gray-300 dark:bg-slate-600" />} />
          <StatRow label="Administradores" value={adminUsers.length} badge={<Dot color="bg-violet-400" />} />
        </SectionCard>

        {/* Detalle categorías */}
        <SectionCard title="Categorías del sistema" icon={Tags} to="/admin/categorias">
          <StatRow label="Total" value={d.categories.length} />
          <StatRow label="Recurrentes" value={recurrentes.length} badge={<Dot color="bg-blue-400" />} />
          <StatRow label="Puntuales" value={puntuales.length} badge={<Dot color="bg-amber-400" />} />
          <StatRow label="Obviables" value={obviables.length} badge={<Dot color="bg-gray-300 dark:bg-slate-600" />} />
        </SectionCard>

        {/* Detalle tokens */}
        <SectionCard title="Tokens de ingesta" icon={KeyRound} to="/admin/tokens">
          <StatRow label="Total" value={d.tokens.length} />
          <StatRow
            label="Activos"
            value={activeTokens.length}
            badge={<ShieldCheck size={12} className="text-primary-500" />}
          />
          <StatRow
            label="Revocados"
            value={revokedTokens.length}
            badge={<ShieldOff size={12} className="text-gray-400 dark:text-slate-500" />}
          />
          <StatRow label="Usuarios con tokens" value={usersWithTokens} badge={<Dot color="bg-violet-400" />} />
        </SectionCard>

        {/* Actividad reciente tokens */}
        <SectionCard title="Actividad reciente" icon={RefreshCw} to="/admin/tokens">
          {recentTokens.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400 dark:text-slate-500">Sin actividad registrada</p>
          ) : (
            <div className="space-y-3">
              {recentTokens.map(t => (
                <div key={t.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-slate-200">{t.label}</p>
                    <p className="truncate text-xs text-gray-400 dark:text-slate-500">{t.user_name} · {t.user_email}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                      t.active
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500',
                    )}>
                      {t.active ? <ShieldCheck size={9} /> : <ShieldOff size={9} />}
                      {t.active ? 'Activo' : 'Revocado'}
                    </span>
                    <p className="mt-0.5 text-[10px] text-gray-400 dark:text-slate-500">{formatDate(t.last_used_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

      </div>
    </div>
  )
}
