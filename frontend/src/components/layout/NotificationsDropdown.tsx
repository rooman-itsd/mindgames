import { Link, useNavigate } from 'react-router-dom'
import { Calendar,
  Bell,
  Briefcase,
  CheckCheck,
  Heart,
  MessageCircle,
  Megaphone,
  UserPlus,
  Users,
} from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { timeAgo } from '../../lib/format'
import { notificationLink, opensChat } from '../../lib/notificationLink'
import { useLayout } from './LayoutContext'
import type { AppNotification, NotificationType } from '../../types'

const ICONS: Record<NotificationType, typeof Bell> = {
  connection: UserPlus,
  like: Heart,
  comment: MessageCircle,
  job: Briefcase,
  mentorship: Users,
  community: Users,
  announcement: Megaphone,
  event: Calendar,
  message: MessageCircle,
}

// Where each notification type takes you when clicked.
export const NOTIFICATION_ROUTES: Record<NotificationType, string> = {
  // Land on Requests (not the Matches default) — a connection notification is
  // almost always "X sent/accepted a request", which lives on the Requests tab.
  connection: '/network/requests',
  like: '/home',
  comment: '/home',
  job: '/jobs',
  mentorship: '/mentorship',
  community: '/explore',
  announcement: '/home',
  event: '/events',
  // Only a fallback: a message notification opens the chat panel instead of
  // navigating (see opensChat), because the chat is a panel, not a route.
  message: '/home',
}

export function NotificationsDropdown({ onClose }: { onClose: () => void }) {
  const { notifications, markNotificationsRead, markNotificationRead } = useApp()
  const { openChatWith } = useLayout()
  const navigate = useNavigate()

  // The bell shows only what still needs attention; history lives on /notifications.
  const unread = notifications.filter((n) => !n.read).slice(0, 8)

  function open(n: AppNotification) {
    markNotificationRead(n.id)
    onClose()
    // A message opens the conversation in place; everything else navigates to
    // the thing itself, falling back to the per-type page when the
    // notification carries no target (older rows, and the ones we
    // deliberately leave untargeted).
    if (opensChat(n)) openChatWith(n.actorId!)
    else navigate(notificationLink(n, NOTIFICATION_ROUTES[n.type]))
  }

  return (
    <div className="animate-fadein absolute right-0 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="font-bold text-ink">Notifications</h3>
        {unread.length > 0 && (
          <button onClick={markNotificationsRead} className="text-xs font-semibold text-brand hover:underline">
            Mark all read
          </button>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {unread.map((n) => {
          const Icon = ICONS[n.type]
          return (
            <button
              key={n.id}
              onClick={() => open(n)}
              className="flex w-full gap-3 bg-brand-50/60 px-4 py-3 text-left hover:bg-brand-50"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand">
                <Icon size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-ink">{n.text}</p>
                <p className="mt-0.5 text-xs text-muted">{timeAgo(n.createdAt)}</p>
              </div>
            </button>
          )
        })}
        {unread.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <CheckCheck size={22} className="text-green-600" />
            <p className="text-sm text-muted">You're all caught up.</p>
          </div>
        )}
      </div>
      <Link
        to="/notifications"
        onClick={onClose}
        className="block border-t border-line py-2.5 text-center text-sm font-semibold text-brand hover:bg-gray-50"
      >
        See all notifications
      </Link>
    </div>
  )
}
