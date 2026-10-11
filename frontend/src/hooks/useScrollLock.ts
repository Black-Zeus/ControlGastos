import { useEffect } from 'react'

// ─── Bloqueo del scroll de la app mientras hay un modal abierto ───────────────
// Con contador: con modales apilados (p. ej. confirmación sobre un formulario) el
// scroll vuelve solo cuando se cierra el último. Se compensa el ancho de la barra
// de scroll para que el fondo no "salte" al ocultarla. El scroll que corresponda
// queda dentro del propio modal (su cuerpo usa overflow-y-auto + overscroll-contain).

let locks = 0
let saved: { htmlOverflow: string; bodyOverflow: string; bodyPaddingRight: string } | null = null

function lock() {
  if (locks++ > 0) return
  const { documentElement: html, body } = document
  const scrollbar = window.innerWidth - html.clientWidth
  saved = { htmlOverflow: html.style.overflow, bodyOverflow: body.style.overflow, bodyPaddingRight: body.style.paddingRight }
  html.style.overflow = 'hidden'
  body.style.overflow = 'hidden'
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
}

function unlock() {
  if (locks === 0 || --locks > 0 || !saved) return
  const { documentElement: html, body } = document
  html.style.overflow = saved.htmlOverflow
  body.style.overflow = saved.bodyOverflow
  body.style.paddingRight = saved.bodyPaddingRight
  saved = null
}

export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}

/** Para overlays escritos inline (`{open && <div className="fixed inset-0 …">}`): basta con
 *  renderizar `<ScrollLock />` dentro del overlay. */
export function ScrollLock() {
  useScrollLock()
  return null
}
