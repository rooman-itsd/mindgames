import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, Flag, CalendarCheck, Compass, CreditCard, LayoutDashboard, MailCheck, Users, Megaphone, GraduationCap, Rocket, Settings, ArrowLeft } from 'lucide-react'
import { cx } from '../ui'

export type AdminView = 'dashboard' | 'sent-invites' | 'directory' | 'announcements' | 'mentors' | 'subscriptions' | 'confirmations' | 'startups' | 'communities' | 'events' | 'reports' | 'settings'

const NAV: Array<{ key: AdminView; label: string; icon: ReactNode }> = [
  { key: 'dashboard', label: 'Invitations', icon: <LayoutDashboard size={18} /> },
  { key: 'sent-invites', label: 'Sent Invitations', icon: <MailCheck size={18} /> },
  { key: 'directory', label: 'Alumni Directory', icon: <Users size={18} /> },
  { key: 'announcements', label: 'News & Announcements', icon: <Megaphone size={18} /> },
  { key: 'mentors', label: 'Mentor Approvals', icon: <GraduationCap size={18} /> },
  { key: 'subscriptions', label: 'Mentor Subscriptions', icon: <CreditCard size={18} /> },
  { key: 'confirmations', label: 'Session Confirmations', icon: <BellRing size={18} /> },
  { key: 'startups', label: 'Startup Applications', icon: <Rocket size={18} /> },
  { key: 'communities', label: 'Community Approvals', icon: <Compass size={18} /> },
  { key: 'events', label: 'Event Approvals', icon: <CalendarCheck size={18} /> },
  { key: 'reports', label: 'Reports', icon: <Flag size={18} /> },
  { key: 'settings', label: 'Settings', icon: <Settings size={18} /> },
]

export function AdminLayout({
  view,
  onViewChange,
  stats,
  children,
}: {
  view: AdminView
  onViewChange: (v: AdminView) => void
  stats: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-page text-ink">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex items-center gap-2.5 border-b border-line px-6 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-lg font-black text-white">R</span>
          <div>
            <p className="text-sm font-bold text-ink">Rooman Admin</p>
            <p className="text-xs text-muted">Alumni Network</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => onViewChange(item.key)}
              className={cx(
                'flex items-center gap-3 rounded-lg border-l-[3px] px-3 py-2.5 text-sm font-medium transition-colors',
                view === item.key
                  ? 'border-brand bg-brand-50 text-brand'
                  : 'border-transparent text-ink hover:bg-gray-100',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>
        <Link
          to="/home"
          className="flex items-center gap-2 border-t border-line p-4 text-xs font-medium text-muted hover:text-brand"
        >
          <ArrowLeft size={14} /> Back to network
        </Link>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-line bg-surface px-4 py-4 md:px-8">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-bold text-ink">{NAV.find((n) => n.key === view)?.label}</h1>
            <div className="flex gap-1 md:hidden">
              {NAV.map((item) => (
                <button
                  key={item.key}
                  onClick={() => onViewChange(item.key)}
                  aria-label={item.label}
                  className={cx('rounded-lg p-2', view === item.key ? 'bg-brand-50 text-brand' : 'text-muted')}
                >
                  {item.icon}
                </button>
              ))}
            </div>
          </div>
          {stats}
        </header>

        <main className="flex-1 overflow-x-hidden p-4 md:p-8">{children}</main>
      </div>
    </div>
  )
}
