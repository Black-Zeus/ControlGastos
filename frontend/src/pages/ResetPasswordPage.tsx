import { useState, useEffect, type FormEvent } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import logoUrl from '@/assets/logo.png'
import { cn } from '@/lib/utils'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

type PageState = 'validating' | 'invalid' | 'form' | 'success'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate  = useNavigate()
  const token     = params.get('token') ?? ''
  const type      = params.get('type') ?? 'reset'  // 'reset' | 'setup'

  const [pageState, setPageState] = useState<PageState>('validating')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPwd,   setShowPwd]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    if (!token) { setPageState('invalid'); return }
    fetch(`${BASE}/v1/auth/validate-reset-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then(r => setPageState(r.ok ? 'form' : 'invalid'))
      .catch(() => setPageState('invalid'))
  }, [token])

  const isSetup = type === 'setup'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    if (password.length < 8)  { setError('Mínimo 8 caracteres'); return }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail ?? 'Error al restablecer')
      }
      setPageState('success')
      setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  const inputCls = cn(
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900',
    'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
    'placeholder:text-gray-400 dark:placeholder:text-slate-500',
    'outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100',
    'dark:focus:border-primary-500 dark:focus:ring-primary-900/30 transition-colors',
  )

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={logoUrl} alt="ControlGastos" className="h-14 w-14 rounded-2xl shadow-card" />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">ControlGastos</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {isSetup ? 'Activar cuenta' : 'Nueva contraseña'}
          </p>
        </div>

        {pageState === 'validating' && (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="animate-spin text-primary-500" />
          </div>
        )}

        {pageState === 'invalid' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/30 p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertCircle size={22} className="text-red-600 dark:text-red-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Enlace inválido o expirado</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              El enlace ya fue usado o ha expirado. Solicita uno nuevo.
            </p>
            <Link to="/forgot-password" className="mt-4 block text-xs text-primary-500 hover:underline">
              Solicitar nuevo enlace
            </Link>
          </div>
        )}

        {pageState === 'success' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle size={22} className="text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">
              {isSetup ? '¡Cuenta activada!' : '¡Contraseña actualizada!'}
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              Redirigiendo al inicio de sesión…
            </p>
          </div>
        )}

        {pageState === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSetup && (
              <p className="text-sm text-gray-500 dark:text-slate-400 text-center mb-2">
                Crea una contraseña para activar tu cuenta.
              </p>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Nueva contraseña
              </label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoFocus
                  minLength={8}
                  placeholder="Mínimo 8 caracteres"
                  className={cn(inputCls, 'pr-10')}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Confirmar contraseña
              </label>
              <input
                type={showPwd ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="Repite la contraseña"
                className={inputCls}
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
                'disabled:cursor-not-allowed disabled:opacity-60 transition-colors',
              )}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {isSetup ? 'Activar cuenta' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
