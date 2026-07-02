import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, ArrowLeft, CheckCircle } from 'lucide-react'
import logoUrl from '@/assets/logo.png'
import { cn } from '@/lib/utils'

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

type Step = 'email' | 'otp' | 'password' | 'done'

export function ForgotPasswordPage() {
  const [step, setStep]             = useState<Step>('email')
  const [email, setEmail]           = useState('')
  const [otp, setOtp]               = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPwd, setConfirmPwd]   = useState('')
  const [error, setError]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)

  const inputCls = cn(
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900',
    'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
    'placeholder:text-gray-400 dark:placeholder:text-slate-500',
    'outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100',
    'dark:focus:border-primary-500 dark:focus:ring-primary-900/30 transition-colors',
  )

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      await fetch(`${BASE}/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setStep('otp')
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault()
    setError(null); setLoading(true)
    try {
      const res = await fetch(`${BASE}/v1/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail ?? 'Código inválido o expirado')
      }
      const data = await res.json()
      setResetToken(data.reset_token)
      setStep('password')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de verificación')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPwd) { setError('Las contraseñas no coinciden'); return }
    if (newPassword.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    setError(null); setLoading(true)
    try {
      const res = await fetch(`${BASE}/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, new_password: newPassword }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail ?? 'Error al actualizar contraseña')
      }
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={logoUrl} alt="ControlGastos" className="h-14 w-14 rounded-2xl shadow-card" />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">ControlGastos</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">Recuperar contraseña</p>
        </div>

        {step === 'email' && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center mb-2">
              Ingresa tu correo y te enviaremos un código de verificación de 6 dígitos.
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Correo electrónico
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="tu@correo.com" className={inputCls} />
            </div>
            {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button type="submit" disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 transition-colors">
              {loading && <Loader2 size={16} className="animate-spin" />}
              Enviar código
            </button>
            <Link to="/login"
              className="flex items-center justify-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors">
              <ArrowLeft size={14} /> Volver al inicio de sesión
            </Link>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-4 text-center shadow-sm">
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Enviamos un código de 6 dígitos a <strong>{email}</strong>. Revisa tu bandeja de entrada.
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Código de verificación
              </label>
              <input
                type="text"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required autoFocus placeholder="123456" maxLength={6} inputMode="numeric"
                className={cn(inputCls, 'text-center text-2xl tracking-[0.4em] font-mono')}
              />
            </div>
            {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button type="submit" disabled={loading || otp.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60 transition-colors">
              {loading && <Loader2 size={16} className="animate-spin" />}
              Verificar código
            </button>
            <button type="button" onClick={() => { setStep('email'); setOtp(''); setError(null) }}
              className="flex w-full items-center justify-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 transition-colors">
              <ArrowLeft size={14} /> Ingresar otro correo
            </button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center mb-2">
              Elige tu nueva contraseña.
            </p>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Nueva contraseña
              </label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                required autoFocus minLength={8} placeholder="Mínimo 8 caracteres" className={inputCls} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Confirmar contraseña
              </label>
              <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                required placeholder="Repite la contraseña" className={inputCls} />
            </div>
            {error && <p className="rounded-xl bg-red-50 dark:bg-red-900/20 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button type="submit" disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60 transition-colors">
              {loading && <Loader2 size={16} className="animate-spin" />}
              Cambiar contraseña
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle size={22} className="text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-slate-100 mb-1">Contraseña actualizada</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">Ya puedes iniciar sesión con tu nueva contraseña.</p>
            <Link to="/login" className="mt-4 block text-xs text-primary-500 hover:underline">
              Ir al inicio de sesión
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}
