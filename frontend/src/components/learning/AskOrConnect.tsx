import { Check, MessageSquare, UserPlus } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { useLayout } from '../layout/LayoutContext'

/**
 * The way to reach the person behind a share or a stage helper.
 *
 * Messages only open between connections (the server refuses a first message
 * to anyone else), so the button follows the connection: connected → Ask
 * opens the chat; not yet → Connect sends a request; sent → Requested, until
 * they accept. Read from the connection graph the app already holds — no call.
 */
export function AskOrConnect({
  userId,
  name,
  variant = 'icon',
  onAsk,
}: {
  userId: string
  name: string
  /** icon: the small square on cards and lists; pill: the brief's main button. */
  variant?: 'icon' | 'pill'
  /** Runs before the chat opens — the brief closes itself first. */
  onAsk?: () => void
}) {
  const { connectionState, sendConnect } = useApp()
  const { openChatWith } = useLayout()
  const state = connectionState(userId)
  const first = name.split(' ')[0]

  const pill = 'inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold'
  const icon =
    'flex shrink-0 items-center justify-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold'

  if (state === 'connected') {
    return (
      <button
        onClick={() => {
          onAsk?.()
          openChatWith(userId)
        }}
        title={`Ask ${name}`}
        aria-label={`Ask ${name}`}
        className={
          variant === 'pill'
            ? `${pill} btn-primary text-white`
            : `${icon} text-muted hover:text-ink`
        }
      >
        <MessageSquare size={13} />
        {variant === 'pill' && `Ask ${first}`}
      </button>
    )
  }

  if (state === 'pending') {
    return (
      <button
        disabled
        title={`Request sent — you can message ${first} once they accept`}
        aria-label={`Connection request sent to ${name}`}
        className={
          variant === 'pill'
            ? `${pill} cursor-default bg-gray-100 text-muted`
            : `${icon} cursor-default text-muted`
        }
      >
        <Check size={13} /> Requested
      </button>
    )
  }

  return (
    <button
      onClick={() => sendConnect(userId)}
      title={`Connect with ${name} to message them`}
      aria-label={`Connect with ${name}`}
      className={
        variant === 'pill'
          ? `${pill} border border-brand text-brand hover:bg-brand-50`
          : `${icon} text-brand hover:bg-brand-50`
      }
    >
      <UserPlus size={13} /> Connect
    </button>
  )
}
