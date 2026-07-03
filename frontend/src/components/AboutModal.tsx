import { X } from 'lucide-react'
import logoUrl from '@/assets/logo.png'

interface AboutModalProps {
  open: boolean
  onClose: () => void
}

const FEATURES = [
  'Registro de ingresos y egresos organizados por período',
  'Cierre mensual con balance y reporte en PDF',
  'Categorías y tipos de ingreso personalizables',
  'Reportes de comparación, tendencia y por categoría',
  'Ingesta de boletas por correo con lectura automática (OCR)',
  'Recordatorios diarios de compromisos pendientes',
  'Panel de administración multiusuario',
]

export function AboutModal({ open, onClose }: AboutModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-xl p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
        >
          <X size={18} />
        </button>

        <div className="flex flex-col items-center text-center">
          <img src={logoUrl} alt="ControlGastos" className="h-16 w-16 rounded-2xl shadow-sm" />
          <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-slate-100">ControlGastos</h2>
          <span className="mt-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-slate-800 dark:text-slate-400">
            v{__APP_VERSION__}
          </span>
          <p className="mt-4 text-sm leading-relaxed text-gray-600 dark:text-slate-400">
            Control financiero personal y domiciliario: un solo lugar para llevar el detalle
            de los gastos e ingresos del hogar, cerrar el mes y ver hacia dónde va la plata.
          </p>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4 dark:border-slate-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
            Qué cubre
          </p>
          <ul className="space-y-1.5 text-sm text-gray-600 dark:text-slate-400">
            {FEATURES.map(feature => (
              <li key={feature} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary-400" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-5 text-center text-[11px] text-gray-400 dark:text-slate-500">
          Hecho con FastAPI, React y mucho café.
        </p>
      </div>
    </div>
  )
}
