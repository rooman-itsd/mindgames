import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CheckCircle2, ExternalLink, FilePenLine, FileText, Megaphone, Pin, X, XCircle } from 'lucide-react'
import {
  MENTOR_CLAIM_LABELS,
  PLAN_IDS,
  type Alumni,
  type AdminSubscriptionRow,
  type ContactRow,
  type MentorApplication,
  type PendingCommunity,
  type PendingEvent,
  type PlanId,
  type StartupApplication,
  type SubscriptionEvent,
  type User,
} from '../types'
import { api } from '../lib/api'
import { useApp } from '../store/AppStore'
import { AdminLayout, type AdminView } from '../components/admin/AdminLayout'
import { StatBar } from '../components/admin/StatBar'
import { CsvUpload } from '../components/admin/CsvUpload'
import { AddUserForm } from '../components/admin/AddUserForm'
import { AlumniTable } from '../components/admin/AlumniTable'
import { InviteEmailTemplateModal } from '../components/admin/InviteEmailTemplateModal'
import { SentInvitesPanel } from '../components/admin/SentInvitesPanel'
import { PendingConfirmationsPanel } from '../components/admin/PendingConfirmationsPanel'
import { Avatar, Button, Card } from '../components/ui'
import { CountUp } from '../components/ui/CountUp'
import { roleLine, timeAgo } from '../lib/format'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// NOTE: Restyled to the light Root Connect theme. All api.* invite/alumni LOGIC
// is unchanged from the original implementation.

