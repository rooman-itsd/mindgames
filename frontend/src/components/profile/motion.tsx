// Motion primitives for the profile page.
//
// Every one of these degrades to "just render it" under
// `prefers-reduced-motion`, matching the treatment BlurText already uses — an
// animated profile shouldn't be a vestibular hazard, and reviewers of this
// codebase already expect that opt-out to be honoured.

import { motion, useInView, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Fades and lifts a section into place the first time it scrolls into view.
 * `index` staggers siblings so a column of cards arrives as a cascade rather
 * than all at once.
 */
export function Reveal({
  children,
  index = 0,
  className,
}: {
  children: ReactNode
  index?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  // once: true — re-animating on every scroll past is nauseating.
  const inView = useInView(ref, { once: true, margin: '-40px' })

  if (reduced) return <div className={className}>{children}</div>

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : undefined}
      transition={{
        duration: 0.45,
        // Cap the stagger: with a dozen sections, index * delay would leave
        // the last one arriving a second and a half late.
        delay: Math.min(index, 6) * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  )
}

/** Counts a number up when it first appears. Used for the stat strip. */
export function CountUp({ to, className }: { to: number; className?: string }) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [shown, setShown] = useState(reduced ? to : 0)

  useEffect(() => {
    if (reduced || !inView) {
      setShown(to)
      return
    }
    // Short, ease-out ramp. Small numbers finish almost immediately, which is
    // what you want — nobody needs to watch "3" being counted to.
    const duration = Math.min(700, 180 + to * 6)
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      setShown(Math.round(to * (1 - Math.pow(1 - p, 3))))
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [to, inView, reduced])

  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString('en-IN')}
    </span>
  )
}

/**
 * The completeness ring, drawn as an SVG arc so the sweep can be animated.
 * A conic-gradient div can't tween, which is why this isn't one.
 */
export function ProgressRing({
  percent,
  size = 72,
  children,
}: {
  percent: number
  size?: number
  children?: ReactNode
}) {
  const reduced = useReducedMotion()
  const stroke = 6
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const done = percent >= 100

  // A spring on the dash offset makes the arc sweep round on mount and glide
  // whenever the percentage changes (e.g. right after a save).
  const spring = useSpring(reduced ? percent : 0, { stiffness: 60, damping: 18 })
  useEffect(() => {
    spring.set(percent)
  }, [percent, spring])
  const offset = useTransform(spring, (p) => circumference * (1 - Math.min(100, p) / 100))

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={done ? '#16a34a' : 'var(--color-brand)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: offset }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

/** Lifts a card slightly on hover. No-op on touch, where hover never fires. */
export function HoverLift({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      {children}
    </motion.div>
  )
}

export { motion, useReducedMotion }
