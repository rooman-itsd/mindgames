import { useEffect, useState } from 'react'

/**
 * Opt-in dark mode, remembered per device. Light is the default.
 *
 *   useTheme()       [theme, setTheme] — for the Settings toggle
 *   useApplyTheme()  puts `dark` on <html> while the signed-in app is mounted,
 *                    and takes it off again on unmount, so Landing and the
 *                    sign-in screens always stay as designed.
 */
export type Theme = 'light' | 'dark'

const KEY = 'rc-theme'
const CHANGED = 'rc-theme-change'

function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function writeTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Private mode / blocked storage: the choice just won't persist.
  }
  window.dispatchEvent(new Event(CHANGED))
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(readTheme)
  useEffect(() => {
    const sync = () => setTheme(readTheme())
    window.addEventListener(CHANGED, sync)
    window.addEventListener('storage', sync) // another tab changed it
    return () => {
      window.removeEventListener(CHANGED, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return [theme, writeTheme]
}

export function useApplyTheme() {
  const [theme] = useTheme()
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    return () => document.documentElement.classList.remove('dark')
  }, [theme])
}
