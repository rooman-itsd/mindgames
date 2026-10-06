import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from './index'

/**
 * An empty list that helps instead of shrugging: an icon tile, one warm line,
 * one line of context, and (optionally) the one action that fills the space.
 * `compact` drops the tile and padding for small inline lists.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  compact = false,
  className = '',
}: {
  icon?: ReactNode
  title: string
  body?: string
  action?: { label: string; to: string } | { label: string; onClick: () => void }
  compact?: boolean
  className?: string
}) {
  const button = action
    ? 'to' in action
      ? (
          <Link to={action.to}>
            <Button>{action.label}</Button>
          </Link>
        )
      : <Button onClick={action.onClick}>{action.label}</Button>
    : null

  if (compact) {
    return (
      <div className={`flex items-center gap-3 rounded-xl border border-dashed border-line bg-surface/60 px-4 py-3 ${className}`}>
        {icon && <span className="text-muted">{icon}</span>}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          {body && <p className="text-xs text-muted">{body}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center gap-2 rounded-xl border border-line bg-surface px-6 py-10 text-center shadow-sm ${className}`}>
      {icon && (
        <span aria-hidden className="relative mb-1 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-saffron-50 to-brand-50 text-brand">
          {icon}
          <span className="absolute -right-1 -top-1.5 text-sm text-marigold">✦</span>
        </span>
      )}
      <p className="text-base font-bold text-ink">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {button && <div className="mt-2">{button}</div>}
    </div>
  )
}
