import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

interface Props {
  onRenew: () => Promise<void>
  onExpire: () => void
}

const COUNTDOWN = 30

export function SessionExpiryModal({ onRenew, onExpire }: Props) {
  const [seconds, setSeconds]   = useState(COUNTDOWN)
  const [renewing, setRenewing] = useState(false)

  useEffect(() => {
    if (seconds <= 0) { onExpire(); return }
    const t = setTimeout(() => setSeconds(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds, onExpire])

  async function handleRenew() {
    setRenewing(true)
    try {
      await onRenew()
    } catch {
      setRenewing(false)
    }
  }

  const circumference = 2 * Math.PI * 28
  const progress      = circumference * (1 - seconds / COUNTDOWN)

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-xl p-6 text-center">

        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20">
          <Clock size={28} className="text-amber-500" />
        </div>

        <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Sesión por expirar</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
          Tu sesión expirará en menos de un minuto. ¿Deseas continuar conectado?
        </p>

        {/* Countdown ring */}
        <div className="my-5 flex items-center justify-center">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32" cy="32" r="28"
                fill="none" stroke="currentColor" strokeWidth="4"
                className="text-gray-100 dark:text-slate-700"
              />
              <circle
                cx="32" cy="32" r="28"
                fill="none" stroke="currentColor" strokeWidth="4"
                strokeLinecap="round"
                className="text-amber-400 transition-all duration-1000"
                strokeDasharray={circumference}
                strokeDashoffset={progress}
              />
            </svg>
            <span className="text-xl font-bold tabular-nums text-gray-800 dark:text-slate-100">
              {seconds}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onExpire}
            className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 py-2.5 text-sm font-medium text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cerrar sesión
          </button>
          <button
            onClick={handleRenew}
            disabled={renewing}
            className="flex-1 rounded-xl bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60 transition-colors"
          >
            {renewing ? 'Renovando…' : 'Continuar conectado'}
          </button>
        </div>
      </div>
    </div>
  )
}
