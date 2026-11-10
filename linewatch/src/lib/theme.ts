import { useCallback, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'
const KEY = 'linewatch-theme'

function stored(): Theme {
  try {
    const t = localStorage.getItem(KEY)
    if (t === 'light' || t === 'dark') return t
  } catch {
    // Storage can be blocked; fall through to the system preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(stored)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  const toggle = useCallback(
    () =>
      setTheme((t) => {
        const next = t === 'dark' ? 'light' : 'dark'
        try {
          localStorage.setItem(KEY, next)
        } catch {
          // Not remembered, still applied.
        }
        return next
      }),
    [],
  )
  return [theme, toggle]
}
