import { useEffect } from 'react'
import { useUserStore } from '@/stores/userStore'
import { useAuth } from '@/contexts/AuthContext'
import { userApi, authToken } from '@/lib/userApi'

/**
 * Carga y cachea en Zustand la blob URL del avatar del usuario.
 * Compartida entre Sidebar y ProfilePage para evitar fetches duplicados
 * una vez que ya está en el store.
 */
export function useAvatarUrl(): string | null {
  const { avatarBlobUrl, setAvatarBlobUrl } = useUserStore()
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.has_avatar || avatarBlobUrl) return

    fetch(userApi.profile.avatarContentUrl(), {
      headers: { Authorization: `Bearer ${authToken()}` },
    })
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(b => setAvatarBlobUrl(URL.createObjectURL(b)))
      .catch(() => {})
  }, [user?.has_avatar, avatarBlobUrl, setAvatarBlobUrl])

  return user?.has_avatar ? avatarBlobUrl : null
}
