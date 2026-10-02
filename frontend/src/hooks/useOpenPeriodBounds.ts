import { useEffect, useState } from 'react'
import { userApi } from '@/lib/userApi'

/**
 * Límites (YYYY-MM-DD) del período abierto, para acotar los calendarios: todo
 * registro solo acepta fechas dentro de él (el backend también lo valida).
 */
export function useOpenPeriodBounds(): { min?: string; max?: string } {
  const [bounds, setBounds] = useState<{ min?: string; max?: string }>({})

  useEffect(() => {
    let alive = true
    userApi.periods.current()
      .then(p => {
        if (!alive) return
        const mm = String(p.month).padStart(2, '0')
        const last = String(new Date(p.year, p.month, 0).getDate()).padStart(2, '0')
        setBounds({ min: `${p.year}-${mm}-01`, max: `${p.year}-${mm}-${last}` })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  return bounds
}
