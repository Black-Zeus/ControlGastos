import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useUserStore, type UserProfile } from '@/stores/userStore'
import { SessionExpiryModal } from '@/components/SessionExpiryModal'
import { setAuthToken } from '@/lib/userApi'

export type AuthUser = UserProfile

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  login: (accessToken: string) => Promise<AuthUser>
  logout: () => void
  updateUser: (partial: Partial<AuthUser>) => void
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

function getTokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { profile, setProfile, updateProfile, clearProfile } = useUserStore()

  const [token, setToken]           = useState<string | null>(null)
  const [isLoading, setIsLoading]   = useState(true)
  const [showExpiry, setShowExpiry] = useState(false)
  const timerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const fetchMe = useCallback(async (accessToken: string): Promise<AuthUser> => {
    const res = await fetch(`${API_BASE}/v1/auth/me`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error('Token inválido')
    return res.json() as Promise<AuthUser>
  }, [])

  const applyToken = useCallback((accessToken: string) => {
    setAuthToken(accessToken)
    setToken(accessToken)
    scheduleWarning(accessToken)
  }, [scheduleWarning])

  // Restaurar sesión al cargar: el access token vive solo en memoria (no
  // sobrevive un refresh de página), así que se intenta renovar en
  // silencio usando la cookie httpOnly de refresh, si existe.
  useEffect(() => {
    fetch(`${API_BASE}/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async res => {
        if (!res.ok) throw new Error('Sin sesión activa')
        const { access_token } = await res.json()
        const me = await fetchMe(access_token)
        applyToken(access_token)
        setProfile(me)
      })
      .catch(() => {
        clearProfile()
      })
      .finally(() => setIsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (accessToken: string): Promise<AuthUser> => {
    const me = await fetchMe(accessToken)
    applyToken(accessToken)
    setProfile(me)
    return me
  }, [fetchMe, setProfile, applyToken])

  const logout = useCallback(() => {
    clearTimer()
    setShowExpiry(false)
    setAuthToken('')
    setToken(null)
    clearProfile()
    fetch(`${API_BASE}/v1/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {})
  }, [clearProfile, clearTimer])

  const renewSession = useCallback(async () => {
    const res = await fetch(`${API_BASE}/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
    if (!res.ok) { logout(); return }
    const { access_token } = await res.json()
    applyToken(access_token)
    setShowExpiry(false)
  }, [logout, applyToken])

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    updateProfile(partial)
  }, [updateProfile])

  const refreshMe = useCallback(async () => {
    if (!token) return
    const me = await fetchMe(token)
    setProfile(me)
  }, [fetchMe, setProfile, token])

  return (
    <AuthContext.Provider value={{ user: profile, token, isLoading, login, logout, updateUser, refreshMe }}>
      {children}
      {showExpiry && (
        <SessionExpiryModal onRenew={renewSession} onExpire={logout} />
      )}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
