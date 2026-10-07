import { useEffect, useState } from 'react'
import { AlertCircle, Check, Copy, Info, Mail, X } from 'lucide-react'
import { api } from '../../lib/api'
import type { SentInviteEmail } from '../../types'
import { Button } from '../ui'

// What one person was actually emailed. Opened by clicking a recipient in the
// invitations table or the Sent Invitations list.
//
// The body shown is the copy stored at send time where available, so editing
// the template later doesn't rewrite history. Rows sent before that copy was
// kept are reconstructed from the current template and labelled as such.
//
// The generated password is redacted — it's bcrypt'd when the account is
// created and never stored readable, so nobody (including an admin) can read
// it back. Resend issues a fresh one.

export function SentInviteDetailModal({
  inviteeId,
  onClose,
}: {
  inviteeId: string
  onClose: () => void
}) {
  const [data, setData] = useState<SentInviteEmail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'link' | 'body' | null>(null)

  useEffect(() => {
    let live = true
    api
      .getSentInviteEmail(inviteeId)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load the invite.'))
    return () => {
      live = false
    }
  }, [inviteeId])

  async function copy(text: string, which: 'link' | 'body') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      /* clipboard blocked — text is selectable on screen */
    }
  }

  const statusBadge = () => {
    if (!data) return null
    if (data.inviteStatus === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
          <AlertCircle size={12} /> Delivery failed
        </span>
      )
    }
    if (data.inviteStatus === 'simulated') {
      return (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
          Simulated (no SMTP)
        </span>
      )
    }
    if (data.inviteStatus === 'sent') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
          <Check size={12} /> Sent
        </span>
      )
    }
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-muted">
        Never sent
      </span>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-2xl rounded-xl bg-surface shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <Mail size={18} className="text-brand" /> Invite sent to {data?.name ?? '…'}
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted">{data?.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-gray-100 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          {!data && !error && <p className="py-8 text-center text-sm text-muted">Loading…</p>}

          {data && (
            <>
              {/* status strip */}
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-page px-3 py-2.5 text-xs text-muted">
                {statusBadge()}
                {data.invitedAt && <span>{new Date(data.invitedAt).toLocaleString()}</span>}
                {data.inviteCount > 1 && <span>sent {data.inviteCount}×</span>}
              </div>

              {data.inviteError && (
                <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span className="font-semibold">Mail server said:</span> {data.inviteError}
                </p>
              )}

              {/* the sign-in link that was mailed */}
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Sign-in link
              </label>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-line px-3 py-2 text-xs text-ink">
                  {data.inviteLink}
                </code>
                <Button
                  variant="outline"
                  icon={copied === 'link' ? <Check size={14} /> : <Copy size={14} />}
                  onClick={() => copy(data.inviteLink, 'link')}
                >
                  {copied === 'link' ? 'Copied' : 'Copy'}
                </Button>
              </div>

              {/* the email itself */}
              <div className="mt-4 flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                  Email content
                </label>
                <button
                  type="button"
                  onClick={() => copy(`${data.subject}\n\n${data.body}`, 'body')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                >
                  {copied === 'body' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'body' ? 'Copied' : 'Copy email'}
                </button>
              </div>
              <div className="mt-1 rounded-lg border border-line">
                <p className="border-b border-line bg-page px-3 py-2 text-sm font-semibold text-ink">
                  {data.subject}
                </p>
                <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-3 font-sans text-sm leading-relaxed text-ink">
                  {data.body}
                </pre>
              </div>

              {/* honesty notes */}
              <div className="mt-3 space-y-2">
                <p className="flex gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-ink">
                  <Info size={14} className="mt-0.5 shrink-0 text-brand" />
                  <span>
                    The password reads{' '}
                    <code className="rounded bg-surface px-1">{data.passwordRedacted}</code> here on
                    purpose. It's hashed when the account is created and never stored in readable
                    form, so it can't be shown back — if they lost the email, use{' '}
                    <span className="font-semibold">Resend</span> to issue a new one.
                  </span>
                </p>
                {!data.exact && (
                  <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <Info size={14} className="mt-0.5 shrink-0" />
                    <span>
                      This send predates keeping a copy of the outgoing email, so the wording above
                      is rebuilt from the <span className="font-semibold">current</span> template
                      and may differ from what was actually delivered. Invites sent from now on
                      store their own copy.
                    </span>
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-line px-5 py-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
