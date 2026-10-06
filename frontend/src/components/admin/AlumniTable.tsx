import { useMemo, useState } from 'react'
import {
  FilePenLine,
  LayoutGrid,
  Mail,
  MessageCircle,
  Rows3,
  Search,
  Send,
  UserCheck,
} from 'lucide-react'
import type { Alumni } from '../../types'
import { api } from '../../lib/api'
import { useApp } from '../../store/AppStore'
import { Button, Card, Checkbox, StatusBadge, cx } from '../ui'
import { InviteEmailTemplateModal } from './InviteEmailTemplateModal'
import { SentInviteDetailModal } from './SentInviteDetailModal'

type Channel = { email: boolean; whatsapp: boolean }
type StatusFilter = 'all' | 'never-invited' | 'sent' | 'not-signed-in' | 'signed-in' | 'failed'
type Layout = 'table' | 'batches'

// --- shared predicates -----------------------------------------------------
// Sign-in is a recorded fact (lastLoginAt) OR demonstrated by a filled-in
// profile (everActive) for members who signed in before login stamping
// existed. Both count, or the console would call long-standing members
// "not signed in" and offer to re-issue passwords they're actively using.
const hasSignedIn = (a: Alumni) => !!a.lastLoginAt || a.everActive
const wasInvited = (a: Alumni) => !!a.inviteStatus
/** Invited, has an account, and still hasn't turned up — the resend audience. */
const isPendingArrival = (a: Alumni) => wasInvited(a) && a.hasAccount && !hasSignedIn(a)

const MATCHES: Record<StatusFilter, (a: Alumni) => boolean> = {
  all: () => true,
  'never-invited': (a) => !wasInvited(a),
  sent: (a) => wasInvited(a) && a.inviteStatus !== 'failed',
  'not-signed-in': isPendingArrival,
  'signed-in': hasSignedIn,
  failed: (a) => a.inviteStatus === 'failed',
}

const FILTER_LABELS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'Everyone' },
  { key: 'never-invited', label: 'Not invited yet' },
  { key: 'sent', label: 'Invite sent' },
  { key: 'not-signed-in', label: "Hasn't signed in" },
  { key: 'signed-in', label: 'Signed in' },
  { key: 'failed', label: 'Delivery failed' },
]

const UNGROUPED = 'Added before batches were tracked'

function InviteCell({ a }: { a: Alumni }) {
  if (a.inviteStatus === 'failed') {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
        Failed
      </span>
    )
  }
  if (a.inviteStatus) {
    return (
      <span
        className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"
        title={a.invitedAt ? new Date(a.invitedAt).toLocaleString() : undefined}
      >
        {a.inviteStatus === 'simulated' ? 'Simulated' : 'Sent'}
      </span>
    )
  }
  return <span className="text-xs text-muted">—</span>
}

function ArrivalCell({ a }: { a: Alumni }) {
  if (!a.hasAccount) return <span className="text-xs text-muted">—</span>
  if (a.lastLoginAt) {
    return (
      <span
        className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"
        title={new Date(a.lastLoginAt).toLocaleString()}
      >
        Signed in
      </span>
    )
  }
  if (a.everActive) {
    return (
      <span
        className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"
        title="Profile is filled in, which needs a sign-in — but this predates login tracking"
      >
        Signed in earlier
      </span>
    )
  }
  return (
    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand">
      Not yet
    </span>
  )
}

