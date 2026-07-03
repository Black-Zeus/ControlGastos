import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'

const THRESHOLD = 40

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)
  const scrollTargetRef = useRef<HTMLElement | Window>(window)

  useEffect(() => {
    // capture:true — así también detecta el scroll de paneles internos
    // (overflow-y-auto), no solo el de la ventana.
    function handleScroll(e: Event) {
      const raw = e.target === document ? document.documentElement : e.target
      const el = raw instanceof HTMLElement ? raw : null
      const scrollTop = el ? el.scrollTop : window.scrollY

      if (scrollTop > THRESHOLD) {
        scrollTargetRef.current = el ?? window
        setVisible(true)
      } else {
        setVisible(false)
      }
    }
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [])

  if (!visible) return null

  return (
    <button
      onClick={() => scrollTargetRef.current.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Volver arriba"
      title="Volver arriba"
      className="fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg transition-colors hover:bg-primary-600"
    >
      <ArrowUp size={18} />
    </button>
  )
}
