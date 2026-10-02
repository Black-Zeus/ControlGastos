import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Modal compartido ─────────────────────────────────────────────────────────
// Reemplaza las copias locales de `Modal` de cada página. En mobile ocupa casi
// todo el viewport (dvh, para respetar la barra de navegación de Android) y el
// cuerpo hace scroll propio, dejando el encabezado (título + X) siempre visible.

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

const MAX_W: Record<ModalSize, string> = {
  sm:    'sm:max-w-md',
  md:    'sm:max-w-lg',
  lg:    'sm:max-w-2xl',
  xl:    'sm:max-w-4xl',
  '2xl': 'sm:max-w-5xl',
}

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  size?: ModalSize
}

export function Modal({ title, onClose, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex w-full flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-900',
          'max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)]',
          MAX_W[size],
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-800 sm:px-6 sm:py-4">
          <h2 className="min-w-0 text-base font-semibold text-gray-900 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  )
}
