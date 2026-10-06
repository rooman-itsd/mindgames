import { useEffect, useRef, useState } from 'react'

/**
 * Rolls a number up from 0 the first time it scrolls into view (1.2s,
 * ease-out). Renders the final value straight away for reduced motion, and
 * before the observer fires, so the real number is never missing.
 */
export function CountUp({ value, className = '' }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(value)
  const played = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || played.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value)
      return
    }
    let raf = 0
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        io.disconnect()
        played.current = true
        const start = performance.now()
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / 1200)
          setShown(Math.round(value * (1 - Math.pow(1 - p, 3))))
          if (p < 1) raf = requestAnimationFrame(step)
        }
        raf = requestAnimationFrame(step)
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value])

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {shown.toLocaleString('en-IN')}
    </span>
  )
}
