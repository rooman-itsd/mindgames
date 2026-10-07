import { useState } from 'react'
import { Handshake, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { useLayout } from '../layout/LayoutContext'
import { Button } from '../ui'
import type { User } from '../../types'

type Mode = 'guidance' | 'referral'

// Composes a note and delivers it as a real chat message (via the existing
// messageUser -> sendMessage flow), landing in the chat panel — exactly what
// Profile.tsx's old local "Request Referral" modal did. `extended` turns on
// the Ask Guidance / Request Referral switcher plus two extra referral
// prompts; Profile.tsx renders this with `extended` omitted so its button
// keeps behaving exactly as before the extraction.
export function ReachOutModal({
  user,
  onClose,
  extended = false,
  defaultMode = 'referral',
}: {
  user: Pick<User, 'id' | 'name' | 'company'>
  onClose: () => void
  extended?: boolean
  defaultMode?: Mode
}) {
  const { messageUser, sendMessage, sendConnect, connectionState, notify } = useApp()
  const { openChatWith } = useLayout()
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [role, setRole] = useState('')
  const [why, setWhy] = useState('')
  const [hireAiTested, setHireAiTested] = useState<'yes' | 'no' | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const activeMode: Mode = extended ? mode : 'referral'

  async function send() {
    setSending(true)
    try {
      const first = user.name.split(' ')[0]
      const text =
        activeMode === 'referral'
          ? `Hi ${first}, I'd love a referral at ${user.company}` +
            (role ? ` for a ${role} role` : '') +
            (extended && why ? `.\n\nWhy this company: ${why}` : '.') +
            (extended && hireAiTested
              ? `\nTaken the Hire AI test: ${hireAiTested === 'yes' ? 'Yes' : 'Not yet'}`
              : '') +
            (note ? `\n\n${note}` : '') +
            `\n\n(Sent via Request Referral on Root Connect)`
          : `Hi ${first}, I'd love some guidance${user.company ? ` about ${user.company}` : ''}.` +
            (note ? `\n\n${note}` : '') +
            `\n\n(Sent via Ask Guidance on Root Connect)`

      // A referral/guidance ask is exactly what "send a connection request
      // with a note" was designed for: a purposeful one-time outreach to
      // someone you are not yet talking to. Only a member already connected
      // gets it delivered as an instant chat message — for anyone else this
      // sends the same text as the connection request's note, so it is
      // waiting for them the moment they accept rather than requiring a
      // second message afterwards.
      if (connectionState(user.id) === 'connected') {
        const threadId = await messageUser(user.id)
        sendMessage(threadId, text)
        notify(`${activeMode === 'referral' ? 'Referral request' : 'Message'} sent to ${user.name} — check your chat for replies.`)
        openChatWith(user.id)
      } else {
        sendConnect(user.id, text)
        notify(`Connection request with your ${activeMode === 'referral' ? 'referral ask' : 'note'} sent to ${user.name}.`)
      }
      onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-slidein w-full max-w-md rounded-2xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Handshake size={18} className="text-brand" />
            <h2 className="font-bold text-ink">
              {extended ? `Reach out to ${user.name}` : 'Request a referral'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {extended && (
          <div className="flex gap-1.5 px-5 pt-4">
            <button
              onClick={() => setMode('guidance')}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'guidance' ? 'bg-brand text-white' : 'bg-page text-muted hover:bg-gray-100'
              }`}
            >
              Ask Guidance
            </button>
            <button
              onClick={() => setMode('referral')}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'referral' ? 'bg-brand text-white' : 'bg-page text-muted hover:bg-gray-100'
              }`}
            >
              Request Referral
            </button>
          </div>
        )}

        <div className="space-y-3 px-5 py-4">
          {activeMode === 'referral' ? (
            <>
              <p className="text-sm text-muted">
                Ask <span className="font-semibold text-ink">{user.name}</span> to refer you at{' '}
                <span className="font-semibold text-ink">{user.company}</span>. It lands in your
                chat so you can continue the conversation there.
              </p>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Role you're interested in (optional)"
                className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              />
              {extended && (
                <>
                  <input
                    value={why}
                    onChange={(e) => setWhy(e.target.value)}
                    placeholder="Why this company? (optional)"
                    className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted">Taken the Hire AI test?</span>
                    {(['yes', 'no'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setHireAiTested((cur) => (cur === v ? null : v))}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          hireAiTested === v ? 'bg-brand text-white' : 'bg-page text-muted hover:bg-gray-100'
                        }`}
                      >
                        {v === 'yes' ? 'Yes' : 'Not yet'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">
              Ask <span className="font-semibold text-ink">{user.name}</span> for advice — career
              path, interview tips, whatever you're curious about. It lands in your chat.
            </p>
          )}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="A short note — your experience, why you're a fit… (optional)"
            className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={sending} onClick={send}>
            {sending ? 'Sending…' : activeMode === 'referral' ? 'Send request' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}
