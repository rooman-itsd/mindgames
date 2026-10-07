import { useMemo, useState } from 'react'
import { AlertCircle, Check, Copy, Mail, RefreshCw, Search, Send } from 'lucide-react'
import type { Alumni } from '../../types'
import { api } from '../../lib/api'
import { useApp } from '../../store/AppStore'
import { Button, Card, cx } from '../ui'
import { SentInviteDetailModal } from './SentInviteDetailModal'

// Who has actually been sent their credentials, and what happened to each
// send. The invite email is the only place a member's generated password
// appears, so "did it arrive?" is the question this panel exists to answer —
// invite_status is recorded per recipient at send time (invites.routes.ts).
//
// The password itself is deliberately NOT shown here: it's hashed the moment
// the account is created and never stored in the clear. If a member never got
// their email, the fix is Resend (which mints a fresh password), not recovery
// — safe precisely because nobody has used the old one yet.

type Filter = 'all' | 'sent' | 'failed' | 'not-sent'

/**
 * Whether the backend would refuse to re-invite this person — mirrors the
 * `untouched` check in invites.routes.ts. An account that has been signed into
 * or whose owner chose their own password must not have a fresh one issued:
 * that would lock them out of an account they're actively using. Everyone
 * else can safely be re-sent, because the password we generated was never
 * used (and can't be recovered — it's hashed, never stored readable).
 */
const wouldBeSkipped = (a: Alumni) =>
  a.hasAccount && (!!a.lastLoginAt || a.everActive || a.passwordChanged)

function InviteStatusBadge({ a }: { a: Alumni }) {
  if (a.inviteStatus === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
        <AlertCircle size={12} /> Failed
      </span>
    )
  }
  if (a.inviteStatus === 'simulated') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
        <Mail size={12} /> Simulated
      </span>
    )
  }
  if (a.inviteStatus === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
        <Check size={12} /> Sent
      </span>
    )
  }
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-muted">
      Not sent
    </span>
  )
}

/**
 * Account state, reported from recorded facts only.
 *
 * `lastLoginAt` is stamped on every sign-in, so "never signed in" is a fact
 * rather than a guess. It deliberately does NOT infer sign-in from whether the
 * generated password was replaced: someone who signs in and hits "Skip for
 * now" leaves that untouched, so the two cases are indistinguishable that way.
 * A null login is NOT reported as "never" on its own: accounts that signed in
 * before stamping existed have no timestamp, so `everActive` (onboarded or
 * profile-edited — neither possible without signing in) separates those from
 * accounts nobody has ever opened.
 */
function AccountStateBadge({ a }: { a: Alumni }) {
  if (!a.hasAccount) {
    return <span className="text-xs text-muted">No account</span>
  }
  return (
    <div className="space-y-1">
      {a.lastLoginAt ? (
        <span
          className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"
          title={new Date(a.lastLoginAt).toLocaleString()}
        >
          Signed in {new Date(a.lastLoginAt).toLocaleDateString()}
        </span>
      ) : a.everActive ? (
        <span
          className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"
          title="Their profile has been filled in, which is only possible while signed in — but this predates login tracking, so the date is unknown"
        >
          Signed in earlier
        </span>
      ) : (
        <span className="inline-block rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand">
          Never signed in
        </span>
      )}
      <p className="text-xs text-muted">
        {a.passwordChanged ? 'own password' : 'still on emailed password'}
      </p>
    </div>
  )
}

function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title={link}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          /* clipboard blocked — the title attribute still shows the full link */
        }
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}

