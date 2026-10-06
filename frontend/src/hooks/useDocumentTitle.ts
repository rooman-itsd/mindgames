import { useEffect } from 'react'

/** Must match <title> in index.html. */
const DEFAULT_TITLE = 'Root Connect — Rooman Alumni Network'

/**
 * Sets the browser-tab title while the calling screen is mounted, and puts the
 * default back when it unmounts — so a screen without its own title never
 * inherits a stale one (React runs the old screen's cleanup before the new
 * screen's effect, so the next title still wins).
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title
    return () => {
      document.title = DEFAULT_TITLE
    }
  }, [title])
}
