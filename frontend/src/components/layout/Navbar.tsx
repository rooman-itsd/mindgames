import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  Crown,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { OPEN_PALETTE_EVENT } from './CommandPalette'
import { useLayout } from './LayoutContext'
import { Avatar } from '../ui'
import { NotificationsDropdown } from './NotificationsDropdown'
import { SearchDropdown } from './SearchDropdown'
import { SubscriptionPanel } from '../subscription/SubscriptionPanel'

export function Navbar() {
  const { currentUser, query, setQuery, unreadNotifications, unreadMessages, signOut } = useApp()
  const { openComposer, toggleChat } = useLayout()
  const navigate = useNavigate()

  const [showNotifs, setShowNotifs] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const { subscription } = useApp()
  // Reads the server's own answer rather than re-deriving it: a cancelled
  // plan that has not run out yet still counts, so the crown stayed grey for
  // a mentor who could in fact still accept sessions.
  const planActive = subscription?.planActive
  const planLabel = subscription ? subscription.plan[0].toUpperCase() + subscription.plan.slice(1) : ''
  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false)
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false)
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-surface/85 px-[calc(1rem+var(--shell-gutter))] backdrop-blur-md">
      {/* Logo */}
      <Link to="/home" className="flex shrink-0 items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-lg font-black text-white">
          R
        </span>
        <span className="hidden text-[15px] font-bold text-ink sm:block">
          Root <span className="text-brand">Connect</span>
          <span className="ml-1.5 hidden text-xs font-medium text-muted lg:inline">Alumni Network</span>
        </span>
      </Link>

      {/* Search */}
      <div ref={searchRef} className="relative mx-auto flex w-full max-w-2xl items-center">
        {/* Soft emerald glow at rest, a little stronger while typing. */}
        <div className="flex w-full items-center rounded-full border border-brand-100 bg-surface pl-4 shadow-[0_0_0_4px_rgb(15_90_71/0.05),0_6px_20px_-8px_rgb(15_90_71/0.35)] transition-shadow focus-within:border-brand focus-within:shadow-[0_0_0_4px_rgb(15_90_71/0.12),0_8px_26px_-8px_rgb(15_90_71/0.45)]">
          <Search size={18} className="text-muted" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => e.key === 'Escape' && setSearchOpen(false)}
            placeholder="Search alumni, jobs, mentors, posts..."
            className="w-full border-0 bg-transparent px-3 py-2 text-sm text-ink shadow-none outline-none placeholder:text-muted focus:shadow-none"
          />
          {/* Discoverable entry to the command palette (CommandPalette.tsx). */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
            title="Quick jump to any page or person"
            className="mr-2 hidden shrink-0 rounded-md border border-line bg-page px-1.5 py-0.5 text-[11px] font-semibold text-muted hover:text-ink lg:block"
          >
            Ctrl K
          </button>
        </div>
        {searchOpen && query.trim() && <SearchDropdown onClose={() => setSearchOpen(false)} />}
      </div>

      {/* Right cluster */}
      <div className="flex shrink-0 items-center gap-1">
        {/* Plan status. Gold when active so a paying mentor can see it at a
            glance; outlined when not, because it is then a call to action. */}
        <button
          onClick={() => setShowPlans(true)}
          title={planActive ? 'Your mentor plan' : 'Mentor plans'}
          aria-label="Mentor plans"
          className={`mr-1 flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition-colors ${
            planActive
              ? 'bg-gradient-to-r from-[#ffd700] to-[#ff9500] text-on-gold hover:brightness-105'
              : 'border border-line text-muted hover:bg-gray-100 hover:text-ink'
          }`}
        >
          <Crown size={18} />
          {planActive && <span className="hidden lg:inline">{planLabel}</span>}
        </button>

        <IconButton label="Messages" badge={unreadMessages} onClick={toggleChat}>
          <MessageSquare size={20} />
        </IconButton>

        <div ref={notifRef} className="relative">
          <IconButton
            label="Notifications"
            badge={unreadNotifications}
            onClick={() => setShowNotifs((v) => !v)}
          >
            <Bell size={20} />
          </IconButton>
          {showNotifs && <NotificationsDropdown onClose={() => setShowNotifs(false)} />}
        </div>

        {/* The glow ring marks the one thing to press on every screen. */}
        {/* Below lg the phone tab bar has its own centre Create button. */}
        <span className="ring-glow ml-1 hidden lg:inline-flex">
          <button
            onClick={() => openComposer()}
            className="flex items-center gap-1.5 rounded-full btn-primary px-3 py-2 text-sm font-semibold text-white"
          >
            <Plus size={18} /> <span className="hidden md:inline">Create Post</span>
          </button>
        </span>

        <div ref={profileRef} className="relative ml-1">
          <button
            onClick={() => setShowProfile((v) => !v)}
            className="flex items-center gap-1 rounded-full p-0.5 hover:bg-gray-100"
          >
            <Avatar name={currentUser.name} src={currentUser.photo} size={32} />
            <ChevronDown size={16} className="text-muted" />
          </button>
          {showProfile && (
            <div className="animate-fadein absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
              <div className="flex items-center gap-3 border-b border-line p-4">
                <Avatar name={currentUser.name} src={currentUser.photo} size={44} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{currentUser.name}</p>
                  <p className="truncate text-xs text-muted">{currentUser.designation}</p>
                </div>
              </div>
              <MenuItem icon={<UserIcon size={16} />} label="View Profile" onClick={() => { setShowProfile(false); navigate('/profile') }} />
              {currentUser.isAdmin && (
                <MenuItem icon={<ShieldCheck size={16} />} label="Admin Console" onClick={() => { setShowProfile(false); navigate('/admin') }} />
              )}
              <MenuItem icon={<Settings size={16} />} label="Settings" onClick={() => { setShowProfile(false); navigate('/settings') }} />
              <MenuItem icon={<LogOut size={16} />} label="Sign out" onClick={() => { setShowProfile(false); signOut(); navigate('/') }} />
            </div>
          )}
        </div>
      </div>
      {showPlans && <SubscriptionPanel onClose={() => setShowPlans(false)} />}
    </header>
  )
}

function IconButton({
  children,
  label,
  badge = 0,
  onClick,
}: {
  children: React.ReactNode
  label: string
  badge?: number
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-gray-100 hover:text-ink"
    >
      {children}
      {badge > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-clay-600 px-1 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-ink hover:bg-gray-50"
    >
      <span className="text-muted">{icon}</span>
      {label}
    </button>
  )
}
