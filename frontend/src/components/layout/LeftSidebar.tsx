import { NavLink } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ShieldCheck, Menu } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { useLayout } from './LayoutContext'
import { VerifyEmailNotice } from './VerifyEmailNotice'
import { NAV } from './navItems'


export function LeftSidebar({
  verifyNotice,
}: {
  /** Set while the member's email is unverified and the prompt isn't dismissed. */
  verifyNotice?: { resending: boolean; onResend: () => void; onDismiss: () => void }
} = {}) {
  const { communities, currentUser } = useApp()
  const { sidebarOpen, toggleSidebar } = useLayout()
  const joined = communities.filter((c) => c.joined)
  const reduceMotion = useReducedMotion()

  return (
    <>
      {/*
        Collapse handle — a circular button that straddles the sidebar's right
        border. When the sidebar is closed it parks at the left edge so it can
        be reopened. Lives outside <aside> because that scrolls and would clip it.
      */}
      <button
        onClick={toggleSidebar}
        className={`fixed top-20 z-50 hidden h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm transition-all duration-200 hover:bg-gray-100 hover:text-ink lg:flex ${
          sidebarOpen
            ? 'left-[calc(var(--shell-gutter)+14px+248px-18px)]'
            : 'left-[calc(var(--shell-gutter)+8px)]'
        }`}
        aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        aria-expanded={sidebarOpen}
      >
        <Menu size={18} />
      </button>

      {/* Sidebar — slides fully off-screen when closed */}
      {/* A floating card 14px in from the edge and the navbar. */}
      <aside className={`fixed bottom-3.5 top-[70px] z-40 hidden w-[248px] flex-col overflow-y-auto rounded-2xl border border-line bg-surface px-2.5 py-3 shadow-[0_18px_40px_-28px_rgb(1_38_28/0.45)] transition-all duration-200 lg:flex ${
        sidebarOpen ? 'left-[calc(var(--shell-gutter)+14px)]' : '-left-[280px]'
      }`}>
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon, tone }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex items-center gap-3 rounded-lg border-l-[3px] border-transparent px-3 py-2 text-sm transition-colors ${
                isActive ? `font-semibold ${tone.text}` : 'font-medium text-ink hover:bg-gray-100'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* One shared layoutId: when the active route changes, motion
                    springs this highlight from the old row to the new one. */}
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active"
                    aria-hidden
                    className={`absolute inset-y-0 -left-[3px] right-0 rounded-lg border-l-[3px] ${tone.pill}`}
                    transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 34 }}
                  />
                )}
                <Icon size={20} className={`relative ${tone.icon}`} />
                <span className="relative">{label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* Console entry — admins only */}
        {currentUser.isAdmin && (
          <NavLink
            to="/admin"
            className="mt-1 flex items-center gap-3 rounded-lg border-l-[3px] border-transparent bg-brand-50/60 px-3 py-2 text-sm font-semibold text-brand hover:bg-brand-50"
          >
            <ShieldCheck size={20} />
            Admin Console
          </NavLink>
        )}
      </nav>

      {joined.length > 0 && (
        <>
          <div className="my-4 border-t border-line" />

          <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wide text-muted">
            My Communities
          </p>
          <div className="flex flex-col gap-0.5">
            {joined.map((c) => (
              <NavLink
                key={c.id}
                to={`/community/${c.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive ? 'bg-brand-50 text-brand' : 'text-ink hover:bg-gray-100'
                  }`
                }
              >
                <span className={`h-6 w-6 shrink-0 rounded-full bg-gradient-to-br ${c.color}`} />
                <span className="truncate">{c.name}</span>
              </NavLink>
            ))}
          </div>
        </>
      )}

      {/* mt-auto pushes it to the bottom of the sidebar; when the nav is
          taller than the screen it simply follows it as the last item. */}
      {verifyNotice && (
        <div className="mt-auto pt-4">
          <VerifyEmailNotice compact {...verifyNotice} />
        </div>
      )}
    </aside>
    </>
  )
}
