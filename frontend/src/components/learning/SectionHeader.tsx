import type { ReactNode } from 'react'

/** Icon + title + one-line explanation, with an optional "View all" link. */
export function SectionHeader({
  icon,
  title,
  sub,
  onViewAll,
}: {
  icon: ReactNode
  title: string
  sub?: string
  onViewAll?: () => void
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-brand">{icon}</span>
        <div>
          <h2 className="text-base font-bold text-ink">{title}</h2>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
      </div>
      {onViewAll && (
        <button onClick={onViewAll} className="shrink-0 text-xs font-semibold text-brand hover:underline">
          View all →
        </button>
      )}
    </div>
  )
}

/** The responsive card grid every tab uses.
 *
 *  Two columns, not four: a card carries a person (avatar, name, role) above
 *  the thing itself, and at four across the column is ~185px, which truncates
 *  "P Tejaswini" to "P Tej…" — the one thing on the card that must stay
 *  readable. The page's own sidebar already takes the width four would need.
 *
 *  grid-cols-1 (minmax(0, 1fr)) is needed even for one column: an implicit
 *  column grows to its longest unbreakable content, and a long link pushed
 *  cards past a phone's width. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">{children}</div>
}

/** "Load more" for keyset-paged lists; hidden once a short page arrives. */
export function LoadMore({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <div className="mt-3 flex justify-center">
      <button
        onClick={onClick}
        disabled={loading}
        className="rounded-full border border-line bg-surface px-4 py-1.5 text-xs font-semibold text-ink hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? 'Loading…' : 'Load more'}
      </button>
    </div>
  )
}
