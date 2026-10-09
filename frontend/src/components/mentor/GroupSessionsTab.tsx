import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Calendar, Check, Clock, Crown, Lock, Pencil, Plus, Repeat, TriangleAlert, Users, Video, X } from 'lucide-react'
import { isHttpUrl } from '../../lib/links'
import { Avatar, Button, Card } from '../ui'
import { api, isPaymentRequired } from '../../lib/api'
import { roleLine } from '../../lib/format'
import { useApp } from '../../store/AppStore'
import { CompleteSessionModal } from './CompleteSessionModal'
import { SubscriptionPlans } from '../subscription/SubscriptionPlans'
import type { GroupSession, GroupSessionAttendee } from '../../types'
import { SkeletonRows } from '../ui/Skeleton'
import { EmptyState } from '../ui/EmptyState'
import { istDayKey, matchesQuery, parseTags } from '../../lib/agenda'
import { DateTile } from './AgendaParts'
import { publishGroupSessions } from './groupSessionsBus'
import { IconAction } from './IconAction'
import { useFocusId } from '../../hooks/useMentorshipFocus'
import { SearchBox } from './SearchBox'
import { DomainPicker } from './DomainPicker'
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
type HostFilter = 'scheduled' | 'completed' | 'cancelled' | 'all'
type AttendFilter = 'upcoming' | 'invited' | 'completed' | 'cancelled' | 'all'
const ATTEND_FILTERS: { id: AttendFilter; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'invited', label: 'Invited' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
]
function attendKind(g: GroupSession): AttendFilter | null {
  if (g.status === 'cancelled') return 'cancelled'
  if (g.joinedByMe) return g.status === 'completed' ? 'completed' : 'upcoming'
  return g.status === 'scheduled' ? 'invited' : null // an invite that lapsed — only under All
}
const HOST_FILTERS: { id: HostFilter; label: string }[] = [
  { id: 'scheduled', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'all', label: 'All' },
]

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
  const [editFor, setEditFor] = useState<GroupSession | null>(null)
  const [query, setQuery] = useState('')
  const [hostFilter, setHostFilter] = useState<HostFilter>('scheduled')
  // null = pick the first tab that has something in it, so invites aren't missed.
  const [attendPick, setAttendPick] = useState<AttendFilter | null>(null)

  function reload() {
    Promise.all([api.getGroupSessions(), api.getMyGroupSessions()])
      .then(([o, m]) => {
        setOpen(o)
        setMine(m)
        // The Mentorship sidebar shows the same lists; hand them over.
        publishGroupSessions({ open: o, mine: m })
      })
      .catch(() => notify('Could not load group sessions.', 'error'))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [notify])

  // One search across Hosting, Attending and Discover: topic, mentor, skill or description.
  const hit = (g: GroupSession) => matchesQuery([g.topic, g.mentorName, g.domain, g.description], query)
  const searching = query.trim().length > 0
  const hostingAll = mine.filter((g) => g.mentorId === currentUser.id)
  const hosting = hostingAll.filter(hit)
  // Filter chips, like My Sessions → History: upcoming soonest first,
  // everything else most recent first.
  const hostCount = (f: HostFilter) => (f === 'all' ? hosting.length : hosting.filter((g) => g.status === f).length)
  const hostingShown = hosting
    .filter((g) => hostFilter === 'all' || g.status === hostFilter)
    .sort((a, b) =>
      hostFilter === 'scheduled'
        ? Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)
        : Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt),
    )
  // An invite_only session I haven't joined yet: this is how it's found at
  // all, since it's deliberately excluded from the public "Discover sessions"
  // list below.
  const invited = mine.filter((g) => g.mentorId !== currentUser.id && g.invitedByMe && !g.joinedByMe)
  const joined = mine.filter((g) => g.mentorId !== currentUser.id && g.joinedByMe)
  const attendingAll = [...invited, ...joined]
  const attending = attendingAll.filter(hit)
  const attendCount = (f: AttendFilter) => (f === 'all' ? attending.length : attending.filter((g) => attendKind(g) === f).length)
  const attendFilter: AttendFilter =
    attendPick ?? ((['upcoming', 'invited', 'completed'] as const).find((f) => attendCount(f) > 0) ?? 'upcoming')
  const attendingShown = attending
    .filter((g) => attendFilter === 'all' || attendKind(g) === attendFilter)
    .sort((a, b) =>
      attendFilter === 'upcoming' || attendFilter === 'invited'
        ? Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)
        : Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt),
    )
  // Don't repeat a session the member already sees in "mine".
  const mineIds = new Set(mine.map((g) => g.id))
  const browsableAll = open.filter((g) => !mineIds.has(g.id))
  const browsable = browsableAll.filter(hit)
  const hasAny = hostingAll.length > 0 || attendingAll.length > 0 || browsableAll.length > 0
  // A calendar click points at a row: clear the search and open whichever
  // filter chip would hide it. Re-runs once the lists have loaded.
  const focusId = useFocusId()
  useEffect(() => {
    if (!focusId) return
    setQuery('')
    const hosted = hostingAll.find((g) => g.id === focusId)
    if (hosted && hosted.status !== 'scheduled') setHostFilter('all')
    if (attendingAll.some((g) => g.id === focusId)) setAttendPick('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, mine])
  // The sidebar's "Discover by topic" links here with ?domain=…
  const [params, setParams] = useSearchParams()
  const domainFilter = params.get('domain') ?? ''
  const shown = domainFilter ? browsable.filter((g) => parseTags(g.domain).includes(domainFilter)) : browsable
  const clearDomain = () =>
    setParams((prev) => { const p = new URLSearchParams(prev); p.delete('domain'); return p }, { replace: true })

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
      {/* One bar: search the lists below, and (for mentors) host a new one. */}
      {(currentUser.isMentor || hasAny) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-sm">
          {hasAny && (
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Search by topic, mentor or skill"
              label="Search group sessions"
              className="min-w-0 flex-1 basis-56 !border-0 !shadow-none"
            />
          )}
          {currentUser.isMentor && (
            <Button
              className={`w-full whitespace-nowrap sm:w-auto ${hasAny ? '' : 'sm:ml-auto'}`}
              icon={<Plus size={15} />}
              title="Host one session — many mentees join, up to the capacity you set"
              onClick={() => setShowCreate(true)}
            >
              Host a group session
            </Button>
          )}
        </div>
      )}

      {hostingAll.length > 0 && (
        <Card className="overflow-hidden">
          <SectionHead title="You're hosting" count={hosting.length} note="Sessions you run as the mentor" />
          <FilterChips options={HOST_FILTERS} value={hostFilter} count={hostCount} onChange={setHostFilter} />
          {hostingShown.length === 0 && (
            <p className="border-t border-line px-5 py-4 text-sm text-muted">
              {searching ? 'No hosted sessions match.' : hostFilter === 'scheduled' ? 'Nothing scheduled right now.' : 'Nothing here.'}
            </p>
          )}
          <div className="divide-y divide-line border-t border-line">
            {hostingShown.map((g) => (
              <HostRow
                key={g.id}
                session={g}
                onViewRoster={() => setRosterFor(g)}
                onComplete={() => setCompleting(g)}
                onCancel={() => cancel(g)}
                onRepeat={() => setRepeating(g)}
                onEdit={() => setEditFor(g)}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Everything this member takes part in, filtered like You're hosting. */}
      {attendingAll.length > 0 && (
        <Card className="overflow-hidden">
          <SectionHead title="You're attending" count={attending.length} note="Sessions you joined or were invited to" />
          <FilterChips options={ATTEND_FILTERS} value={attendFilter} count={attendCount} onChange={setAttendPick} />
          {attendingShown.length === 0 && (
            <p className="border-t border-line px-5 py-4 text-sm text-muted">{searching ? 'No sessions you attend match.' : 'Nothing here.'}</p>
          )}
          <div className="divide-y divide-line border-t border-line">
            {attendingShown.map((g) =>
              // Only a live, unanswered invite can be accepted; everything else
              // (joined, cancelled, or an invite that lapsed) is a status row.
              g.status === 'scheduled' && !g.joinedByMe ? (
                <BrowseRow key={g.id} session={g} onJoin={() => join(g)} />
              ) : (
                <JoinedRow key={g.id} session={g} onLeave={() => leave(g)} onConfirm={() => confirm(g)} />
              ),
            )}
          </div>
        </Card>
      )}

      <section>
        {browsableAll.length === 0 ? (
          <>
            <h2 className="mb-3 text-base font-bold text-ink">Discover sessions</h2>
            <EmptyState
              icon={<UsersRound size={28} />}
              title="No new sessions to discover right now"
              body="Mentors post them here. Meanwhile you can book a one-to-one session."
              action={{ label: 'Find a mentor', to: '/network/mentors' }}
            />
          </>
        ) : (
          <Card className="overflow-hidden">
            <SectionHead
              title="Discover sessions"
              count={shown.length}
              note={
                domainFilter ? (
                  <span className="flex items-center gap-1.5">
                    Showing <b className="text-ink">{domainFilter}</b>
                    <button onClick={clearDomain} className="font-semibold text-brand hover:underline">Clear</button>
                  </span>
                ) : "Public sessions from other mentors you haven't joined"
              }
            />
            {shown.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted">
                {searching ? 'No sessions to discover match your search.' : `No sessions to discover in ${domainFilter} right now.`}
              </p>
            ) : (
              <div className="divide-y divide-line">
                {shown.map((g) => (
                  <BrowseRow key={g.id} session={g} onJoin={() => join(g)} />
                ))}
              </div>
            )}
          </Card>
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
          // The host already chose its skills; don't offer a picker that can't change them.
          hideDomain={!!completing.domain}
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
      {editFor && (
        <EditGroupSessionModal
          session={editFor}
          onClose={() => setEditFor(null)}
          onSaved={() => { setEditFor(null); reload() }}
        />
      )}
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
  // IST, like the date tile beside it — otherwise a late-night session can show
  // one day on the tile and another in the text.
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
    // Newer ICU data spells September "Sept"; everywhere else says "Sep".
    .replace('Sept', 'Sep')
}

/** Time only — the row's date tile already says which day. */
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).toUpperCase()
}

/** The filter chips used by You're hosting and You're attending. */
function FilterChips<T extends string>({ options, value, count, onChange }: {
  options: { id: T; label: string }[]; value: T; count: (id: T) => number; onChange: (id: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 px-5 pb-3">
      {options.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          aria-pressed={value === f.id}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            value === f.id ? 'bg-brand text-white' : 'border border-line bg-surface text-muted hover:text-ink'
          }`}
        >
          {f.label} <span className="opacity-60">{count(f.id)}</span>
        </button>
      ))}
    </div>
  )
}

function SectionHead({ title, count, note }: { title: string; count: number; note?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-2">
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        {title}
        <span className="rounded-full bg-gray-100 px-2 py-px text-[11px] font-bold text-muted">{count}</span>
      </h2>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  )
}

/** An open or invited session: everything needed to decide, and Join. */
function BrowseRow({ session, onJoin }: { session: GroupSession; onJoin: () => void }) {
  const full = session.seatsLeft === 0
  return (
    <div id={`row-${session.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <DateTile dayKey={istDayKey(session.scheduledAt)} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
          <span className="truncate">{session.topic}</span>
          {session.visibility === 'invite_only' && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-amethyst-100 px-2 py-0.5 text-[11px] font-semibold text-amethyst-700">
              <Lock size={10} /> Invited
            </span>
          )}
          {parseTags(session.domain).slice(0, 3).map((t) => (
            <span key={t} className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand">{t}</span>
          ))}
          {parseTags(session.domain).length > 3 && (
            <span className="shrink-0 text-[11px] font-semibold text-muted" title={parseTags(session.domain).slice(3).join(', ')}>
              +{parseTags(session.domain).length - 3}
            </span>
          )}
        </p>
        {session.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{session.description}</p>}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
          <span>by {session.mentorName}</span>
          <span className="flex items-center gap-1"><Calendar size={11} /> {timeOf(session.scheduledAt)}</span>
          <span className="flex items-center gap-1"><Clock size={11} /> {session.durationMinutes} min</span>
          <span className="flex items-center gap-1">
            <Users size={11} /> {full ? 'Full' : `${session.seatsLeft} of ${session.capacity} seats left`}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-right text-sm font-bold text-ink">
          {session.pricingMode === 'paid' ? (
            <>₹{session.pricePerSeat.toLocaleString('en-IN')}<span className="block text-[10px] font-normal text-muted">per seat</span></>
          ) : 'Free'}
        </span>
        <Button variant="social" className="!px-3 !py-1.5 !text-xs" disabled={full} onClick={onJoin}>
          {/* "Join" also meant "join the call" — say what this one does. */}
          {full ? 'Full' : session.visibility === 'invite_only' ? 'Accept invite' : 'Reserve seat'}
        </Button>
      </div>
    </div>
  )
}

function JoinedRow({
  session, onLeave, onConfirm,
}: { session: GroupSession; onLeave: () => void; onConfirm: () => void }) {
  return (
    <div id={`row-${session.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <DateTile dayKey={istDayKey(session.scheduledAt)} dim={session.status !== 'scheduled'} />
      <Avatar name={session.mentorName} src={session.mentorPhoto} size={32} to={`/profile/${session.mentorId}`} />
      <div className={`min-w-0 flex-1 basis-48 ${session.status === 'cancelled' ? 'opacity-60' : ''}`}>
        <p className="truncate text-sm font-semibold text-ink">{session.topic}</p>
        <p className="text-xs text-muted">
          with {session.mentorName} · {fmt(session.scheduledAt)} · {session.durationMinutes} min
        </p>
      </div>
      {session.status === 'cancelled' ? (
        // It isn't happening — no Join call or Leave to click.
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-muted">Cancelled by host</span>
      ) : !session.joinedByMe ? (
        // Invited, never accepted, and it has now happened.
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-muted">Invite expired</span>
      ) : session.status === 'completed' ? (
        session.confirmedByMe ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-jade-100 px-2.5 py-0.5 text-[11px] font-semibold text-jade-700">
            <Check size={11} /> Attendance confirmed
          </span>
        ) : (
          <Button className="!px-3 !py-1.5 !text-xs" icon={<Check size={12} />} onClick={onConfirm}>
            Confirm attendance
          </Button>
        )
      ) : (
        <>
          {session.meetingLink ? (
            <a
              href={session.meetingLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full bg-ocean-50 px-3 py-1.5 text-xs font-semibold text-ocean-700 hover:bg-ocean-100"
            >
              <Video size={12} /> Join call
            </a>
          ) : (
            // Before, nothing showed — it looked as if the link was hidden.
            <span className="text-xs text-muted" title="The host hasn't added the meeting link yet">Link coming soon</span>
          )}
          <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" onClick={onLeave}>
            Leave
          </Button>
        </>
      )}
    </div>
  )
}

function HostRow({
  session, onViewRoster, onComplete, onCancel, onRepeat, onEdit,
}: {
  session: GroupSession
  onViewRoster: () => void
  onComplete: () => void
  onCancel: () => void
  onRepeat: () => void
  onEdit: () => void
}) {
  const live = session.status === 'scheduled'
  const pct = Math.round((session.attendeeCount / Math.max(session.capacity, 1)) * 100)
  return (
    <div id={`row-${session.id}`} className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${session.status === 'cancelled' ? 'opacity-60' : ''}`}>
      <DateTile dayKey={istDayKey(session.scheduledAt)} dim={session.status !== 'scheduled'} />
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <span className="truncate">{session.topic}</span>
          {session.visibility === 'invite_only' && <Lock size={12} className="shrink-0 text-amethyst-600" />}
          <span
            className={`shrink-0 rounded-full px-2 py-px text-[11px] font-semibold capitalize ${
              session.status === 'completed'
                ? 'bg-jade-100 text-jade-700'
                : session.status === 'cancelled'
                  ? 'bg-gray-100 text-muted'
                  : 'bg-brand-100 text-brand'
            }`}
          >
            {session.status}
          </span>
        </p>
        <p className="text-xs text-muted">{fmt(session.scheduledAt)}</p>
        {/* How full it is, at a glance. */}
        <div className="mt-1.5 flex max-w-[240px] items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] text-muted">{session.attendeeCount} of {session.capacity} joined</span>
        </div>
        {/* Without a link nobody can get into the call — say so, and fix it here. */}
        {live && !session.meetingLink && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1 text-xs font-semibold text-marigold-800">
            <TriangleAlert size={12} /> No meeting link yet — attendees can't join.
            <button onClick={onEdit} className="underline hover:text-ink">Add link</button>
          </p>
        )}
      </div>
      {/* On phones the actions take their own line, lined up under the title. */}
      <div className="flex shrink-0 basis-full items-center gap-1.5 pl-[60px] sm:basis-auto sm:pl-0">
        {live && session.meetingLink && (
          <a
            href={session.meetingLink}
            target="_blank"
            rel="noreferrer"
            aria-label="Join call"
            title="Start or join the call"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-ocean-50 text-ocean-700 hover:bg-ocean-100"
          >
            <Video size={14} />
          </a>
        )}
        {live && (
          <IconAction label="Edit" tip="Edit topic, time, capacity or meeting link" onClick={onEdit}>
            <Pencil size={14} />
          </IconAction>
        )}
        {/* Was "Roster" — jargon; this is simply who has joined. */}
        <IconAction label="Attendees" tip="See who has joined" onClick={onViewRoster}>
          <Users size={14} />
        </IconAction>
        {session.status === 'scheduled' ? (
          <>
            <IconAction label="Mark completed" tip="Mark this session completed" onClick={onComplete}>
              <Check size={15} />
            </IconAction>
            <IconAction label="Cancel" tip="Cancel this session (everyone who joined is told)" tone="muted" onClick={onCancel}>
              <X size={15} />
            </IconAction>
          </>
        ) : (
          session.attendeeCount > 0 && (
            <IconAction label="Repeat with same group" tip="Schedule it again with the same group" onClick={onRepeat}>
              <Repeat size={14} />
            </IconAction>
          )
        )}
      </div>
    </div>
  )
}

/** Host edits a scheduled session — same fields and rules as creating one,
 *  minus pricing and who can join (people may have joined on those terms). */
function EditGroupSessionModal({ session, onClose, onSaved }: { session: GroupSession; onClose: () => void; onSaved: () => void }) {
  const { notify } = useApp()
  const start = new Date(session.scheduledAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const [topic, setTopic] = useState(session.topic)
  const [description, setDescription] = useState(session.description ?? '')
  const [date, setDate] = useState(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`)
  const [time, setTime] = useState(`${pad(start.getHours())}:${pad(start.getMinutes())}`)
  const [duration, setDuration] = useState(session.durationMinutes)
  const [capacity, setCapacity] = useState(session.capacity)
  const [domain, setDomain] = useState(session.domain ?? '')
  const [link, setLink] = useState(session.meetingLink ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const field = 'w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand'
  const label = 'mb-1 block text-xs font-semibold text-muted'

  async function save() {
    if (!topic.trim()) return setError('Add a topic.')
    const when = new Date(`${date}T${time}`)
    if (Number.isNaN(when.getTime())) return setError('Pick a valid date and time.')
    // Only a changed time must be in the future — an under-way session can still get its link fixed.
    const timeChanged = Math.abs(when.getTime() - Date.parse(session.scheduledAt)) >= 60_000
    if (timeChanged && when.getTime() < Date.now()) return setError('Pick a time in the future.')
    if (capacity < session.attendeeCount) {
      return setError(`${session.attendeeCount} already joined — capacity can't be lower than that.`)
    }
    if (!isHttpUrl(link.trim())) return setError('Add the meeting link, starting with https://')
    setSaving(true)
    try {
      await api.editGroupSession(session.id, {
        topic: topic.trim(), description: description.trim(), domain,
        scheduledAt: when.toISOString(), durationMinutes: duration, capacity, meetingLink: link.trim(),
      })
      notify(session.attendeeCount ? 'Saved — everyone who joined has been told.' : 'Saved.', 'success')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the changes.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Edit group session</h2>
            <p className="text-sm text-muted">
              {session.attendeeCount ? `${session.attendeeCount} joined — they'll be told about the changes.` : 'No one has joined yet.'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <label className={label}>Topic</label>
        <input value={topic} onChange={(e) => { setTopic(e.target.value); setError('') }} maxLength={140} aria-label="Topic" className={`mb-3 ${field}`} />
        <label className={label}>What will you cover? (optional)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={1000} aria-label="Description" className={`mb-3 resize-none ${field}`} />
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Date</label>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setError('') }} aria-label="Date" className={field} />
          </div>
          <div>
            <label className={label}>Time</label>
            <input type="time" value={time} onChange={(e) => { setTime(e.target.value); setError('') }} aria-label="Time" className={field} />
          </div>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Duration (min)</label>
            <input type="number" min={15} max={480} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 60)} aria-label="Duration" className={field} />
          </div>
          <div>
            <label className={label}>Capacity</label>
            <input type="number" min={Math.max(2, session.attendeeCount)} max={500} value={capacity} onChange={(e) => { setCapacity(Number(e.target.value) || 2); setError('') }} aria-label="Capacity" className={field} />
          </div>
        </div>
        <label className="mb-1.5 block text-xs font-semibold text-muted">Domains / skills</label>
        <div className="mb-3"><DomainPicker value={domain} onChange={setDomain} /></div>
        <label className={label}>Meeting link <span className="text-red-500">*</span></label>
        <input
          value={link}
          onChange={(e) => { setLink(e.target.value); setError('') }}
          placeholder="https://meet.google.com/…"
          aria-label="Meeting link"
          className={field}
        />
        {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
        <p className="mt-2 text-xs text-muted">Pricing and who can join stay as they were set.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={() => void save()}>Save changes</Button>
        </div>
      </div>
    </div>,
    document.body,
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
            <h2 className="text-lg font-bold text-ink">Attendees</h2>
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
                <span className="min-w-0 flex-1 basis-48">
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
}: { session: GroupSession; onClose: () => void; onRepeat: (scheduledAt: string, meetingLink: string) => void }) {
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  // Pre-filled with last time's link; required, so attendees can always join.
  const [meetingLink, setMeetingLink] = useState(session.meetingLink ?? '')
  const [linkError, setLinkError] = useState('')
  const [saving, setSaving] = useState(false)
  const field = 'w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand'

  async function submit() {
    if (!date || !time) return
    const scheduledAt = new Date(`${date}T${time}`)
    if (Number.isNaN(scheduledAt.getTime())) return
    if (!isHttpUrl(meetingLink.trim())) return setLinkError('Add the meeting link, starting with https://')
    setSaving(true)
    await onRepeat(scheduledAt.toISOString(), meetingLink.trim())
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
<label className="mb-1 block text-xs font-semibold text-muted">Meeting link <span className="text-red-500">*</span></label>
        <input
          value={meetingLink}
          onChange={(e) => { setMeetingLink(e.target.value); setLinkError('') }}
          placeholder="https://meet.google.com/…"
          aria-label="Meeting link"
          className={field}
        />
        {linkError && <p className="mt-1.5 text-xs font-semibold text-red-600">{linkError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={!date || !time || !meetingLink.trim()} onClick={submit}>Schedule</Button>
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
    // Without a link nobody can get into the call, so it's required.
    if (!isHttpUrl(meetingLink.trim())) {
      notify('Add a meeting link (starting with https://) so attendees can join.', 'error')
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
        meetingLink: meetingLink.trim(),
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

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Duration (min)</label>
            <input type="number" min={15} max={480} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 60)} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Capacity</label>
            <input type="number" min={2} max={500} value={capacity} onChange={(e) => setCapacity(Number(e.target.value) || 10)} className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
        </div>
        <label className="mb-1.5 block text-xs font-semibold text-muted">Domains / skills</label>
        <div className="mb-3"><DomainPicker value={domain} onChange={setDomain} /></div>

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
                    <span className="min-w-0 flex-1 basis-48 truncate text-sm text-ink">{u.name}</span>
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

<label className="mb-1 block text-xs font-semibold text-muted">Meeting link <span className="text-red-500">*</span></label>
        <input
          value={meetingLink}
          onChange={(e) => setMeetingLink(e.target.value)}
          placeholder="https://meet.google.com/…"
          aria-label="Meeting link"
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
