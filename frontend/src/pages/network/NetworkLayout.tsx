import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useApp } from '../../store/AppStore'
import { ProfileQuickView } from '../../components/network/ProfileQuickView'

const TABS = [
  { to: 'matches', label: 'Matches' },
  { to: 'requests', label: 'Requests' },
  { to: 'mentors', label: 'Mentors' },
  { to: 'my-network', label: 'My Network' },
]

// Context handed to every /network/* tab via <Outlet context>: lets a card
// open the quick-view drawer instead of navigating to the full profile page.
export interface NetworkOutletContext {
  openQuickView: (userId: string) => void
}

// Shared shell for /network/* — sub-header tab bar + whichever tab is routed,
// plus the one shared quick-view drawer instance for all of them.
export function NetworkLayout() {
  const { refreshNetwork } = useApp()
  const [quickViewId, setQuickViewId] = useState<string | null>(null)

  // Pull the latest graph on entry so requests sent by others show up.
  useEffect(() => {
    refreshNetwork()
  }, [refreshNetwork])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-ink">My Network</h1>

      <div className="flex items-center rounded-xl border border-line bg-surface px-2 shadow-sm">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `relative px-4 py-3 text-sm font-semibold transition-colors ${
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

      <Outlet context={{ openQuickView: setQuickViewId } satisfies NetworkOutletContext} />

      {quickViewId && <ProfileQuickView userId={quickViewId} onClose={() => setQuickViewId(null)} />}
    </div>
  )
}
