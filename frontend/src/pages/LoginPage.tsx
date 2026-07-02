import { useState, type FormEvent } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import logoUrl from '@/assets/logo.png'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail ?? 'Error al iniciar sesión')
      }
      const { access_token, refresh_token } = await res.json()
      await login(access_token, refresh_token)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={logoUrl} alt="ControlGastos" className="h-14 w-14 rounded-2xl shadow-card" />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">ControlGastos</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">Ingresa a tu cuenta</p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="tu@correo.com"
              className={cn(
                'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900',
                'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
                'placeholder:text-gray-400 dark:placeholder:text-slate-500',
                'outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100',
                'dark:focus:border-primary-500 dark:focus:ring-primary-900/30',
                'transition-colors',
              )}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className={cn(
                'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900',
                'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
                'placeholder:text-gray-400 dark:placeholder:text-slate-500',
                'outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100',
                'dark:focus:border-primary-500 dark:focus:ring-primary-900/30',
                'transition-colors',
              )}
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl',
              'bg-primary-500 py-2.5 text-sm font-semibold text-white',
              'hover:bg-primary-600 active:bg-primary-700',
              'disabled:cursor-not-allowed disabled:opacity-60',
              'transition-colors',
            )}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Iniciar sesión
          </button>

          <div className="text-center">
            <Link
              to="/forgot-password"
              className="text-xs text-gray-400 dark:text-slate-500 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
