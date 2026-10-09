import { useCallback, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { api } from '../../lib/api'
import { useApp } from '../../store/AppStore'
import { Navbar } from './Navbar'
import { LeftSidebar } from './LeftSidebar'
import { RightSidebar } from './RightSidebar'
import { HomeRightSidebar } from './HomeRightSidebar'
import { MentorshipRightSidebar } from './MentorshipRightSidebar'
import { ChatPanel } from './ChatPanel'
import { AskRoo } from './AskRoo'
import { PostCreateModal } from '../feed/PostCreateModal'
import { LayoutContext } from './LayoutContext'
import { VerifyEmailNotice } from './VerifyEmailNotice'
import { MobileTabBar } from './MobileTabBar'
import { CommandPalette } from './CommandPalette'
import { ShareWinModal } from '../feed/ShareWinModal'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useApplyTheme } from '../../hooks/useTheme'
import { documentTitle, pageLabel } from '../../lib/pageTitle'
import type { PostType } from '../../types'

export function AppLayout() {
  const { currentUser, notify, unreadNotifications, unreadMessages, userById } = useApp()
  const { pathname } = useLocation()
  // Distinct tab titles per page, with the unread count in front like Gmail.
  const viewedProfile = pathname.startsWith('/profile/') ? userById(pathname.split('/')[2]) : undefined
  useApplyTheme() // opt-in dark mode, signed-in app only
  useDocumentTitle(documentTitle(pageLabel(pathname, viewedProfile?.name), unreadNotifications + unreadMessages))
  const [composer, setComposer] = useState<{ open: boolean; type?: PostType; communityId?: string }>({
    open: false,
  })
  const [chat, setChat] = useState<{ open: boolean; userId?: string }>({ open: false })
  const [verifyDismissed, setVerifyDismissed] = useState(false)
  const [resending, setResending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  // Learning Resources brings its own right column (Filter by + Saved
  // Resources), which takes the general rail's place on that page only.
  // Trailing slashes are trimmed first: React Router renders the same page for
  // "/learning-resources/", and that must not bring the general rail back.
  // StartupVarsity is a single pitch that links out, so it needs no rail either.
  const isFullWidth =
    pathname.startsWith('/career-guidance') ||
    ['/learning-resources', '/startupvarsity'].includes(pathname.replace(/\/+$/, ''))
  const showVerifyBanner =
    !verifyDismissed && !currentUser.isAdmin && currentUser.emailVerified === false

  async function resendVerification() {
    setResending(true)
    try {
      const r = await api.resendVerification()
      if (r.alreadyVerified) notify('Your email is already verified — reload the page.', 'info')
      else notify('Verification email sent — check your inbox.', 'success')
      if (r.devVerifyLink) console.log('Dev verification link:', r.devVerifyLink)
    } catch {
      notify('Could not send the email. Try again later.', 'error')
    } finally {
      setResending(false)
    }
  }

  const openComposer = useCallback(
    (prefill?: { type?: PostType; communityId?: string }) =>
      setComposer({ open: true, type: prefill?.type, communityId: prefill?.communityId }),
    [],
  )
  const toggleChat = useCallback(() => setChat((c) => ({ open: !c.open })), [])
  const openChatWith = useCallback((userId: string) => setChat({ open: true, userId }), [])
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), [])

  return (
    <LayoutContext.Provider value={{ openComposer, toggleChat, openChatWith, sidebarOpen, toggleSidebar }}>
      <Navbar />
      <LeftSidebar
        verifyNotice={
          showVerifyBanner
            ? { resending, onResend: resendVerification, onDismiss: () => setVerifyDismissed(true) }
            : undefined
        }
      />
      {/* Career Guidance is a full-width workspace: its roadmap runs
          horizontally across the page, so it renders no right rail at all. */}
      {/* Mentorship brings its own rail: a calendar and cards that follow the
          open tab. The general RightSidebar is unchanged everywhere else. */}
      {isFullWidth ? null
        : pathname === '/home' ? <HomeRightSidebar />
        : pathname.replace(/\/+$/, '') === '/mentorship' ? <MentorshipRightSidebar />
        : <RightSidebar />}

      {/*
        Padding tracks the sidebars, which are offset by --shell-gutter so the
        three columns stay together as one centred shell on wide screens.
        Both sidebars float 14px in from the edge with a 14px gap to the
        content (14 + 248 + 14 = 276 left, 14 + 288 + 14 = 316 right).
      */}
      <main className={`min-h-screen pt-14 pb-20 transition-all duration-200 lg:pb-0 ${
        isFullWidth ? 'xl:pr-[var(--shell-gutter)]' : 'xl:pr-[calc(316px+var(--shell-gutter))]'
      } ${
        sidebarOpen
          ? 'lg:pl-[calc(276px+var(--shell-gutter))]'
          : 'lg:pl-[calc(64px+var(--shell-gutter))]'
      }`}>
        {/*
          With the sidebar collapsed the column would just centre itself in the
          freed space, so widen it instead — the point of collapsing is more
          room for the content, not more margin.
        */}
        <div className={`mx-auto w-full px-4 py-3.5 transition-all duration-200 ${
          isFullWidth ? 'max-w-[1180px]' : sidebarOpen ? 'max-w-[820px]' : 'max-w-[1100px]'
        }`}>
          {/* The left sidebar carries a small version of this on wide screens.
              It isn't on screen below lg or when collapsed, so the full banner
              stays for those cases — otherwise the prompt would vanish. */}
          {showVerifyBanner && (
            <div className={sidebarOpen ? 'lg:hidden' : undefined}>
              <VerifyEmailNotice
                resending={resending}
                onResend={resendVerification}
                onDismiss={() => setVerifyDismissed(true)}
              />
            </div>
          )}
          {/* Keyed by the first path segment only: a new section replays the
              entrance cascade, while tab changes inside one (network/…,
              events/…) keep their state instead of remounting. */}
          <div key={pathname.split('/')[1]} className="page-enter">
            <Outlet />
          </div>
        </div>
      </main>

      {composer.open && (
        <PostCreateModal
          prefill={{ type: composer.type, communityId: composer.communityId }}
          onClose={() => setComposer({ open: false })}
        />
      )}
      {chat.open && (
        <ChatPanel initialUserId={chat.userId} onClose={() => setChat({ open: false })} />
      )}
      <AskRoo />
      <MobileTabBar />
      <CommandPalette />
      <ShareWinModal />
    </LayoutContext.Provider>
  )
}
