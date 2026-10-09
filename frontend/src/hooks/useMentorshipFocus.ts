import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

// Written out in full so Tailwind generates them (it only sees literal class names).
const HIGHLIGHT = ['ring-2', 'ring-marigold', 'ring-offset-2']

/**
 * The sidebar calendar links to a session with ?tab=…&focus=<id>. Once the
 * row (element id "row-<id>") is on screen, scroll to it and ring it briefly,
 * then drop ?focus so a refresh doesn't do it again. Group lists load after
 * the first render, so it waits a little for the row to appear.
 */
export function useMentorshipFocus() {
  const [params, setParams] = useSearchParams()
  const focus = params.get('focus')
  useEffect(() => {
    if (!focus) return
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    const done = () =>
      setParams((prev) => { const p = new URLSearchParams(prev); p.delete('focus'); return p }, { replace: true })
    const tick = () => {
      const el = document.getElementById(`row-${focus}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add(...HIGHLIGHT)
        setTimeout(() => el.classList.remove(...HIGHLIGHT), 2500)
        done()
      } else if (++tries < 30) {
        timer = setTimeout(tick, 100)
      } else {
        done() // the tab is already open; nothing more to point at
      }
    }
    timer = setTimeout(tick, 50)
    return () => clearTimeout(timer)
  }, [focus, setParams])
}

/** The id the calendar asked to focus, for tabs that must un-hide it first. */
export function useFocusId(): string | null {
  return useSearchParams()[0].get('focus')
}
