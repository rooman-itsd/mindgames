/**
 * Loading placeholders shaped like the content that is on its way. A spinner
 * says "wait"; a skeleton says "here it comes", so the screen feels faster
 * and nothing jumps when the real content lands. Shimmer lives in index.css
 * (.skeleton) and holds still under prefers-reduced-motion.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`skeleton block rounded-md ${className}`} />
}

/** Avatar + two lines, repeated — for lists of people, sessions, attendees. */
export function SkeletonRows({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`grid gap-4 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Written out in full: Tailwind only generates classes it finds verbatim.
const COLS = ['sm:grid-cols-1', 'sm:grid-cols-1', 'sm:grid-cols-2', 'sm:grid-cols-3']

/** Card-shaped placeholders — for plan pickers and card grids. */
export function SkeletonCards({ count = 3, className = '' }: { count?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={`grid gap-3 ${COLS[Math.min(count, 3)]} ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-line bg-surface p-5">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-4/5" />
          <Skeleton className="mt-2 h-9 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** A whole page arriving: title, subtitle, then a few content cards. */
export function SkeletonPage() {
  return (
    <div role="status" aria-label="Loading" className="grid gap-4 py-2">
      <Skeleton className="h-7 w-1/3" />
      <Skeleton className="h-3 w-1/2" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-5/6" />
        </div>
      ))}
    </div>
  )
}
