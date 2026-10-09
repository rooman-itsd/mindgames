import type { ReactNode } from 'react'

/**
 * A compact round icon button — the Mentorship tabs' secondary actions.
 * `label` is the accessible name (what a screen reader says, and what the old
 * text button said); `tip` shows on hover; `count` adds a small badge.
 * `tone="muted"` is for quiet/destructive actions (Cancel) so they don't read
 * as the same weight as the green ones.
 */
export function IconAction({
  label,
  tip,
  count,
  tone = 'brand',
  onClick,
  children,
}: {
  label: string
  tip: string
  count?: number
  tone?: 'brand' | 'muted'
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={tip}
      className={`btn-press relative grid size-8 shrink-0 place-items-center rounded-full border transition-colors ${
        tone === 'brand'
          ? 'border-brand text-brand hover:bg-brand-50'
          : 'border-line text-muted hover:border-rosewood-600 hover:bg-rosewood-50 hover:text-rosewood-700'
      }`}
    >
      {children}
      {!!count && (
        <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      )}
    </button>
  )
}
