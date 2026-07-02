import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Loader2, ShieldAlert } from 'lucide-react'
import logoUrl from '@/assets/logo.png'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { cn } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export function AdminForceChangePwdPage() {
  const { token, logout, clearMustChangePwd } = useAdminAuth()
  const navigate = useNavigate()

  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (next.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres')
      return
    }
    if (next !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (next === current) {
      setError('La nueva contraseña no puede ser igual a la actual')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/v1/me/password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ current_password: current, new_password: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail ?? 'Error al cambiar la contraseña')
      }
      clearMustChangePwd()
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="relative">
            <img src={logoUrl} alt="ControlGastos" className="h-14 w-14 rounded-2xl shadow-lg" />
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500">
              <ShieldAlert size={11} className="text-white" />
            </span>
          </div>
          <h1 className="text-xl font-semibold text-white">Cambio de contraseña requerido</h1>
          <p className="text-center text-sm text-slate-400">
            Por seguridad, debes establecer una nueva contraseña antes de continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              Contraseña actual
            </label>
            <input
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className={cn(
                'w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100',
                'placeholder:text-slate-500 outline-none',
                'focus:border-primary-500 focus:ring-2 focus:ring-primary-900/50 transition-colors',
              )}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              Nueva contraseña
            </label>
            <input
              type="password"
              value={next}
              onChange={e => setNext(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className={cn(
                'w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100',
                'placeholder:text-slate-500 outline-none',
                'focus:border-primary-500 focus:ring-2 focus:ring-primary-900/50 transition-colors',
              )}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">
              Confirmar nueva contraseña
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
              className={cn(
                'w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100',
                'placeholder:text-slate-500 outline-none',
                'focus:border-primary-500 focus:ring-2 focus:ring-primary-900/50 transition-colors',
              )}
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-900/30 px-4 py-2.5 text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl',
              'bg-amber-500 py-2.5 text-sm font-semibold text-white',
              'hover:bg-amber-600 active:bg-amber-700',
              'disabled:cursor-not-allowed disabled:opacity-60 transition-colors',
            )}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            Establecer nueva contraseña
          </button>

          <button
            type="button"
            onClick={logout}
            className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  )
}
