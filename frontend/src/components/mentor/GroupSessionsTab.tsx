import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, Check, Clock, Crown, Lock, Plus, Repeat, Users, Video, X } from 'lucide-react'
import { Avatar, Button, Card } from '../ui'
import { api, isPaymentRequired } from '../../lib/api'
import { roleLine } from '../../lib/format'
import { useApp } from '../../store/AppStore'
import { CompleteSessionModal } from './CompleteSessionModal'
import { SubscriptionPlans } from '../subscription/SubscriptionPlans'
import { DOMAINS, type GroupSession, type GroupSessionAttendee } from '../../types'
import { SkeletonRows } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { UsersRound } from 'lucide-react'

/**
 * Group sessions: one mentor, many mentees, a capacity and a roster —
 * structurally different from a 1:1 booking, so it gets its own tab rather
 * than being squeezed into "Find a Mentor" or "My Sessions".
 *
 * Anyone can browse and join. Only a mentor on a plan that includes group
 * sessions (Pro/Institute) can host one — the create button is always
 * visible to a mentor, and the 402 it can produce opens the plans rather
 * than erroring, exactly like accepting a 1:1 session does.
 */
export function GroupSessionsTab() {
  const { currentUser, notify } = useApp()
  const [open, setOpen] = useState<GroupSession[]>([])
  const [mine, setMine] = useState<GroupSession[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const [completing, setCompleting] = useState<GroupSession | null>(null)
  const [rosterFor, setRosterFor] = useState<GroupSession | null>(null)
  const [repeating, setRepeating] = useState<GroupSession | null>(null)

  function reload() {
    Promise.all([api.getGroupSessions(), api.getMyGroupSessions()])
      .then(([o, m]) => { setOpen(o); setMine(m) })
      .catch(() => notify('Could not load group sessions.', 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [notify])

  const hosting = mine.filter((g) => g.mentorId === currentUser.id)
  // An invite_only session I haven't joined yet: this is how it's found at
  // all, since it's deliberately excluded from the public "Open sessions"
  // list below.
  const invited = mine.filter((g) => g.mentorId !== currentUser.id && g.invitedByMe && !g.joinedByMe)
  const joined = mine.filter((g) => g.mentorId !== currentUser.id && g.joinedByMe)
  // Don't repeat a session the member already sees in "mine".
  const mineIds = new Set(mine.map((g) => g.id))
  const browsable = open.filter((g) => !mineIds.has(g.id))

  async function join(g: GroupSession) {
    try {
      await api.joinGroupSession(g.id)
      notify(`You're in — "${g.topic}".`, 'success')
      reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not join that session.', 'error')
    }
  }

  async function leave(g: GroupSession) {
    try {
      await api.leaveGroupSession(g.id)
      notify('Left the session.', 'info')
      reload()
    } catch {
      notify('Could not leave that session.', 'error')
    }
  }

  async function confirm(g: GroupSession) {
    try {
      await api.confirmGroupSession(g.id)
      notify('Confirmed — it now counts towards your record. 🎓', 'success')
      reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not confirm that session.', 'error')
    }
  }

  async function cancel(g: GroupSession) {
    if (!window.confirm(`Cancel "${g.topic}"? Everyone who joined will be notified.`)) return
    try {
      await api.cancelGroupSession(g.id)
      notify('Session cancelled.', 'info')
      reload()
    } catch {
      notify('Could not cancel that session.', 'error')
    }
  }

  if (loading) {
    return (
      <SkeletonRows count={4} className="py-6" />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {currentUser.isMentor && (
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-4">
          <p className="text-sm text-muted">
            Host one session, many mentees join with a capacity you set.
          </p>
          <Button icon={<Plus size={15} />} onClick={() => setShowCreate(true)}>
            Host a group session
          </Button>
        </div>
      )}

      {hosting.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-ink">You're hosting</h2>
          <div className="flex flex-col gap-2">
            {hosting.map((g) => (
              <HostRow
                key={g.id}
                session={g}
                onViewRoster={() => setRosterFor(g)}
                onComplete={() => setCompleting(g)}
                onCancel={() => cancel(g)}
                onRepeat={() => setRepeating(g)}
              />
            ))}
          </div>
        </section>
      )}

      {invited.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-ink">Invited</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {invited.map((g) => (
              <BrowseCard key={g.id} session={g} onJoin={() => join(g)} />
            ))}
          </div>
        </section>
      )}

      {joined.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-ink">You've joined</h2>
          <div className="flex flex-col gap-2">
            {joined.map((g) => (
              <JoinedRow key={g.id} session={g} onLeave={() => leave(g)} onConfirm={() => confirm(g)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold text-ink">Open sessions</h2>
        {browsable.length === 0 ? (
          <EmptyState
            icon={<UsersRound size={28} />}
            title="No group sessions open right now"
            body="Mentors post them here. Meanwhile you can book a one-to-one session."
            action={{ label: 'Find a mentor', to: '/network/mentors' }}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {browsable.map((g) => (
              <BrowseCard key={g.id} session={g} onJoin={() => join(g)} />
            ))}
          </div>
        )}
      </section>

      {showCreate && (
        <CreateGroupSessionModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); reload() }}
          onNeedsPlan={() => { setShowCreate(false); setShowPlans(true) }}
        />
      )}
      {showPlans && (
        <SubscriptionPlans
          reason="You need Pro to host group sessions"
          onClose={() => setShowPlans(false)}
          onActivated={() => setShowPlans(false)}
        />
      )}
      {completing && (
        <CompleteSessionModal
          topic={completing.topic}
          who={`the group (${completing.attendeeCount} joined)`}
          onClose={() => setCompleting(null)}
          onConfirm={async (minutes, domain) => {
            try {
              await api.completeGroupSession(completing.id, minutes, domain)
              notify('Marked completed — attendees can now confirm.', 'success')
            } catch {
              notify('Could not complete that session.', 'error')
            }
            setCompleting(null)
            reload()
          }}
        />
      )}
      {rosterFor && <RosterModal session={rosterFor} onClose={() => setRosterFor(null)} />}
      {repeating && (
        <RepeatSessionModal
          session={repeating}
          onClose={() => setRepeating(null)}
          onRepeat={async (scheduledAt, meetingLink) => {
            try {
              await api.repeatGroupSession(repeating.id, { scheduledAt, meetingLink })
              notify('Scheduled — the same group has been invited.', 'success')
              setRepeating(null)
              reload()
            } catch (err) {
              notify(err instanceof Error ? err.message : 'Could not schedule the repeat session.', 'error')
            }
          }}
        />
      )}
    </div>
  )
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

function BrowseCard({ session, onJoin }: { session: GroupSession; onJoin: () => void }) {
  const full = session.seatsLeft === 0
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-start gap-2.5">
        <Avatar name={session.mentorName} src={session.mentorPhoto} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{session.topic}</p>
          <p className="text-xs text-muted">by {session.mentorName}</p>
        </div>
        {session.visibility === 'invite_only' && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
            <Lock size={10} /> Invited
          </span>
        )}
        {session.domain && (
          <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand">
            {session.domain}
          </span>
        )}
      </div>
      {session.description && <p className="line-clamp-2 text-xs text-muted">{session.description}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1"><Calendar size={12} /> {fmt(session.scheduledAt)}</span>
        <span className="flex items-center gap-1"><Clock size={12} /> {session.durationMinutes} min</span>
        <span className="flex items-center gap-1">
          <Users size={12} /> {full ? 'Full' : `${session.seatsLeft} of ${session.capacity} seats left`}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-sm font-bold text-ink">
          {session.pricingMode === 'paid' ? `₹${session.pricePerSeat.toLocaleString('en-IN')}/seat` : 'Free'}
        </span>
        <Button variant="social" className="!px-3 !py-1.5 !text-xs" disabled={full} onClick={onJoin}>
          {full ? 'Full' : 'Join'}
        </Button>
      </div>
    </Card>
  )
}

function JoinedRow({
  session, onLeave, onConfirm,
}: { session: GroupSession; onLeave: () => void; onConfirm: () => void }) {
  return (
    <Card className="flex flex-wrap items-center gap-3 p-3.5">
      <Avatar name={session.mentorName} src={session.mentorPhoto} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{session.topic}</p>
        <p className="text-xs text-muted">
          with {session.mentorName} · {fmt(session.scheduledAt)}
        </p>
      </div>
      {session.status === 'completed' ? (
        <Button className="!px-3 !py-1.5 !text-xs" icon={<Check size={12} />} onClick={onConfirm}>
          Confirm attendance
        </Button>
      ) : (
        <>
          {session.meetingLink && (
            <a href={session.meetingLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              <Video size={12} /> Join call
            </a>
          )}
          <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" onClick={onLeave}>
            Leave
          </Button>
        </>
      )}
    </Card>
  )
}

function HostRow({
  session, onViewRoster, onComplete, onCancel, onRepeat,
}: {
  session: GroupSession
  onViewRoster: () => void
  onComplete: () => void
  onCancel: () => void
  onRepeat: () => void
}) {
  return (
    <Card className="flex flex-wrap items-center gap-3 p-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
        <Users size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
          {session.topic}
          {session.visibility === 'invite_only' && <Lock size={12} className="shrink-0 text-purple-600" />}
        </p>
        <p className="text-xs text-muted">
          {fmt(session.scheduledAt)} · {session.attendeeCount}/{session.capacity} joined
        </p>
      </div>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          session.status === 'completed'
            ? 'bg-green-100 text-green-700'
            : session.status === 'cancelled'
              ? 'bg-gray-100 text-muted'
              : 'bg-brand-100 text-brand'
        }`}
      >
        {session.status}
      </span>
      <Button variant="outline" className="!px-3 !py-1.5 !text-xs" onClick={onViewRoster}>
        Roster
      </Button>
      {session.status === 'scheduled' ? (
        <>
          <Button className="!px-3 !py-1.5 !text-xs" onClick={onComplete}>
            Mark completed
          </Button>
          <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" onClick={onCancel}>
            Cancel
          </Button>
        </>
      ) : (
        session.attendeeCount > 0 && (
          <Button variant="outline" icon={<Repeat size={12} />} className="!px-3 !py-1.5 !text-xs" onClick={onRepeat}>
            Repeat with same group
          </Button>
        )
      )}
    </Card>
  )
}

function RosterModal({ session, onClose }: { session: GroupSession; onClose: () => void }) {
  const [attendees, setAttendees] = useState<GroupSessionAttendee[] | null>(null)

  useEffect(() => {
    api.getGroupSessionAttendees(session.id).then(setAttendees, () => setAttendees([]))
  }, [session.id])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Roster</h2>
            <p className="text-sm text-muted">{session.topic}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {attendees === null ? (
          <SkeletonRows count={3} className="py-4" />
        ) : attendees.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No one has joined yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {attendees.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2">
                <Avatar name={a.name} src={a.photo} size={32} to={`/profile/${a.id}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{a.name}</span>
                  {roleLine(a) && (
                    <span className="block truncate text-[11px] text-muted">{roleLine(a)}</span>
                  )}
                </span>
                {a.confirmed && (
                  <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                    <Check size={10} /> Confirmed
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function RepeatSessionModal({
  session, onClose, onRepeat,
}: { session: GroupSession; onClose: () => void; onRepeat: (scheduledAt: string, meetingLink?: string) => void }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [meetingLink, setMeetingLink] = useState(session.meetingLink ?? '')
  const [saving, setSaving] = useState(false)
  const field = 'w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand'

  async function submit() {
    if (!date || !time) return
    const scheduledAt = new Date(`${date}T${time}`)
    if (Number.isNaN(scheduledAt.getTime())) return
    setSaving(true)
    await onRepeat(scheduledAt.toISOString(), meetingLink.trim() || undefined)
    setSaving(false)
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Repeat with the same group</h2>
            <p className="text-sm text-muted">{session.topic}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted">
          Everyone who attended last time will be invited again. Pick a new date and time.
        </p>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
          </div>
        </div>
        <label className="mb-1 block text-xs font-semibold text-muted">Meeting link (optional)</label>
        <input
          value={meetingLink}
          onChange={(e) => setMeetingLink(e.target.value)}
          placeholder="https://meet.google.com/…"
          className={`mb-4 ${field}`}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={!date || !time} onClick={submit}>Schedule</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function CreateGroupSessionModal({
  onClose, onCreated, onNeedsPlan,
}: { onClose: () => void; onCreated: () => void; onNeedsPlan: () => void }) {
  const { notify, users, currentUser, connectionState } = useApp()
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [domain, setDomain] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(60)
  const [capacity, setCapacity] = useState(10)
  const [meetingLink, setMeetingLink] = useState('')
  const [paid, setPaid] = useState(false)
  const [price, setPrice] = useState<number | ''>('')
  const [visibility, setVisibility] = useState<'public' | 'invite_only'>('public')
  const [inviteeIds, setInviteeIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const connections = users.filter((u) => u.id !== currentUser.id && connectionState(u.id) === 'connected')

  function toggleInvitee(id: string) {
    setInviteeIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    if (!topic.trim() || !date || !time) {
      notify('Add a topic, date and time.', 'error')
      return
    }
    const scheduledAt = new Date(`${date}T${time}`)
    if (Number.isNaN(scheduledAt.getTime())) {
      notify('That date/time doesn\'t look valid.', 'error')
      return
    }
    if (visibility === 'invite_only' && inviteeIds.size === 0) {
      notify('Pick at least one connection to invite.', 'error')
      return
    }
    setSaving(true)
    try {
      await api.createGroupSession({
        topic: topic.trim(),
        description: description.trim(),
        domain,
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: duration,
        capacity: visibility === 'invite_only' ? Math.max(capacity, inviteeIds.size) : capacity,
        meetingLink: meetingLink.trim() || undefined,
        pricingMode: paid ? 'paid' : 'free',
        pricePerSeat: paid ? Number(price) || 0 : 0,
        visibility,
        inviteeIds: visibility === 'invite_only' ? Array.from(inviteeIds) : undefined,
      })
      notify(
        visibility === 'invite_only'
          ? `Invited ${inviteeIds.size} ${inviteeIds.size === 1 ? 'person' : 'people'}.`
          : 'Group session scheduled.',
        'success',
      )
      onCreated()
    } catch (err) {
      if (isPaymentRequired(err)) { onNeedsPlan(); return }
      notify(err instanceof Error ? err.message : 'Could not create the session.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <Crown size={16} className="text-amber-500" /> Host a group session
            </h2>
            <p className="text-sm text-muted">Requires the Pro plan or above.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <label className="mb-1 block text-xs font-semibold text-muted">Topic</label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Intro to System Design"
          className="mb-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <label className="mb-1 block text-xs font-semibold text-muted">What will you cover? (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mb-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Duration (min)</label>
            <input type="number" min={15} max={480} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 60)} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Capacity</label>
            <input type="number" min={2} max={500} value={capacity} onChange={(e) => setCapacity(Number(e.target.value) || 10)} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Domain</label>
            <select value={domain} onChange={(e) => setDomain(e.target.value)} className="w-full rounded-lg border border-line px-2 py-2 text-sm outline-none focus:border-brand">
              <option value="">—</option>
              {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <label className="mb-1.5 block text-xs font-semibold text-muted">Who can join</label>
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVisibility('public')}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${visibility === 'public' ? 'border-brand bg-brand-50 text-brand' : 'border-line text-ink'}`}
          >
            Anyone
          </button>
          <button
            type="button"
            onClick={() => setVisibility('invite_only')}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${visibility === 'invite_only' ? 'border-brand bg-brand-50 text-brand' : 'border-line text-ink'}`}
          >
            Just my connections
          </button>
        </div>

        {visibility === 'invite_only' && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-semibold text-muted">
              Invite from your connections ({inviteeIds.size} selected)
            </label>
            {connections.length === 0 ? (
              <p className="rounded-lg bg-gray-50 px-3 py-4 text-center text-xs text-muted">
                You have no connections yet to invite.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-line">
                {connections.map((u) => (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-2 last:border-b-0 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={inviteeIds.has(u.id)}
                      onChange={() => toggleInvitee(u.id)}
                      className="h-4 w-4 shrink-0 accent-brand"
                    />
                    <Avatar name={u.name} src={u.photo} size={28} />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{u.name}</span>
                    {/* Names repeat across an alumni network — the role is
                        what tells two of the same name apart. */}
                    {roleLine(u) && (
                      <span className="max-w-[45%] shrink-0 truncate text-right text-[11px] text-muted">
                        {roleLine(u)}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="mb-1 block text-xs font-semibold text-muted">Meeting link (optional)</label>
        <input
          value={meetingLink}
          onChange={(e) => setMeetingLink(e.target.value)}
          placeholder="https://meet.google.com/…"
          className="mb-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <label className="mb-1.5 block text-xs font-semibold text-muted">Pricing</label>
        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaid(false)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${!paid ? 'border-brand bg-brand-50 text-brand' : 'border-line text-ink'}`}
          >
            Free
          </button>
          <button
            type="button"
            onClick={() => setPaid(true)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${paid ? 'border-brand bg-brand-50 text-brand' : 'border-line text-ink'}`}
          >
            Paid
          </button>
          {paid && (
            <span className="flex items-center gap-1.5">
              <span className="text-sm text-muted">₹</span>
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-24 rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-brand"
              />
              <span className="text-xs text-muted">/seat</span>
            </span>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={submit}>Schedule session</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
