import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface UserProfile {
  id: string
  email: string
  name: string
  is_admin: boolean
  currency: string
  timezone: string
  has_avatar: boolean
}

interface UserStore {
  // Perfil — persistido en localStorage
  profile: UserProfile | null
  setProfile: (p: UserProfile) => void
  updateProfile: (p: Partial<UserProfile>) => void
  clearProfile: () => void

  // Blob URL del avatar — solo en memoria (no persiste)
  avatarBlobUrl: string | null
  setAvatarBlobUrl: (url: string | null) => void
}

export const useUserStore = create<UserStore>()(
  persist(
    set => ({
      profile: null,
      setProfile: profile => set({ profile }),
      updateProfile: partial =>
        set(s => ({ profile: s.profile ? { ...s.profile, ...partial } : null })),
      clearProfile: () => set({ profile: null, avatarBlobUrl: null }),

      avatarBlobUrl: null,
      setAvatarBlobUrl: avatarBlobUrl => set({ avatarBlobUrl }),
    }),
    {
      name: 'cg-user-profile',
      // Solo persiste el perfil, no el blob URL (ephemero)
      partialize: s => ({ profile: s.profile }),
    }
  )
)
