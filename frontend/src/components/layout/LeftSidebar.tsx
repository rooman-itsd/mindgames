import { Fragment } from 'react'
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
  const { currentUser } = useApp()
  const { sidebarOpen, toggleSidebar } = useLayout()
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
      {/* A floating card 14px in from the edge and the navbar, as tall as its
          items (not the full screen, which left a large empty white panel);
          capped at the viewport, where it scrolls. */}
      <aside className={`fixed top-[70px] z-40 hidden max-h-[calc(100vh-84px)] w-[248px] flex-col overflow-y-auto rounded-2xl border border-line bg-surface px-2.5 py-3 shadow-[0_18px_40px_-28px_rgb(1_38_28/0.45)] transition-all duration-200 lg:flex ${
        sidebarOpen ? 'left-[calc(var(--shell-gutter)+14px)]' : '-left-[280px]'
      }`}>
      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon, tone, group }, i) => (
          <Fragment key={to}>
          {/* A small heading wherever the group changes (Opportunities / Grow / Community). */}
          {group && group !== NAV[i - 1]?.group && (
            <p className="px-3 pt-3 pb-1 text-[10.5px] font-extrabold tracking-wider text-muted uppercase">{group}</p>
          )}
          <NavLink
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
          </Fragment>
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

      {/* Follows the menu as its last item inside the card. */}
      {verifyNotice && (
        <div className="pt-4">
          <VerifyEmailNotice compact {...verifyNotice} />
        </div>
      )}
    </aside>
    </>
  )
}
