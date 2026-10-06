import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Bell, Briefcase, Home, LayoutGrid, Plus, Settings, ShieldCheck, User as UserIcon, Users, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { useLayout } from './LayoutContext'
import { NAV } from './navItems'

/**
 * Phone and tablet navigation (below lg, where the sidebar is hidden): a
 * bottom tab bar with Home, Network, a centre Create button, Jobs, and More —
 * a bottom sheet listing every section from NAV, so nothing is unreachable.
 */
const TABS = [
  { to: '/home', label: 'Home', icon: Home, color: 'text-brand', bar: 'bg-brand' },
  { to: '/network', label: 'Network', icon: Users, color: 'text-lagoon-700', bar: 'bg-lagoon-600' },
  { to: '/jobs', label: 'Jobs', icon: Briefcase, color: 'text-iris-700', bar: 'bg-iris-600' },
]

export function MobileTabBar() {
  const { currentUser, unreadNotifications } = useApp()
  const { openComposer } = useLayout()
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  // Close the sheet whenever the route changes or Escape is pressed.
  useEffect(() => setMoreOpen(false), [pathname])
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const tab = (t: (typeof TABS)[number]) => (
    <NavLink
      key={t.to}
      to={t.to}
      className={({ isActive }) =>
        `relative flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-semibold ${isActive ? t.color : 'text-muted'}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span aria-hidden className={`absolute top-0 h-[3px] w-7 rounded-b ${t.bar}`} />}
          <t.icon size={21} />
          {t.label}
        </>
      )}
    </NavLink>
  )

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 px-1 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md lg:hidden"
      >
        {tab(TABS[0])}
        {tab(TABS[1])}
        <button
          type="button"
          onClick={() => openComposer()}
          aria-label="Create post"
          className="flex justify-center"
        >
          <span className="btn-primary -mt-5 grid h-12 w-12 place-items-center rounded-full shadow-lg">
            <Plus size={24} />
          </span>
        </button>
        {tab(TABS[2])}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className={`relative flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-semibold ${moreOpen ? 'text-saffron-700' : 'text-muted'}`}
        >
          <LayoutGrid size={21} />
          More
          {unreadNotifications > 0 && (
            <span className="absolute right-[calc(50%-18px)] top-1 h-2 w-2 rounded-full bg-clay-600" aria-label="Unread notifications" />
          )}
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="All sections"
            onClick={(e) => e.stopPropagation()}
            className="animate-slidein absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-2xl"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-300" aria-hidden />
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-bold text-ink">All sections</p>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {NAV.map(({ to, label, icon: Icon, tone }) => (
                <Link key={to} to={to} className="flex flex-col items-center gap-1.5 rounded-2xl bg-panel px-2 py-3 text-center text-xs font-semibold text-ink">
                  <Icon size={22} className={tone.icon} />
                  {label}
                </Link>
              ))}
            </div>
            <div className="mt-3 grid gap-1 border-t border-line pt-3">
              <Link to="/profile" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-gray-50">
                <UserIcon size={18} className="text-muted" /> Your profile
              </Link>
              <Link to="/notifications" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-gray-50">
                <Bell size={18} className="text-muted" /> Notifications
                {unreadNotifications > 0 && (
                  <span className="ml-auto rounded-full bg-clay-600 px-2 text-xs font-bold text-white">{unreadNotifications}</span>
                )}
              </Link>
              <Link to="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-gray-50">
                <Settings size={18} className="text-muted" /> Settings
              </Link>
              {currentUser.isAdmin && (
                <Link to="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand hover:bg-gray-50">
                  <ShieldCheck size={18} /> Admin Console
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
