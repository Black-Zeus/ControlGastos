import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { SessionExpiryModal } from '@/components/SessionExpiryModal'

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
  login: (token: string, refresh: string) => Promise<AdminUser>
  logout: () => void
  clearMustChangePwd: () => void
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

const ACCESS_KEY  = 'cg_admin_access'
const REFRESH_KEY = 'cg_admin_refresh'
const API_BASE    = import.meta.env.VITE_API_BASE_URL ?? ''

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
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error('Token inválido')
    const me = await res.json()
    if (!me.is_admin) throw new Error('No es administrador')
    return me as AdminUser
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem(ACCESS_KEY)
    if (!stored) { setIsLoading(false); return }

    fetchMe(stored)
      .then(me => {
        setToken(stored)
        setAdmin(me)
        setMustChangePwd(me.must_change_password ?? false)
        scheduleWarning(stored)
      })
      .catch(() => {
        localStorage.removeItem(ACCESS_KEY)
        localStorage.removeItem(REFRESH_KEY)
      })
      .finally(() => setIsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (accessToken: string, refreshToken: string): Promise<AdminUser> => {
    localStorage.setItem(ACCESS_KEY, accessToken)
    localStorage.setItem(REFRESH_KEY, refreshToken)
    const me = await fetchMe(accessToken)
    setToken(accessToken)
    setAdmin(me)
    setMustChangePwd(me.must_change_password ?? false)
    scheduleWarning(accessToken)
    return me
  }, [fetchMe, scheduleWarning])

  const clearMustChangePwd = useCallback(() => setMustChangePwd(false), [])

  const logout = useCallback(() => {
    clearTimer()
    setShowExpiry(false)
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    setToken(null)
    setAdmin(null)
    setMustChangePwd(false)
  }, [clearTimer])

  const renewSession = useCallback(async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (!refreshToken) { logout(); return }
    const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) { logout(); return }
    const { access_token, refresh_token } = await res.json()
    localStorage.setItem(ACCESS_KEY, access_token)
    localStorage.setItem(REFRESH_KEY, refresh_token)
    setToken(access_token)
    setShowExpiry(false)
    scheduleWarning(access_token)
  }, [logout, scheduleWarning])

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