export function SentInvitesPanel({
  alumni,
  onChanged,
}: {
  alumni: Alumni[]
  onChanged: () => void
}) {
  const { notify } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [resending, setResending] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)

  const stats = useMemo(
    () => ({
      sent: alumni.filter((a) => a.inviteStatus === 'sent' || a.inviteStatus === 'simulated').length,
      failed: alumni.filter((a) => a.inviteStatus === 'failed').length,
      notSent: alumni.filter((a) => !a.inviteStatus).length,
      signedIn: alumni.filter((a) => !!a.lastLoginAt || a.everActive).length,
    }),
    [alumni],
  )

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return alumni
      .filter((a) => {
        if (filter === 'sent') return a.inviteStatus === 'sent' || a.inviteStatus === 'simulated'
        if (filter === 'failed') return a.inviteStatus === 'failed'
        if (filter === 'not-sent') return !a.inviteStatus
        return true
      })
      .filter((a) => !term || a.name.toLowerCase().includes(term) || a.email.toLowerCase().includes(term))
      // Most recently invited first; never-invited rows sink to the bottom.
      .sort((x, y) => (y.invitedAt ?? '').localeCompare(x.invitedAt ?? ''))
  }, [alumni, filter, q])

  /** Re-send to one invitee: creates the account if there isn't one, or issues
   *  a fresh password if there is one nobody has signed into. See
   *  wouldBeSkipped for the case the backend refuses. */
  async function resend(a: Alumni) {
    setResending(a.id)
    try {
      const res = await api.sendInvites([{ id: a.id, email: true, whatsapp: false }])
      notify(res.message, res.failedCount ? 'error' : 'success')
      onChanged()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not resend the invitation.', 'error')
    } finally {
      setResending(null)
    }
  }

  const TABS: Array<{ key: Filter; label: string; count: number }> = [
    { key: 'all', label: 'All', count: alumni.length },
    { key: 'sent', label: 'Sent', count: stats.sent },
    { key: 'failed', label: 'Failed', count: stats.failed },
    { key: 'not-sent', label: 'Not sent', count: stats.notSent },
  ]

  return (
    <div className="space-y-4">
      {/* summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Invites delivered', value: stats.sent, tone: 'text-green-700' },
          { label: 'Delivery failed', value: stats.failed, tone: 'text-red-700' },
          { label: 'Never invited', value: stats.notSent, tone: 'text-muted' },
          { label: 'Signed in', value: stats.signedIn, tone: 'text-brand' },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className={cx('text-2xl font-bold', s.tone)}>{s.value}</p>
            <p className="text-xs text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={cx(
                  'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  filter === t.key
                    ? 'bg-brand text-white'
                    : 'bg-page text-muted hover:text-ink',
                )}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or email"
              className="w-56 rounded-lg border border-line py-1.5 pl-8 pr-3 text-sm outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Email delivery</th>
                <th className="px-4 py-3 font-medium">Sent</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Invite link</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    {alumni.length === 0
                      ? 'No alumni yet. Upload a CSV or add someone to get started.'
                      : 'Nothing matches this filter.'}
                  </td>
                </tr>
              ) : (
                rows.map((a) => (
                  <tr key={a.id} className="border-b border-line align-top hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {/* Clicking a recipient shows the invite they were sent. */}
                      <button
                        type="button"
                        onClick={() => setViewing(a.id)}
                        className="text-left font-medium text-ink hover:text-brand hover:underline"
                        title="View the invite email sent to this person"
                      >
                        {a.name}
                      </button>
                      <p className="text-xs text-muted">{a.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <InviteStatusBadge a={a} />
                      {a.inviteCount > 1 && (
                        <p className="mt-1 text-xs text-muted">sent {a.inviteCount}×</p>
                      )}
                      {a.inviteError && (
                        <p className="mt-1 max-w-[220px] break-words text-xs text-red-600">
                          {a.inviteError}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {a.invitedAt ? new Date(a.invitedAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <AccountStateBadge a={a} />
                    </td>
                    <td className="max-w-[240px] px-4 py-3">
                      <p className="truncate font-mono text-xs text-muted" title={a.inviteLink}>
                        {a.inviteLink}
                      </p>
                      <div className="mt-1">
                        <CopyLinkButton link={a.inviteLink} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        loading={resending === a.id}
                        disabled={!!resending || wouldBeSkipped(a)}
                        title={
                          wouldBeSkipped(a)
                            ? "They've signed in or set their own password — re-issuing would lock them out of an account they're using"
                            : a.hasAccount
                              ? 'Issue a fresh password and email it again'
                              : 'Create the account and email their credentials'
                        }
                        icon={a.inviteStatus ? <RefreshCw size={14} /> : <Send size={14} />}
                        onClick={() => resend(a)}
                      >
                        {a.inviteStatus ? 'Resend' : 'Send'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {viewing && <SentInviteDetailModal inviteeId={viewing} onClose={() => setViewing(null)} />}

      <p className="px-1 text-xs text-muted">
        &ldquo;Sent&rdquo; means your mail server accepted the message — a recipient can still not
        receive it (full mailbox, spam filter). &ldquo;Simulated&rdquo; means SMTP isn&rsquo;t
        configured, so the email was written to the server log instead of delivered. Passwords are
        hashed on creation and never stored in readable form, so they can&rsquo;t be shown here —
        use Resend to issue a fresh one. Sign-in is recorded per login;
        &ldquo;Signed in earlier&rdquo; means the account has clearly been used (their
        profile is filled in, which needs a sign-in) but predates login tracking, so
        the date isn&rsquo;t known.
      </p>
    </div>
  )
}
