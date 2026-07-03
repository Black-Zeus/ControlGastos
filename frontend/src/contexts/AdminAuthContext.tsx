import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { SessionExpiryModal } from '@/components/SessionExpiryModal'
import { setAuthToken } from '@/lib/adminApi'

interface AdminUser {
  id: string
  email: string
  name: string
  is_admin: true
  currency: string
  must_change_password: boolean
}

interface AdminAuthContextValue {
  admin: AdminUser | null
  token: string | null
  isLoading: boolean
  mustChangePwd: boolean
  login: (accessToken: string) => Promise<AdminUser>
  logout: () => void
  clearMustChangePwd: () => void
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

function getTokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch { return null }
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin]               = useState<AdminUser | null>(null)
  const [token, setToken]               = useState<string | null>(null)
  const [isLoading, setIsLoading]       = useState(true)
  const [showExpiry, setShowExpiry]     = useState(false)
  const [mustChangePwd, setMustChangePwd] = useState(false)
  const timerRef                        = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const scheduleWarning = useCallback((accessToken: string) => {
    clearTimer()
    const exp = getTokenExp(accessToken)
    if (!exp) return
    const delay = exp * 1000 - Date.now() - 60_000
    if (delay <= 0) { setShowExpiry(true); return }
    timerRef.current = setTimeout(() => setShowExpiry(true), delay)
  }, [clearTimer])

  const fetchMe = useCallback(async (accessToken: string): Promise<AdminUser> => {
    const res = await fetch(`${API_BASE}/v1/auth/me`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error('Token inválido')
    const me = await res.json()
    if (!me.is_admin) throw new Error('No es administrador')
    return me as AdminUser
  }, [])

  const applyToken = useCallback((accessToken: string) => {
    setAuthToken(accessToken)
    setToken(accessToken)
    scheduleWarning(accessToken)
  }, [scheduleWarning])

  // Restaurar sesión al cargar usando la cookie httpOnly de refresh de admin
  // (separada de la de usuario regular — ver ADMIN_REFRESH_COOKIE_NAME en el backend).
  useEffect(() => {
    fetch(`${API_BASE}/v1/admin/refresh`, { method: 'POST', credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error('Sin sesión activa')
        const { access_token } = await res.json()
        const me = await fetchMe(access_token)
        applyToken(access_token)
        setAdmin(me)
        setMustChangePwd(me.must_change_password ?? false)
      })
      .catch(() => {
        // No hay sesión de admin activa (o la cookie pertenece a un usuario no-admin)
      })
      .finally(() => setIsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (accessToken: string): Promise<AdminUser> => {
    const me = await fetchMe(accessToken)
    applyToken(accessToken)
    setAdmin(me)
    setMustChangePwd(me.must_change_password ?? false)
    return me
  }, [fetchMe, applyToken])

  const clearMustChangePwd = useCallback(() => setMustChangePwd(false), [])

  const logout = useCallback(() => {
    clearTimer()
    setShowExpiry(false)
    setAuthToken('')
    setToken(null)
    setAdmin(null)
    setMustChangePwd(false)
    fetch(`${API_BASE}/v1/admin/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
  }, [clearTimer])

  const renewSession = useCallback(async () => {
    const res = await fetch(`${API_BASE}/v1/admin/refresh`, { method: 'POST', credentials: 'include' })
    if (!res.ok) { logout(); return }
    const { access_token } = await res.json()
    applyToken(access_token)
    setShowExpiry(false)
  }, [logout, applyToken])

  return (
    <AdminAuthContext.Provider value={{ admin, token, isLoading, mustChangePwd, login, logout, clearMustChangePwd }}>
      {children}
      {showExpiry && (
        <SessionExpiryModal onRenew={renewSession} onExpire={logout} />
      )}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext)
  if (!ctx) throw new Error('useAdminAuth debe usarse dentro de AdminAuthProvider')
  return ctx
}