export function AlumniTable({
  alumni,
  onInvitesSent,
}: {
  alumni: Alumni[]
  onInvitesSent: (count: number) => void
}) {
  const { notify } = useApp()
  const [selection, setSelection] = useState<Record<string, Channel>>({})
  const [reviewing, setReviewing] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [batch, setBatch] = useState<string>('all')
  const [layout, setLayout] = useState<Layout>('table')
  const [q, setQ] = useState('')

  const get = (id: string): Channel => selection[id] ?? { email: false, whatsapp: false }

  // How many people each status filter would show — the counts sit on the tabs
  // so you can see where the work is without clicking through them.
  const statusCounts = useMemo(() => {
    const out = {} as Record<StatusFilter, number>
    for (const { key } of FILTER_LABELS) out[key] = alumni.filter(MATCHES[key]).length
    return out
  }, [alumni])

  /** One entry per import, with the numbers that matter for that batch. */
  const batches = useMemo(() => {
    const map = new Map<string, Alumni[]>()
    for (const a of alumni) {
      const key = a.batch || UNGROUPED
      const list = map.get(key)
      if (list) list.push(a)
      else map.set(key, [a])
    }
    return [...map.entries()]
      .map(([label, rows]) => ({
        label,
        rows,
        total: rows.length,
        invited: rows.filter(wasInvited).length,
        pending: rows.filter(isPendingArrival).length,
        signedIn: rows.filter(hasSignedIn).length,
        failed: rows.filter((a) => a.inviteStatus === 'failed').length,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [alumni])

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    return alumni
      .filter(MATCHES[status])
      .filter((a) => batch === 'all' || (a.batch || UNGROUPED) === batch)
      .filter(
        (a) => !term || a.name.toLowerCase().includes(term) || a.email.toLowerCase().includes(term),
      )
  }, [alumni, status, batch, q])

  const counts = useMemo(() => {
    let email = 0
    let whatsapp = 0
    for (const a of alumni) {
      const c = get(a.id)
      if (c.email) email++
      if (c.whatsapp) whatsapp++
    }
    return { email, whatsapp, total: email + whatsapp }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, alumni])

  // "Select all" applies to what's on screen, not the whole directory — with a
  // filter active, selecting rows you can't see is how accidental mass mails
  // happen.
  const allOn = visible.length > 0 && visible.every((a) => get(a.id).email && get(a.id).whatsapp)
  const someOn = counts.total > 0

  function toggleAll(on: boolean) {
    // Ticking applies only to what's on screen — arming rows hidden behind a
    // filter is how an accidental mass-mail happens. Unticking clears the
    // WHOLE selection, though: Send reads the full selection, so clearing
    // only visible rows would leave hidden ones armed and mail them.
    if (!on) return setSelection({})
    setSelection((s) => {
      const next = { ...s }
      for (const a of visible) next[a.id] = { email: true, whatsapp: true }
      return next
    })
  }

  function toggleCell(id: string, channel: keyof Channel, on: boolean) {
    setSelection((s) => ({ ...s, [id]: { ...get(id), [channel]: on } }))
  }

  /** Tick email for everyone still awaiting arrival (optionally one batch). */
  function selectPendingArrivals(scope?: Alumni[]) {
    const pool = (scope ?? alumni).filter(isPendingArrival)
    if (pool.length === 0) {
      notify('Nobody is waiting — everyone invited here has signed in.', 'success')
      return
    }
    setSelection((s) => {
      const next = { ...s }
      for (const a of pool) next[a.id] = { email: true, whatsapp: false }
      return next
    })
    notify(`Selected ${pool.length} member(s) who haven't signed in.`, 'success')
  }

  const pendingInvites = () =>
    alumni.map((a) => ({ id: a.id, ...get(a.id) })).filter((i) => i.email || i.whatsapp)

  /** Only an email send has copy to review. A WhatsApp-only selection (which
   *  is simulated and sends nothing) would otherwise open an email review for
   *  zero recipients. */
  function startSend() {
    if (counts.email === 0) {
      void doSend().catch((e) =>
        notify(e instanceof Error ? e.message : 'Failed to send invitations', 'error'),
      )
      return
    }
    setReviewing(true)
  }

  /** The actual send. Called from the review step, once the admin has seen the
   *  copy and confirmed — nothing goes out before that. */
  async function doSend() {
    const invites = pendingInvites()
    if (invites.length === 0) return
    const res = await api.sendInvites(invites)
    notify(res.message, res.failedCount ? 'error' : 'success')
    onInvitesSent(res.total)
    setSelection({})
  }

  const pendingTotal = statusCounts['not-signed-in']

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-ink">Multi-Channel Invitations</h3>
          <p className="text-xs text-muted">
            {someOn
              ? `${counts.email} email · ${counts.whatsapp} WhatsApp selected`
              : `${alumni.length} contact${alumni.length === 1 ? '' : 's'} · ${batches.length} batch${
                  batches.length === 1 ? '' : 'es'
                }`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* layout toggle */}
          <div className="flex rounded-full border border-line p-0.5">
            {(
              [
                { key: 'table', label: 'Table', icon: <Rows3 size={14} /> },
                { key: 'batches', label: 'By batch', icon: <LayoutGrid size={14} /> },
              ] as const
            ).map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLayout(l.key)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                  layout === l.key ? 'bg-brand text-white' : 'text-muted hover:text-ink',
                )}
              >
                {l.icon} {l.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            icon={<UserCheck size={15} />}
            onClick={() => selectPendingArrivals()}
            disabled={pendingTotal === 0}
            title="Tick everyone who was invited but still hasn't signed in"
          >
            Select not signed in ({pendingTotal})
          </Button>
          <Button variant="outline" icon={<FilePenLine size={15} />} onClick={() => setEditingTemplate(true)}>
            Edit email
          </Button>
          <Button onClick={startSend} disabled={!someOn} icon={<Send size={16} />}>
            Send{someOn ? ` (${counts.email})` : ''}
          </Button>
        </div>
      </div>

      <p className="border-b border-line bg-brand-50/60 px-4 py-2.5 text-xs text-ink">
        <span className="font-semibold">Sending an email invitation creates the account.</span>{' '}
        Each recipient gets a generated password and a sign-in link. Re-sending to someone who
        hasn&rsquo;t signed in yet issues a fresh password; anyone who has already signed in or set
        their own password is skipped. WhatsApp is simulated and creates nothing.
      </p>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_LABELS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={cx(
                'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                status === f.key
                  ? 'bg-brand text-white'
                  : 'bg-page text-muted hover:text-ink',
              )}
            >
              {f.label} ({statusCounts[f.key]})
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            className="rounded-lg border border-line px-2 py-1.5 text-xs outline-none focus:border-brand"
          >
            <option value="all">All batches ({alumni.length})</option>
            {batches.map((b) => (
              <option key={b.label} value={b.label}>
                {b.label} ({b.total})
              </option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or email"
              className="w-52 rounded-lg border border-line py-1.5 pl-8 pr-3 text-xs outline-none focus:border-brand"
            />
          </div>
        </div>
      </div>

      {layout === 'batches' ? (
        /* ---- grouped by import ---- */
        <div className="space-y-4 p-4">
          {batches.length === 0 && (
            <p className="py-8 text-center text-muted">
              No alumni yet. Upload a CSV or add one manually to get started.
            </p>
          )}
          {batches
            .filter((b) => batch === 'all' || b.label === batch)
            .map((b) => {
              const rows = b.rows.filter(MATCHES[status]).filter((a) => {
                const term = q.trim().toLowerCase()
                return (
                  !term ||
                  a.name.toLowerCase().includes(term) ||
                  a.email.toLowerCase().includes(term)
                )
              })
              return (
                <div key={b.label} className="rounded-xl border border-line">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-page px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{b.label}</p>
                      <p className="text-xs text-muted">
                        {b.total} contact{b.total === 1 ? '' : 's'} · {b.invited} invited ·{' '}
                        <span className="text-green-700">{b.signedIn} signed in</span> ·{' '}
                        <span className="text-brand">{b.pending} waiting</span>
                        {b.failed > 0 && <span className="text-red-600"> · {b.failed} failed</span>}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      icon={<UserCheck size={14} />}
                      disabled={b.pending === 0}
                      onClick={() => selectPendingArrivals(b.rows)}
                    >
                      Select waiting ({b.pending})
                    </Button>
                  </div>
                  {rows.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-muted">
                      Nothing in this batch matches the current filter.
                    </p>
                  ) : (
                    <div className="divide-y divide-line">
                      {rows.map((a) => {
                        const c = get(a.id)
                        return (
                          <div
                            key={a.id}
                            className={cx(
                              'flex flex-wrap items-center gap-3 px-4 py-2.5',
                              (c.email || c.whatsapp) && 'bg-brand-50/60',
                            )}
                          >
                            <Checkbox
                              aria-label={`Email ${a.name}`}
                              checked={c.email}
                              onChange={(on) => toggleCell(a.id, 'email', on)}
                            />
                            <button
                              type="button"
                              onClick={() => setViewing(a.id)}
                              className="min-w-0 flex-1 text-left"
                              title="View the invite email sent to this person"
                            >
                              <p className="truncate text-sm font-medium text-ink hover:text-brand hover:underline">
                                {a.name}
                              </p>
                              <p className="truncate text-xs text-muted">{a.email}</p>
                            </button>
                            <InviteCell a={a} />
                            <ArrivalCell a={a} />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      ) : (
        /* ---- flat table ---- */
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    aria-label="Select all shown recipients and channels"
                    checked={allOn}
                    indeterminate={someOn && !allOn}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Batch</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Invite</th>
                <th className="px-4 py-3 font-medium">Signed in</th>
                <th className="px-4 py-3 text-center font-medium">
                  <span className="inline-flex items-center gap-1"><Mail size={14} /> Email</span>
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  <span className="inline-flex items-center gap-1"><MessageCircle size={14} /> WhatsApp</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-muted">
                    {alumni.length === 0
                      ? 'No alumni yet. Upload a CSV or add one manually to get started.'
                      : 'Nothing matches these filters.'}
                  </td>
                </tr>
              ) : (
                visible.map((a) => {
                  const c = get(a.id)
                  return (
                    <tr
                      key={a.id}
                      className={cx(
                        'border-b border-line transition-colors hover:bg-gray-50',
                        (c.email || c.whatsapp) && 'bg-brand-50/60',
                      )}
                    >
                      <td className="px-4 py-3">
                        <Checkbox
                          aria-label={`Select ${a.name}`}
                          checked={c.email && c.whatsapp}
                          indeterminate={c.email !== c.whatsapp}
                          onChange={(on) => setSelection((s) => ({ ...s, [a.id]: { email: on, whatsapp: on } }))}
                        />
                      </td>
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
                        <p className="text-xs text-muted">{a.role}</p>
                      </td>
                      <td className="max-w-[150px] px-4 py-3">
                        <span className="block truncate text-xs text-muted" title={a.batch || UNGROUPED}>
                          {a.batch || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{a.phone || '—'}</td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-muted">{a.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {a.statusTags.length ? (
                            a.statusTags.map((t) => <StatusBadge key={t} tag={t} />)
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3"><InviteCell a={a} /></td>
                      <td className="px-4 py-3"><ArrivalCell a={a} /></td>
                      <td className="px-4 py-3 text-center">
                        <Checkbox aria-label={`Email ${a.name}`} checked={c.email} onChange={(on) => toggleCell(a.id, 'email', on)} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Checkbox aria-label={`WhatsApp ${a.name}`} checked={c.whatsapp} onChange={(on) => toggleCell(a.id, 'whatsapp', on)} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingTemplate && <InviteEmailTemplateModal onClose={() => setEditingTemplate(false)} />}
      {viewing && <SentInviteDetailModal inviteeId={viewing} onClose={() => setViewing(null)} />}

      {/* Hitting Send opens the email for review first — the admin confirms
          the copy (and can edit it) before anything reaches an inbox. */}
      {reviewing && (
        <InviteEmailTemplateModal
          sendCount={counts.email}
          onConfirmSend={doSend}
          onClose={() => setReviewing(false)}
        />
      )}
    </Card>
  )
}
