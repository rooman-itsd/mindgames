import { useEffect, useState } from 'react'

/**
 * True while the media query matches, updating when the window crosses it.
 * Home uses it to deal posts into two columns on wider screens — CSS columns
 * alone would fill the left column first and push newer posts down the right.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}
