import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { EventQuickView } from './EventQuickView'

const TABS = [
  { to: 'upcoming', label: 'Upcoming' },
  { to: 'my-events', label: 'My Registered Events' },
  { to: 'past', label: 'Past Webinars & Recordings' },
  { to: 'host', label: 'Host an Event' },
]

// Context handed to every /events/* tab via <Outlet context>: lets a card
// open the quick-view drawer instead of navigating away.
export interface EventsOutletContext {
  openQuickView: (eventId: string) => void
}

// Shared shell for /events/* — sub-header tab bar + whichever tab is routed,
// plus the one shared quick-view drawer instance for all of them.
export function EventsLayout() {
  const [quickViewId, setQuickViewId] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-ink">Events</h1>

      <div className="flex flex-wrap items-center rounded-xl border border-line bg-surface px-2 shadow-sm">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `relative px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
                isActive ? 'text-brand' : 'text-muted hover:text-ink'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {t.label}
                {isActive && <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-brand" />}
              </>
            )}
          </NavLink>
        ))}
      </div>

      <Outlet context={{ openQuickView: setQuickViewId } satisfies EventsOutletContext} />

      {quickViewId && <EventQuickView eventId={quickViewId} onClose={() => setQuickViewId(null)} />}
    </div>
  )
}
