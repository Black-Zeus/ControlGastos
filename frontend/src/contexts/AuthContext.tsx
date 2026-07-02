import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useUserStore, type UserProfile } from '@/stores/userStore'
import { SessionExpiryModal } from '@/components/SessionExpiryModal'

export type AuthUser = UserProfile

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  login: (token: string, refresh: string) => Promise<AuthUser>
  logout: () => void
  updateUser: (partial: Partial<AuthUser>) => void
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ACCESS_KEY  = 'cg_access'
const REFRESH_KEY = 'cg_refresh'
const API_BASE    = import.meta.env.VITE_API_BASE_URL ?? ''

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
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error('Token inválido')
    return res.json() as Promise<AuthUser>
  }, [])

  // Restaurar sesión al cargar
  useEffect(() => {
    const stored = localStorage.getItem(ACCESS_KEY)
    if (!stored) { setIsLoading(false); return }

    fetchMe(stored)
      .then(me => {
        setToken(stored)
        setProfile(me)
        scheduleWarning(stored)
      })
      .catch(() => {
        localStorage.removeItem(ACCESS_KEY)
        localStorage.removeItem(REFRESH_KEY)
        clearProfile()
      })
      .finally(() => setIsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (accessToken: string, refreshToken: string): Promise<AuthUser> => {
    localStorage.setItem(ACCESS_KEY, accessToken)
    localStorage.setItem(REFRESH_KEY, refreshToken)
    const me = await fetchMe(accessToken)
    setToken(accessToken)
    setProfile(me)
    scheduleWarning(accessToken)
    return me
  }, [fetchMe, setProfile, scheduleWarning])

  const logout = useCallback(() => {
    clearTimer()
    setShowExpiry(false)
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    setToken(null)
    clearProfile()
  }, [clearProfile, clearTimer])

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

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    updateProfile(partial)
  }, [updateProfile])

  const refreshMe = useCallback(async () => {
    const stored = localStorage.getItem(ACCESS_KEY)
    if (!stored) return
    const me = await fetchMe(stored)
    setProfile(me)
  }, [fetchMe, setProfile])

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
