import { useState, useEffect } from 'react'
import { userApi } from '@/lib/userApi'

export function useResponsibleTags() {
  const [tags, setTags] = useState<string[]>([])

  useEffect(() => {
    userApi.profile.getResponsibleTags()
      .then(setTags)
      .catch(() => {})
  }, [])

  async function addTag(tag: string) {
    if (!tag.trim()) return
    try {
      const updated = await userApi.profile.addResponsibleTag(tag.trim())
      setTags(updated)
    } catch {
      // no bloquear el guardado del formulario principal
    }
  }

  return { tags, addTag }
}
