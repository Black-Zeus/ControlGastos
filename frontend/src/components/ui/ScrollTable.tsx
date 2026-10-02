import { cn } from '@/lib/utils'

// ─── ScrollTable ──────────────────────────────────────────────────────────────
// Contenedor para tablas <table> hechas a mano (las de DataTable ya hacen esto
// internamente). En mobile (< sm) la tabla conserva un ancho mínimo legible y
// se desplaza horizontalmente en lugar de comprimir columnas hasta encimarlas.
// Desde sm vuelve al ancho del contenedor, sin cambios en escritorio.

interface ScrollTableProps {
  /**
   * Clase Tailwind de ancho mínimo en mobile (p. ej. 'min-w-[540px]'). Necesaria
   * en tablas con `table-layout: fixed`. Si se omite, la tabla usa su ancho de
   * contenido (`min-w-max`), adecuado para tablas de layout automático.
   */
  minWidth?: string
  /** Ocupa el alto disponible en una card flex (cuerpo + pie alineados al fondo). */
  fill?: boolean
  /** Clases extra del contenedor con scroll (p. ej. scroll vertical acotado). */
  className?: string
  children: React.ReactNode
}

export function ScrollTable({ minWidth = 'min-w-max', fill = false, className, children }: ScrollTableProps) {
  return (
    <div className={cn('overflow-x-auto', fill && 'flex flex-1 flex-col', className)}>
      <div className={cn(minWidth, 'sm:min-w-0', fill && 'flex flex-1 flex-col')}>
        {children}
      </div>
    </div>
  )
}