export function AdminDashboard() {
  useDocumentTitle('Admin console · Root Connect')
  const { notify } = useApp()
  const [view, setView] = useState<AdminView>('dashboard')
  const [alumni, setAlumni] = useState<Alumni[]>([])
  const [preview, setPreview] = useState<ContactRow[]>([])
  // Filename of the CSV being previewed — becomes the import's batch label.
  const [previewBatch, setPreviewBatch] = useState('')
  const [invitesSent, setInvitesSent] = useState(0)

  const loadAlumni = useCallback(() => {
    api
      .getAlumni()
      .then(setAlumni)
      .catch(() => notify('Could not reach the API. Is the backend running on :4000?', 'error'))
  }, [notify])

  useEffect(() => {
    loadAlumni()
  }, [loadAlumni])

  const mentors = useMemo(() => alumni.filter((a) => a.statusTags.includes('Can mentor')).length, [alumni])

  async function commitPreview() {
    const valid = preview.filter((r) => r.valid)
    if (valid.length === 0) return notify('No valid rows to import.', 'error')
    try {
      const { added, skipped, batch } = await api.bulkAddAlumni(valid, previewBatch)
      setAlumni((prev) => [...added, ...prev])
      setPreview([])
      setPreviewBatch('')
      // The server says WHY each row was skipped — already in the directory,
      // not a valid email, no name. Reporting only a count left the admin to
      // guess, and "skipped 4" reads like a failure rather than four rows
      // that were already there.
      const why = skipped.reduce<Record<string, number>>((acc, s) => {
        acc[s.reason] = (acc[s.reason] ?? 0) + 1
        return acc
      }, {})
      const detail = Object.entries(why)
        .map(([reason, n]) => `${n} ${reason}`)
        .join(', ')
      notify(
        `Imported ${added.length} into "${batch}"${detail ? ` · skipped ${skipped.length}: ${detail}` : ''}.`,
        skipped.length && !added.length ? 'error' : 'success',
      )
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Import failed', 'error')
    }
  }

  async function addOne(row: { name: string; phone: string; email: string }) {
    try {
      const created = await api.addAlumni(row)
      setAlumni((prev) => [created, ...prev])
      notify(`Added ${created.name}.`, 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not add alumnus', 'error')
    }
  }

  return (
    <AdminLayout
      view={view}
      onViewChange={setView}
      stats={<StatBar total={alumni.length} mentors={mentors} invitesSent={invitesSent} />}
    >
      {view === 'dashboard' && (
        <div className="space-y-6">
          <OverviewPanel />
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-1 text-base font-bold text-ink">Bulk Upload (CSV)</h2>
              <p className="mb-4 text-sm text-muted">Import a contact list — we keep only Name, Phone and Email.</p>
              <CsvUpload
                onParsed={(rows, fileName) => {
                  setPreview(rows)
                  setPreviewBatch(fileName)
                }}
              />
            </Card>
            <Card className="p-5">
              <h2 className="mb-1 text-base font-bold text-ink">Add Individually</h2>
              <p className="mb-4 text-sm text-muted">Quick single-user entry.</p>
              <AddUserForm onAdd={addOne} />
            </Card>
          </div>

          {preview.length > 0 && <PreviewTable rows={preview} onImport={commitPreview} onDiscard={() => setPreview([])} />}

          <AlumniTable
            alumni={alumni}
            onInvitesSent={(n) => {
              setInvitesSent((s) => s + n)
              loadAlumni()
            }}
          />
        </div>
      )}

      {view === 'sent-invites' && <SentInvitesPanel alumni={alumni} onChanged={loadAlumni} />}

      {view === 'directory' && (
        <AlumniTable
          alumni={alumni}
          onInvitesSent={(n) => {
            setInvitesSent((s) => s + n)
            loadAlumni()
          }}
        />
      )}

      {view === 'announcements' && <AnnouncementsPanel />}

      {view === 'mentors' && <MentorApprovalsPanel />}

      {view === 'subscriptions' && <SubscriptionsPanel />}

      {view === 'confirmations' && <PendingConfirmationsPanel />}

      {view === 'startups' && <StartupApplicationsPanel />}

      {view === 'communities' && <CommunityApprovalsPanel />}

      {view === 'events' && <EventApprovalsPanel />}

      {view === 'reports' && <ReportsPanel />}
      {view === 'settings' && <SettingsPanel />}
    </AdminLayout>
  )
}

// Publish official Rooman content: pinned announcements (broadcast) or quiet
// news updates. Only admin-authored posts appear on News & Updates.
function AnnouncementsPanel() {
  const { announce, unpinAnnouncement, posts, userById } = useApp()
  const [text, setText] = useState('')
  const [mode, setMode] = useState<'announcement' | 'news'>('announcement')
  const pinned = posts.filter((p) => p.pinned)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <Megaphone size={18} className="text-brand" /> Publish to the Network
        </h2>
        <p className="mb-3 mt-1 text-sm text-muted">
          Official content shows on News &amp; Updates. Member posts never do.
        </p>

        {/* Mode */}
        <div className="mb-3 flex flex-col gap-2">
          <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${mode === 'announcement' ? 'border-brand bg-brand-50' : 'border-line'}`}>
            <input type="radio" className="mt-0.5 accent-brand" checked={mode === 'announcement'} onChange={() => setMode('announcement')} />
            <span>
              <span className="block text-sm font-semibold text-ink">📌 Announcement</span>
              <span className="block text-xs text-muted">Pinned to the top of every feed + notification to all members. For important news.</span>
            </span>
          </label>
          <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${mode === 'news' ? 'border-brand bg-brand-50' : 'border-line'}`}>
            <input type="radio" className="mt-0.5 accent-brand" checked={mode === 'news'} onChange={() => setMode('news')} />
            <span>
              <span className="block text-sm font-semibold text-ink">📰 News update</span>
              <span className="block text-xs text-muted">Appears on News &amp; Updates and in the feed — no pin, no notification blast.</span>
            </span>
          </label>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="e.g. Alumni Summit 2026 registrations are now open!"
          className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <Button
          className="mt-3"
          icon={<Pin size={15} />}
          disabled={!text.trim()}
          onClick={() => { announce(text, mode === 'announcement'); setText('') }}
        >
          {mode === 'announcement' ? 'Pin Announcement' : 'Publish News Update'}
        </Button>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-bold text-ink">Live Pinned Announcements</h2>
        <div className="mt-3 flex flex-col gap-3">
          {pinned.map((p) => (
            <div key={p.id} className="rounded-lg border border-brand-100 bg-brand-50 p-3">
              <p className="text-sm text-ink">{p.content}</p>
              <div className="mt-1 flex items-center justify-between">
                <p className="text-xs text-muted">{userById(p.authorId)?.name} · {timeAgo(p.createdAt)}</p>
                <button
                  onClick={() => unpinAnnouncement(p.id)}
                  className="text-xs font-semibold text-brand hover:underline"
                >
                  Unpin
                </button>
              </div>
            </div>
          ))}
          {pinned.length === 0 && <p className="text-sm text-muted">No announcements pinned yet.</p>}
        </div>
      </Card>
    </div>
  )
}

