import { useEffect } from 'react'

type Handler = (e: KeyboardEvent) => void

/**
 * Global shortcuts. Keys are matched on `e.key` (lowercased); "mod+k" means ⌘K or Ctrl+K.
 * Ignored while typing in a field, except "escape" and "mod+…".
 */
export function useHotkeys(map: Record<string, Handler>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const id = (e.metaKey || e.ctrlKey ? 'mod+' : '') + (key === ' ' ? 'space' : key)
      const t = e.target as HTMLElement | null
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (typing && !id.startsWith('mod+') && id !== 'escape') return
      const fn = map[id]
      if (fn) fn(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [map])
}