/**
 * One pending application. An approval decision is only meaningful with the
 * evidence in front of you, so the row fetches the claim and the proof-document
 * list and links each file to the admin-only download route.
 */
function MentorApplicationRow({
  user,
  onApprove,
  onDecline,
}: {
  user: User
  onApprove: () => void
  onDecline: (reason?: string) => void
}) {
  const { notify } = useApp()
  const [app, setApp] = useState<MentorApplication | null>(null)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    let live = true
    api.getMentorApplication(user.id).then(
      (a) => live && setApp(a),
      () => live && setApp(null),
    )
    return () => {
      live = false
    }
  }, [user.id])

  // The route needs the Bearer header, so the bytes are fetched and handed to
  // the browser as an object URL — the same shape as the resume download in
  // Jobs and the attachment download in ChatPanel.
  async function downloadProof(docId: string, name: string) {
    try {
      const blob = await api.downloadMentorProof(user.id, docId)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not download that document.', 'error')
    }
  }

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-center gap-3">
        <Avatar name={user.name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{user.name}</p>
          <p className="truncate text-xs text-muted">
            {[roleLine(user), user.domain].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Button icon={<Check size={15} />} className="!px-3 !py-1.5 text-xs" onClick={onApprove}>
          Approve
        </Button>
        <button
          onClick={() => setDeclining((d) => !d)}
          aria-label={`Decline ${user.name}`}
          className="rounded-full p-2 text-muted hover:bg-gray-100"
        >
          <X size={18} />
        </button>
      </div>

      {app?.claim && (
        <div className="mt-2 border-t border-line pt-2">
          <p className="text-xs text-muted">
            Claiming: <span className="font-medium text-ink">{MENTOR_CLAIM_LABELS[app.claim]}</span>
          </p>
          {app.note && <p className="mt-1 text-xs text-muted">Note: {app.note}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {app.documents.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => downloadProof(d.id, d.name)}
                className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink hover:border-brand hover:text-brand"
              >
                <FileText size={11} /> {d.name}
              </button>
            ))}
            {app.documents.length === 0 && (
              <span className="text-xs text-red-500">No documents attached.</span>
            )}
          </div>
        </div>
      )}
      {app && !app.claim && (
        <p className="mt-2 border-t border-line pt-2 text-xs text-muted">
          Submitted before proof was required — no documents on file.
        </p>
      )}

      {declining && (
        <div className="mt-2 border-t border-line pt-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why? Shown to the member so they can resubmit."
            maxLength={500}
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="subtle" className="!px-3 !py-1.5 text-xs" onClick={() => setDeclining(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              className="!px-3 !py-1.5 text-xs"
              onClick={() => onDecline(reason.trim() || undefined)}
            >
              Confirm decline
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Approve / decline alumni who applied to become mentors.
function MentorApprovalsPanel() {
  const { pendingMentorIds, userById, approveMentor, declineMentor, users, currentUser } = useApp()
  const pending = pendingMentorIds.map(userById).filter(Boolean) as NonNullable<ReturnType<typeof userById>>[]
  const activeMentors = users.filter((u) => u.isMentor && u.id !== currentUser.id && u.id !== 'rooman')

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <h2 className="text-base font-bold text-ink">Pending Mentor Applications ({pending.length})</h2>
        <div className="mt-3 flex flex-col gap-3">
          {pending.map((u) => (
            <MentorApplicationRow
              key={u.id}
              user={u}
              onApprove={() => approveMentor(u.id)}
              onDecline={(reason) => declineMentor(u.id, reason)}
            />
          ))}
          {pending.length === 0 && <p className="text-sm text-muted">No pending applications. 🎉</p>}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-bold text-ink">Active Mentors ({activeMentors.length})</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {activeMentors.map((u) => (
            <div key={u.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
              <Avatar name={u.name} size={40} />
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{u.name}</p>
                <p className="truncate text-xs text-muted">₹{u.mentorRate?.toLocaleString('en-IN')}/hr · {u.sessionsConducted} sessions</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// Every approved mentor's plan, comp a plan without payment, or revoke one.
// The only UI for POST /api/subscription/admin/grant and /admin/revoke —
// without this panel those routes had no caller anywhere in the product.
function SubscriptionsPanel() {
  const { notify } = useApp()
  const [rows, setRows] = useState<AdminSubscriptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [grantFor, setGrantFor] = useState<AdminSubscriptionRow | null>(null)
  const [historyFor, setHistoryFor] = useState<AdminSubscriptionRow | null>(null)

  const load = useCallback(() => {
    api.getAdminSubscriptions().then(setRows, () => notify('Could not load subscriptions.', 'error')).finally(() => setLoading(false))
  }, [notify])

  useEffect(() => {
    load()
  }, [load])

  async function revoke(row: AdminSubscriptionRow) {
    try {
      await api.revokeSubscription(row.userId)
      notify(`Revoked ${row.name}'s subscription.`, 'success')
      load()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not revoke subscription', 'error')
    }
  }

  async function grant(plan: PlanId, months: number, note: string) {
    if (!grantFor) return
    try {
      await api.grantSubscription(grantFor.userId, plan, months, note || undefined)
      notify(`Granted ${grantFor.name} the ${plan} plan.`, 'success')
      setGrantFor(null)
      load()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not grant subscription', 'error')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-5">
        <h2 className="text-base font-bold text-ink">Mentor Subscriptions ({rows.length})</h2>
        <p className="mt-1 text-sm text-muted">
          Comp a plan for a mentor (support fixing a failed charge, or before a gateway is wired up),
          or revoke one.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No approved mentors yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.userId} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                <Avatar name={r.name} src={r.photo} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
                  <p className="truncate text-xs text-muted">
                    {[r.designation, r.company].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    r.subscribed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-muted'
                  }`}
                >
                  {r.plan} · {r.status}
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {r.sessionsThisMonth} session{r.sessionsThisMonth === 1 ? '' : 's'} this month
                  {r.expiresAt && ` · expires ${new Date(r.expiresAt).toLocaleDateString('en-IN')}`}
                </span>
                <div className="flex shrink-0 gap-2">
                  <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" onClick={() => setHistoryFor(r)}>
                    History
                  </Button>
                  <Button variant="outline" className="!px-3 !py-1.5 !text-xs" onClick={() => setGrantFor(r)}>
                    Grant
                  </Button>
                  {r.subscribed && (
                    <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" onClick={() => revoke(r)}>
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {grantFor && (
        <GrantSubscriptionModal
          name={grantFor.name}
          onClose={() => setGrantFor(null)}
          onGrant={grant}
        />
      )}
      {historyFor && (
        <SubscriptionHistoryModal
          userId={historyFor.userId}
          name={historyFor.name}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  )
}

function SubscriptionHistoryModal({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
  const [events, setEvents] = useState<SubscriptionEvent[] | null>(null)

  useEffect(() => {
    api.getSubscriptionEvents(userId).then(setEvents, () => setEvents([]))
  }, [userId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-ink">{name}'s subscription history</h2>
        <div className="mt-3 flex-1 overflow-y-auto">
          {events === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted">No subscription events yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {events.map((e, i) => (
                <div key={i} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">{e.kind} · {e.plan}</span>
                    <span className="text-xs text-muted">{new Date(e.createdAt).toLocaleString('en-IN')}</span>
                  </div>
                  {(e.amount || e.provider || e.note) && (
                    <p className="mt-1 text-xs text-muted">
                      {[e.amount ? `₹${e.amount.toLocaleString('en-IN')}` : null, e.provider, e.note].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <Button variant="ghost" className="mt-4" onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

function GrantSubscriptionModal({
  name,
  onClose,
  onGrant,
}: {
  name: string
  onClose: () => void
  onGrant: (plan: PlanId, months: number, note: string) => void
}) {
  const [plan, setPlan] = useState<PlanId>('mentor')
  const [months, setMonths] = useState('1')
  const [note, setNote] = useState('')
  const field = 'mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-ink">Grant a plan to {name}</h2>
        <label className="mt-4 block text-sm font-medium text-ink">Plan</label>
        <select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)} className={field}>
          {PLAN_IDS.filter((p) => p !== 'free').map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <label className="mt-3 block text-sm font-medium text-ink">Months</label>
        <input
          type="number"
          min={1}
          max={24}
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          className={field}
        />
        <label className="mt-3 block text-sm font-medium text-ink">Note (optional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} className={field} placeholder="e.g. Comp for a failed charge" />
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onGrant(plan, Math.min(24, Math.max(1, Number(months) || 1)), note.trim())}>
            Grant
          </Button>
        </div>
      </div>
    </div>
  )
}

type AdminStats = Awaited<ReturnType<typeof api.getAdminStats>>

// Network-wide overview: who joined, engagement, and what needs attention.
/** One hue per overview tile so the numbers scan apart at a glance. Written in
 *  full (not built from a template) so Tailwind generates every class. */
const TILE_TONES = [
  'text-brand',
  'text-lagoon-700',
  'text-iris-700',
  'text-clay-700',
  'text-amethyst-700',
  'text-saffron-700',
  'text-ocean-700',
  'text-rosewood-700',
]

function OverviewPanel() {
  const [stats, setStats] = useState<AdminStats | null>(null)

  useEffect(() => {
    api.getAdminStats().then(setStats, () => {})
  }, [])

  if (!stats) return null

  const tiles: Array<{ label: string; value: string | number; hint?: string }> = [
    { label: 'Members joined', value: stats.members, hint: `+${stats.membersThisWeek} this week` },
    { label: 'Invites sent', value: `${stats.invited}/${stats.invitees}`, hint: 'invited / directory' },
    { label: 'Posts', value: stats.posts, hint: `${stats.comments} comments` },
    { label: 'Communities', value: stats.communities },
    { label: 'Sessions', value: stats.sessions.upcoming + stats.sessions.completed, hint: `${stats.sessions.requested} awaiting mentor` },
    { label: 'Startup applications', value: stats.startups },
    { label: 'Job applications', value: stats.jobApplications },
    { label: 'Mentor approvals pending', value: stats.pendingMentorApps },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <Card key={t.label} className="p-4">
            <p className={`text-2xl font-extrabold ${TILE_TONES[i % TILE_TONES.length]}`}>
              {typeof t.value === 'number' ? <CountUp value={t.value} /> : t.value}
            </p>
            <p className="mt-0.5 text-sm font-medium text-ink">{t.label}</p>
            {t.hint && <p className="text-xs text-muted">{t.hint}</p>}
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="text-base font-bold text-ink">Newest Accounts</h2>
        {/* Was "Recently Joined", which read as "these people showed up" — but
            an admin invite creates the account, so this list is really
            "accounts created". Whether they've arrived is last_login_at. */}
        <p className="mb-3 mt-0.5 text-xs text-muted">
          Created by invite or sign-up — not necessarily signed in yet.
        </p>
        <div className="flex flex-col gap-2">
          {stats.recentMembers.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
              <Avatar name={m.name} size={36} />
              <div className="min-w-0 flex-1">
                <Link to={`/profile/${m.id}`} className="text-sm font-semibold text-ink hover:underline">
                  {m.name}
                </Link>
                <p className="truncate text-xs text-muted">
                  {m.email}{m.city ? ` · ${m.city}` : ''}
                </p>
                {m.lastLoginAt ? (
                  <p className="text-xs text-green-700">
                    signed in {timeAgo(m.lastLoginAt)}
                    {!m.passwordChanged && ' · still on emailed password'}
                  </p>
                ) : m.everActive ? (
                  // Onboarded/edited, so they signed in — just before we
                  // started recording when. Claiming "never" here is wrong.
                  <p className="text-xs text-green-700">signed in (before login tracking)</p>
                ) : (
                  <p className="text-xs text-brand">never signed in</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-muted">added {timeAgo(m.joinedAt)}</span>
            </div>
          ))}
          {stats.recentMembers.length === 0 && (
            <p className="text-sm text-muted">No members yet — send some invites below.</p>
          )}
        </div>
      </Card>
    </div>
  )
}

// Member-created communities awaiting acceptance.
function CommunityApprovalsPanel() {
  const { notify } = useApp()
  const [pending, setPending] = useState<PendingCommunity[] | null>(null)

  useEffect(() => {
    api.getPendingCommunities().then(setPending, () => setPending([]))
  }, [])

  function act(id: string, action: 'approve' | 'reject') {
    const call = action === 'approve' ? api.approveCommunity(id) : api.rejectCommunity(id)
    call.then(
      () => {
        setPending((list) => (list ?? []).filter((c) => c.id !== id))
        notify(action === 'approve' ? 'Community approved — it is now live.' : 'Community request declined.', action === 'approve' ? 'success' : 'info')
      },
      () => notify('Could not update the community.', 'error'),
    )
  }

  if (pending === null) return <p className="text-sm text-muted">Loading pending communities…</p>

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="text-base font-bold text-ink">Pending Communities ({pending.length})</h2>
        <p className="mt-1 text-sm text-muted">
          Member-created communities go live only after your approval. Creators are notified either way.
        </p>
      </Card>

      {pending.map((c) => (
        <Card key={c.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${c.color} text-lg font-black text-white`}>
                {c.name[0]}
              </span>
              <div>
                <p className="font-bold text-ink">{c.name}</p>
                <p className="text-xs text-muted">{c.category} · #{c.tag} · requested by {c.creatorName}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="!px-4 !py-2 text-xs" onClick={() => act(c.id, 'approve')}>
                <Check size={14} /> Approve
              </Button>
              <Button variant="subtle" className="!px-4 !py-2 text-xs" onClick={() => act(c.id, 'reject')}>
                <X size={14} /> Decline
              </Button>
            </div>
          </div>
          <p className="mt-3 text-sm text-ink">{c.description}</p>
        </Card>
      ))}
      {pending.length === 0 && (
        <Card className="py-12 text-center text-sm text-muted">No pending communities. 🎉</Card>
      )}
    </div>
  )
}

// Member-created events awaiting acceptance.
function EventApprovalsPanel() {
  const { notify } = useApp()
  const [pending, setPending] = useState<PendingEvent[] | null>(null)

  useEffect(() => {
    api.getPendingEvents().then(setPending, () => setPending([]))
  }, [])

  function act(id: string, action: 'approve' | 'reject') {
    const call = action === 'approve' ? api.approveEvent(id) : api.rejectEvent(id)
    call.then(
      () => {
        setPending((list) => (list ?? []).filter((e) => e.id !== id))
        notify(
          action === 'approve' ? 'Event approved — the network has been notified.' : 'Event request declined.',
          action === 'approve' ? 'success' : 'info',
        )
      },
      () => notify('Could not update the event.', 'error'),
    )
  }

  if (pending === null) return <p className="text-sm text-muted">Loading pending events…</p>

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="text-base font-bold text-ink">Pending Events ({pending.length})</h2>
        <p className="mt-1 text-sm text-muted">
          Member-created events go live only after your approval. Hosts are notified either way.
        </p>
      </Card>

      {pending.map((e) => {
        const start = new Date(e.startsAt)
        return (
          <Card key={e.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand">
                  <span className="text-[10px] font-bold uppercase">{start.toLocaleDateString('en-IN', { month: 'short' })}</span>
                  <span className="text-lg leading-none font-extrabold">{start.getDate()}</span>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-ink">{e.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.isPaid ? 'bg-brand-100 text-brand' : 'bg-green-100 text-green-700'}`}>
                      {e.isPaid ? `Paid · ₹${(e.price ?? 0).toLocaleString('en-IN')}` : 'Free'}
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    {start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}
                    {start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                    {e.location ? ` · ${e.location}` : ''} · requested by {e.creatorName}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="!px-4 !py-2 text-xs" onClick={() => act(e.id, 'approve')}>
                  <Check size={14} /> Approve
                </Button>
                <Button variant="subtle" className="!px-4 !py-2 text-xs" onClick={() => act(e.id, 'reject')}>
                  <X size={14} /> Decline
                </Button>
              </div>
            </div>
            {e.description && <p className="mt-3 text-sm text-ink">{e.description}</p>}
          </Card>
        )
      })}
      {pending.length === 0 && (
        <Card className="py-12 text-center text-sm text-muted">No pending events. 🎉</Card>
      )}
    </div>
  )
}

// StartupVarsity applications with founder contact details for follow-up.
function StartupApplicationsPanel() {
  const [apps, setApps] = useState<StartupApplication[] | null>(null)

  useEffect(() => {
    api.getStartupApplications().then(setApps, () => setApps([]))
  }, [])

  if (apps === null) return <p className="text-sm text-muted">Loading applications…</p>

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="text-base font-bold text-ink">
          StartupVarsity Applications ({apps.length})
        </h2>
        <p className="mt-1 text-sm text-muted">
          Ideas submitted from the network. Reach out to founders directly, or process them at{' '}
          <a href="https://www.startupvarsity.com" target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">
            startupvarsity.com
          </a>.
        </p>
      </Card>

      {apps.map((a) => (
        <Card key={a.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold text-ink">{a.name}</p>
              <p className="text-xs text-muted">
                {a.domain} · {a.stage} · team of {a.teamSize} · applied {timeAgo(a.appliedAt)}
              </p>
            </div>
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700">{a.stage}</span>
          </div>
          <p className="mt-3 text-sm text-ink">{a.description}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <div className="flex items-center gap-2">
              <Avatar name={a.founderName} size={36} />
              <div>
                <p className="text-sm font-semibold text-ink">{a.founderName}</p>
                <p className="text-xs text-muted">
                  {a.founderEmail}
                  {a.founderPhone ? ` · ${a.founderPhone}` : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href={`mailto:${a.founderEmail}?subject=${encodeURIComponent(`StartupVarsity — ${a.name}`)}`}
                className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-brand hover:text-brand"
              >
                Email founder
              </a>
              <Link
                to={`/profile/${a.founderId}`}
                className="rounded-full btn-primary px-4 py-2 text-sm font-semibold text-white"
              >
                View profile
              </Link>
            </div>
          </div>
        </Card>
      ))}
      {apps.length === 0 && (
        <Card className="py-12 text-center text-sm text-muted">No applications yet.</Card>
      )}
    </div>
  )
}

function PreviewTable({
  rows,
  onImport,
  onDiscard,
}: {
  rows: ContactRow[]
  onImport: () => void
  onDiscard: () => void
}) {
  const validCount = rows.filter((r) => r.valid).length
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h3 className="text-sm font-bold text-ink">
          Parsed Preview — <span className="text-green-600">{validCount} valid</span>
          {rows.length - validCount > 0 && <span className="text-red-500"> · {rows.length - validCount} flagged</span>}
        </h3>
        <div className="flex gap-2">
          <button onClick={onDiscard} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-gray-100">
            Discard
          </button>
          <button onClick={onImport} className="rounded-full btn-primary px-4 py-2 text-sm font-semibold text-white">
            Import {validCount}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 text-center font-medium">Valid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line">
                <td className="px-4 py-2 text-ink">{r.name || <span className="text-red-500">missing</span>}</td>
                <td className="px-4 py-2 text-muted">{r.phone || '—'}</td>
                <td className="px-4 py-2 text-muted">{r.email || <span className="text-red-500">missing</span>}</td>
                <td className="px-4 py-2 text-center">
                  {r.valid ? (
                    <CheckCircle2 size={16} className="mx-auto text-green-600" />
                  ) : (
                    <XCircle size={16} className="mx-auto text-red-500" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function SettingsPanel() {
  const [integrations, setIntegrations] = useState<{ google: boolean; smtp: boolean; ai: boolean } | null>(null)
  const [editingTemplate, setEditingTemplate] = useState(false)
  const [appUrl, setAppUrl] = useState<string | null>(null)

  useEffect(() => {
    api.getAdminStats().then((s) => {
      setIntegrations(s.integrations)
      setAppUrl(s.appUrl)
    }, () => {})
  }, [])

  // This box's public IP changes whenever it stops and starts (no Elastic IP),
  // but APP_URL in the server's .env doesn't follow — so invite emails keep
  // pointing at the previous address and every link in them times out.
  //
  // Comparing APP_URL against this console's own origin does NOT detect that:
  // it fires whenever the console is reached by a different-but-valid route
  // (a hostname, an SSH port-forward, localhost during development), and says
  // nothing in the case that actually matters, because an admin browsing the
  // stale address sees the two agree. So the value is shown plainly for the
  // admin to check against the address they expect testers to use, rather
  // than dressed up as a verdict the app can't actually reach.
  const consoleOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const appUrlDiffers = !!appUrl && !!consoleOrigin && appUrl.replace(/\/+$/, '') !== consoleOrigin

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="mb-1 text-base font-bold text-ink">Integrations</h2>
        <p className="text-sm text-muted">
          Configured via <code className="rounded bg-page px-1">backend/.env</code> — restart the API after changes.
        </p>
        <div className="mt-5 space-y-3">
          <IntegrationRow
            label="Google sign-in"
            ok={!!integrations?.google}
            okText="Live — real Google OAuth"
            offText="Demo mode — set GOOGLE_CLIENT_ID to enable"
          />
          <IntegrationRow
            label="Invite emails (SMTP)"
            ok={!!integrations?.smtp}
            okText="Live — real email"
            offText="Simulated — set SMTP_HOST/USER/PASS to send real email"
          />
          <IntegrationRow
            label="AI resume parsing (Claude)"
            ok={!!integrations?.ai}
            okText="Live — Claude parsing"
            offText="Mock result — set ANT_KEY to enable"
          />
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="mb-1 text-base font-bold text-ink">Invite Link Address</h2>
        <p className="mb-3 text-sm text-muted">
          Every invite email links to this address. It comes from <code className="rounded bg-page px-1">APP_URL</code>{' '}
          in the server&rsquo;s <code className="rounded bg-page px-1">.env</code>.
        </p>
        <p className="font-mono text-sm text-ink">{appUrl ?? '—'}</p>
        <p className="mt-2 text-xs text-muted">
          Check this is an address your recipients can reach — if this server&rsquo;s public address
          has changed, invite links keep pointing at the old one until <code>APP_URL</code> is
          updated in the server&rsquo;s <code>.env</code> and the API restarted.
          {appUrlDiffers && (
            <>
              {' '}You&rsquo;re currently viewing this console at{' '}
              <span className="font-mono">{consoleOrigin}</span>, which is a different address —
              that&rsquo;s expected if you reach it by hostname or a port-forward, but worth a look
              if it isn&rsquo;t.
            </>
          )}
        </p>
      </Card>
      <Card className="p-6">
        <h2 className="mb-1 text-base font-bold text-ink">Invite Email</h2>
        <p className="mb-4 text-sm text-muted">
          The credentials email a new member receives. Sending an invite creates their account and
          mails them a generated password, so this is the only place those details appear.
        </p>
        <Button
          variant="outline"
          icon={<FilePenLine size={15} />}
          onClick={() => setEditingTemplate(true)}
        >
          Edit email template
        </Button>
      </Card>
      <Card className="p-6">
        <h2 className="mb-2 text-base font-bold text-ink">Invitation Landing Page</h2>
        <p className="mb-4 text-sm text-muted">
          Where an invite link used to land. Sign-ups are invite-only now, so this page just points
          people at sign-in — invited members go straight to the locked sign-in screen instead.
        </p>
        <Link to="/accept-invite" className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">
          Open invitation page <ExternalLink size={15} />
        </Link>
      </Card>
      {editingTemplate && <InviteEmailTemplateModal onClose={() => setEditingTemplate(false)} />}
    </div>
  )
}

function IntegrationRow({ label, ok, okText, offText }: { label: string; ok: boolean; okText: string; offText: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
        {ok ? okText : offText}
      </span>
    </div>
  )
}

function ReportsPanel() {
  const [reports, setReports] = useState<Awaited<ReturnType<typeof api.getReports>> | null>(null)
  const load = () => api.getReports().then(setReports, () => setReports([]))
  useEffect(() => {
    load()
  }, [])

  async function act(id: string, action: 'dismiss' | 'resolve' | 'remove') {
    if (action === 'dismiss') await api.dismissReport(id)
    else await api.resolveReport(id, action === 'remove')
    load()
  }

  const open = reports?.filter((r) => r.status === 'open') ?? []
  const handled = reports?.filter((r) => r.status !== 'open') ?? []

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="mb-1 text-base font-bold text-ink">Open Reports ({open.length})</h2>
        <p className="mb-4 text-sm text-muted">Content flagged by members, newest first.</p>
        {reports === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : open.length === 0 ? (
          <p className="text-sm text-muted">Nothing to review. 🎉</p>
        ) : (
          <div className="space-y-3">
            {open.map((r) => (
              <div key={r.id} className="rounded-lg border border-line p-4">
                <p className="text-sm text-ink">{r.summary}</p>
                <p className="mt-1 text-xs text-muted">
                  Reported by {r.reporterName}: “{r.reason}”
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.targetType === 'post' && (
                    <Button variant="danger" className="!px-3 !py-1.5 text-xs" onClick={() => act(r.id, 'remove')}>
                      Remove post & resolve
                    </Button>
                  )}
                  <Button variant="outline" className="!px-3 !py-1.5 text-xs" onClick={() => act(r.id, 'resolve')}>
                    Resolve (keep content)
                  </Button>
                  <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => act(r.id, 'dismiss')}>
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {handled.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-3 text-base font-bold text-ink">Recently handled</h2>
          <div className="space-y-2">
            {handled.slice(0, 10).map((r) => (
              <p key={r.id} className="text-sm text-muted">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-muted'}`}>
                  {r.status}
                </span>
                {r.summary}
              </p>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
