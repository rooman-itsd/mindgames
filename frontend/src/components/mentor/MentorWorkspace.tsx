import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  Award, BookOpen, Check, CheckCircle2, ChevronDown, Clock, Crown, Flame, GraduationCap, Lock, Pencil,
  Map as MapIcon, Plus, Star, Users, Wrench, X,
} from 'lucide-react'
import { Avatar, Button, Card } from '../ui'
import { byWhen, dayHeading, matchesQuery, newestFirst, sessionDayKey } from '../../lib/agenda'
import { DateTile, Dot, Timeline, TimelineItem } from './AgendaParts'
import { MentorBadgeChips } from './MentorBadgeChips'
import { IconAction } from './IconAction'
import { useFocusId } from '../../hooks/useMentorshipFocus'
import { SearchBox } from './SearchBox'
import { MANAGE_SERVICES_EVENT, publishMentorStats } from './mentorSpaceBus'
import { api } from '../../lib/api'
import { roleLine, sessionLabels } from '../../lib/format'
import { isHttpUrl } from '../../lib/links'
import { useApp } from '../../store/AppStore'
import { ManageServicesPanel } from '../career/ManageServicesPanel'
import { MenteeRoadmapModal } from './MenteeRoadmapModal'
import { AssignResourceModal } from './AssignResourceModal'
import { SubscriptionPlans } from '../subscription/SubscriptionPlans'
import type { Mentee, MentorshipSession, ProfileStats } from '../../types'

/** How many rows Past and My mentees show before "Show all". */
const PAST_PREVIEW = 5
const MENTEES_PREVIEW = 4

/**
 * Everything a mentor needs in one place: who is waiting, who they are
 * helping, what those people are working towards, what they offer, and how
 * they are doing.
 *
 * Locked until an admin approves the mentor application. The locked state is
 * deliberately visible rather than hidden — someone who could mentor should
 * be able to discover that this exists and how to get in.
 */
export function MentorWorkspace({
  requests,
  upcoming,
  finished,
  onAccept,
  onDecline,
  onComplete,
  onEdit,
  onResources,
}: {
  requests: MentorshipSession[]
  upcoming: MentorshipSession[]
  /** Sessions this mentor completed or declined — their side of "My
   *  Sessions → Past", which only shows the mentee's own history. */
  finished: MentorshipSession[]
  onAccept: (id: string) => void
  onDecline: (id: string) => void
  onComplete: (session: MentorshipSession) => void
  onEdit: (session: MentorshipSession) => void
  /** Open the shared-resources modal for this session. Optional so the
   *  workspace still renders anywhere it is not wired up. */
  onResources?: (session: MentorshipSession) => void
}) {
  const { currentUser, subscription } = useApp()
  const [mentees, setMentees] = useState<Mentee[]>([])
  const [stats, setStats] = useState<ProfileStats | null>(null)
  const [roadmapFor, setRoadmapFor] = useState<string | null>(null)
  const [assignTo, setAssignTo] = useState<{ id: string; name: string } | null>(null)
  const [showServices, setShowServices] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const [showOfferSession, setShowOfferSession] = useState(false)
  // Long lists show a preview; the rest is one click away.
  const [showAllPast, setShowAllPast] = useState(false)
  const [showAllMentees, setShowAllMentees] = useState(false)
  const [query, setQuery] = useState('')
  // A calendar click points at a row here: clear the search, and open "Show
  // all" if the row is past the preview.
  const focusId = useFocusId()
  useEffect(() => {
    if (!focusId) return
    setQuery('')
    if (newestFirst(finished).findIndex((s) => s.id === focusId) >= PAST_PREVIEW) setShowAllPast(true)
  }, [focusId, finished])

  const isMentor = currentUser.isMentor

  useEffect(() => {
    if (!isMentor) return
    api.getMentees().then(setMentees, () => {})
    api.getProfileStats(currentUser.id).then(
      (s) => {
        setStats(s)
        // The sidebar's Badges card shows the same stats.
        publishMentorStats(s)
      },
      () => {},
    )
  }, [isMentor, currentUser.id])

  // "Manage services" in the sidebar opens the panel here, where it has room.
  useEffect(() => {
    const open = () => setShowServices(true)
    window.addEventListener(MANAGE_SERVICES_EVENT, open)
    return () => window.removeEventListener(MANAGE_SERVICES_EVENT, open)
  }, [])

  if (!isMentor) return <LockedState />

  // The banner below renders `blockedReason`, so it should appear exactly
  // when there IS one — i.e. when the mentor cannot currently accept.
  // Deriving it from status instead meant two wrong answers: a mentor who
  // cancelled but still has paid days got a false "you need a subscription"
  // alarm, and a mentor who had used up the month's session cap got no
  // warning at all despite being blocked.
  const canAccept = subscription?.canAcceptSessions ?? false
  // Requests and confirmed sessions share one timeline, soonest first.
  // One search for the agenda, Past and My mentees: topic, mentee or date.
  const hit = (s: MentorshipSession) => matchesQuery([s.topic, s.menteeName, s.date], query)
  const agenda = byWhen([...requests, ...upcoming].filter(hit))
  const past = newestFirst(finished.filter(hit))
  const menteesShown = mentees.filter((m) => matchesQuery([m.name, m.designation, m.company, m.goal?.targetRole], query))
  const searching = query.trim().length > 0

  return (
    <div className="flex flex-col gap-4">
      {/* Plan banner: the one thing that stops everything else working. */}
      {!canAccept && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Crown size={18} className="shrink-0 text-amber-600" />
          <p className="flex-1 text-sm text-amber-900">
            <strong>{subscription?.blockedReason ?? 'You need a subscription to accept sessions.'}</strong>
          </p>
          <Button className="!py-1.5" icon={<Crown size={14} />} onClick={() => setShowPlans(true)}>
            See plans
          </Button>
        </div>
      )}

      {/* At a glance, plus offering a 1:1 session rather than only ever waiting
          for someone to request one. Restricted to connections, and they
          accept or decline it the same way a mentor accepts a request today. */}
      <Card className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <Stat icon={<GraduationCap size={13} />} label="Sessions given" value={stats?.sessionsGiven ?? 0} />
          <Stat icon={<Clock size={13} />} label="Hours mentored" value={stats?.hoursGiven ?? 0} />
          <Stat
            icon={<Star size={13} />}
            label="Rating"
            value={stats?.avgRating ? `${stats.avgRating}★` : '—'}
            sub={stats?.ratingCount ? `${stats.ratingCount} rated` : 'no ratings yet'}
          />
          <Stat
            icon={<Flame size={13} />}
            label="Streak"
            value={stats?.mentorStreakWeeks ?? 0}
            sub={stats?.mentorStreakWeeks === 1 ? 'week' : 'weeks'}
          />
        </div>
      </Card>

      {/* One bar: search the lists below, and offer a new 1:1 session. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-sm">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search by topic, mentee or date"
          label="Search mentor space"
          className="min-w-0 flex-1 basis-56 !border-0 !shadow-none"
        />
        <Button
          className="w-full whitespace-nowrap sm:w-auto"
          icon={<Plus size={15} />}
          title="Offer one of your connections a 1:1 session instead of waiting to be asked"
          onClick={() => setShowOfferSession(true)}
        >
          Host a session
        </Button>
      </div>

      {/* Requests waiting on this mentor and confirmed sessions on one
          timeline, in date order — whatever is next is always at the top. */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            Your agenda
            {requests.length > 0 && (
              <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">
                {requests.length} {requests.length === 1 ? 'request' : 'requests'}
              </span>
            )}
          </h2>
          <span className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1"><Dot kind="waiting" /> needs a reply</span>
            <span className="flex items-center gap-1"><Dot kind="confirmed" /> confirmed</span>
          </span>
        </div>
        {agenda.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
            {searching ? 'No sessions match.' : 'No one is waiting on you right now.'}
          </p>
        ) : (
          <Timeline>
            {agenda.map((s) => {
              const isRequest = s.status === 'requested'
              const day = sessionDayKey(s)
              return (
                <TimelineItem key={s.id} kind={isRequest ? 'waiting' : 'confirmed'}>
                  <Card id={`row-${s.id}`} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-bold text-ink">{day ? dayHeading(day) : s.date}</p>
                      <p className="text-[11px] text-muted">{s.time}</p>
                    </div>
                    <Avatar name={s.menteeName} size={38} to={`/profile/${s.menteeId}`} />
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate text-sm font-semibold text-ink">{s.topic}</p>
                      <p className="text-xs text-muted">
                        {s.menteeName}
                        {isRequest && (s.requestedBy === 'mentor' ? ' · you offered this' : ' · requested')}
                        {isRequest && s.isPaid && (s.price ?? 0) > 0 && (
                          <span className="font-semibold text-brand"> · ₹{(s.price ?? 0).toLocaleString('en-IN')}</span>
                        )}
                      </p>
                    </div>
                    {isRequest ? (
                      /* A slot this mentor offered is waiting on the other side —
                         accepting it here would confirm a session they never
                         agreed to, so it only offers a way to take it back. */
                      s.requestedBy === 'mentor' ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-marigold-100 px-2.5 py-0.5 text-[11px] font-semibold text-marigold-800">
                            Waiting on them
                          </span>
                          <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" onClick={() => onDecline(s.id)}>
                            Withdraw
                          </Button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 gap-2">
                          <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" onClick={() => onDecline(s.id)}>
                            Decline
                          </Button>
                          <Button className="!px-3 !py-1.5 !text-xs" onClick={() => onAccept(s.id)}>
                            Accept
                          </Button>
                        </div>
                      )
                    ) : (
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {s.meetingLink ? (
                          <a
                            href={s.meetingLink}
                            target="_blank"
                            rel="noreferrer"
                            title="Join the meeting"
                            className="rounded-full bg-ocean-50 px-3 py-1.5 text-xs font-semibold text-ocean-700 hover:bg-ocean-100"
                          >
                            Join
                          </a>
                        ) : (
                          <span title="Add a meeting link with Edit" className="px-1 text-xs text-muted">
                            No link
                          </span>
                        )}
                        {/* One editor for topic, time and the meeting link — the
                            separate link shortcut was a second door to the same
                            field. */}
                        <IconAction label="Edit" tip="Edit topic, time or meeting link" onClick={() => onEdit(s)}>
                          <Pencil size={14} />
                        </IconAction>
                        {onResources && (
                          <IconAction
                            label={s.resourceCount ? `Resources · ${s.resourceCount}` : 'Resources'}
                            tip="Prep resources for this session"
                            count={s.resourceCount}
                            onClick={() => onResources(s)}
                          >
                            <BookOpen size={14} />
                          </IconAction>
                        )}
                        <IconAction label="Complete" tip="Mark this session completed" onClick={() => onComplete(s)}>
                          <Check size={15} />
                        </IconAction>
                      </div>
                    )}
                  </Card>
                </TimelineItem>
              )
            })}
          </Timeline>
        )}
      </section>

      {/* Completed or declined — this mentor's own record, since "My
          Sessions → Past" only shows the mentee side of the history. */}
      {finished.length > 0 && (
        <Card className="overflow-hidden">
          <h2 className="flex items-center gap-2 px-5 pt-4 pb-2 text-base font-bold text-ink">
            <GraduationCap size={16} className="text-muted" />
            Past
            <span className="rounded-full bg-gray-100 px-2 py-px text-[11px] font-bold text-muted">{past.length}</span>
          </h2>
          {past.length === 0 && <p className="px-5 pb-4 text-sm text-muted">No past sessions match.</p>}
          <div className="divide-y divide-line">
            {(showAllPast ? past : past.slice(0, PAST_PREVIEW)).map((s) => {
              const declined = s.status === 'declined'
              return (
                <div key={s.id} id={`row-${s.id}`} className="flex items-center gap-3 px-5 py-3">
                  <DateTile dayKey={sessionDayKey(s)} label={s.date} dim />
                  <Avatar name={s.menteeName} size={32} to={`/profile/${s.menteeId}`} />
                  {/* Status reads as part of the description, under the title,
                      so the right edge holds only the one thing to do. */}
                  <div className={`min-w-0 flex-1 basis-48 ${declined ? 'opacity-60' : ''}`}>
                    <p className="truncate text-sm font-semibold text-ink">{s.topic}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span className="mr-0.5">{s.menteeName}</span>
                      {/* Why a completed session isn't in the stats yet: it counts
                          once the mentee confirms too. Neutral grey, not amber —
                          the mentor has nothing to do here, so it isn't a warning.
                          Names who it's waiting on; the hover says why it matters. */}
                      {!declined && s.mentorConfirmed && !s.menteeConfirmed && (
                        <span
                          title={`Counts toward your hours and badges once ${s.menteeName} confirms it happened.`}
                          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-px text-[11px] font-semibold text-gray-600"
                        >
                          <Clock size={10} /> {s.menteeName} to confirm
                        </span>
                      )}
                      {!declined && s.mentorConfirmed && s.menteeConfirmed && (
                        <span
                          title="Both of you confirmed it — it counts toward your record."
                          className="inline-flex items-center gap-1 rounded-full bg-jade-100 px-2 py-px text-[11px] font-semibold text-jade-700"
                        >
                          <CheckCircle2 size={10} /> Confirmed
                        </span>
                      )}
                      {!declined && s.rating && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-marigold-50 px-2 py-px text-[11px] font-semibold text-marigold-800">
                          <Star size={10} className="fill-marigold text-marigold" /> {s.rating}
                        </span>
                      )}
                      {/* Everything under Past is completed, so only the
                          exception gets a badge. */}
                      {declined && (
                        <span className="rounded-full bg-rosewood-50 px-2 py-px text-[11px] font-semibold text-rosewood-700">Declined</span>
                      )}
                    </div>
                  </div>
                  {/* After a session the mentor can still add follow-ups for
                      that mentee, so the button shows even with nothing
                      assigned yet. A declined session never happened. */}
                  {!declined && onResources && (
                    <IconAction
                      label={s.resourceCount ? `Resources · ${s.resourceCount}` : 'Add follow-up'}
                      tip={s.resourceCount ? 'Resources shared for this session' : 'Add a follow-up resource for them'}
                      count={s.resourceCount}
                      onClick={() => onResources(s)}
                    >
                      <BookOpen size={14} />
                    </IconAction>
                  )}
                </div>
              )
            })}
          </div>
          {past.length > PAST_PREVIEW && (
            <ShowAllToggle open={showAllPast} total={past.length} onToggle={() => setShowAllPast((v) => !v)} />
          )}
        </Card>
      )}

      {/* People being helped — compact cards, two to a row. */}
      <Card className="overflow-hidden">
        <h2 className="flex items-center gap-2 px-5 pt-4 pb-2 text-base font-bold text-ink">
          <Users size={16} className="text-brand" />
          My mentees
          {mentees.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-px text-[11px] font-bold text-muted">{menteesShown.length}</span>
          )}
        </h2>
        {mentees.length === 0 ? (
          <p className="mx-5 mb-5 rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-muted">
            Once you accept a session, that member appears here with what they're working towards.
          </p>
        ) : menteesShown.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-muted">No mentees match.</p>
        ) : (
          <div className="grid gap-3 px-5 pt-1 pb-4 sm:grid-cols-2">
            {(showAllMentees ? menteesShown : menteesShown.slice(0, MENTEES_PREVIEW)).map((m) => (
              <div key={m.id} className="flex min-w-0 flex-col rounded-xl border border-line p-3.5 transition-colors hover:border-brand-200">
                <div className="flex items-start gap-3">
                  <Avatar name={m.name} src={m.photo} size={40} to={`/profile/${m.id}`} />
                  <div className="min-w-0 flex-1 basis-48">
                    <Link to={`/profile/${m.id}`} className="block truncate text-sm font-bold text-ink hover:underline">{m.name}</Link>
                    {[m.designation, m.company].filter(Boolean).length > 0 && (
                      <p className="truncate text-xs text-muted">{[m.designation, m.company].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-muted">
                    {m.sessions} {m.sessions === 1 ? 'session' : 'sessions'}
                  </span>
                </div>
                {m.goal?.targetRole && (
                  <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted">
                    <MapIcon size={12} className="shrink-0 text-brand" />
                    <span className="truncate">Working towards <strong className="text-ink">{m.goal.targetRole}</strong></span>
                  </p>
                )}
                <div className="mt-auto pt-3">
                  <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
                    {/* Roadmap status reads as text; the actions are icons. */}
                    <span className="truncate text-xs text-muted">{m.hasRoadmap ? 'Roadmap shared' : 'No roadmap yet'}</span>
                    <div className="flex shrink-0 gap-1.5">
                      {m.hasRoadmap && (
                        <IconAction label="View their roadmap" tip="View their career roadmap" onClick={() => setRoadmapFor(m.id)}>
                          <MapIcon size={14} />
                        </IconAction>
                      )}
                      {/* Hand them something to learn without tying it to a session. */}
                      <IconAction label="Assign resource" tip="Assign them something to learn" onClick={() => setAssignTo({ id: m.id, name: m.name })}>
                        <BookOpen size={14} />
                      </IconAction>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {menteesShown.length > MENTEES_PREVIEW && (
          <ShowAllToggle open={showAllMentees} total={menteesShown.length} onToggle={() => setShowAllMentees((v) => !v)} />
        )}
      </Card>

      {/* What they offer + what they've earned. On wide screens these live in
          the Mentorship right sidebar instead; below xl that sidebar is
          hidden, so they stay here and never disappear. */}
      <div className="grid gap-4 lg:grid-cols-2 xl:hidden">
        <Card className="p-5">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-ink">
            <Wrench size={18} className="text-brand" />
            My services
          </h2>
          <p className="mb-3 text-sm text-muted">
            What you offer, and what you charge. Shown to members whose roadmap matches.
          </p>
          <Button variant="outline" onClick={() => setShowServices((v) => !v)}>
            {showServices ? 'Hide services' : 'Manage services'}
          </Button>
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-ink">
            <Award size={18} className="text-brand" />
            Badges
          </h2>
          <MentorBadgeChips stats={stats} />
        </Card>
      </div>

      {showServices && <ManageServicesPanel onClose={() => setShowServices(false)} />}
      {roadmapFor && <MenteeRoadmapModal menteeId={roadmapFor} onClose={() => setRoadmapFor(null)} />}
      {assignTo && (
        <AssignResourceModal menteeId={assignTo.id} menteeName={assignTo.name} onClose={() => setAssignTo(null)} />
      )}
      {showPlans && (
        <SubscriptionPlans reason="You need a subscription to accept sessions" onClose={() => setShowPlans(false)} />
      )}
      {showOfferSession && (
        <OfferSessionModal
          onClose={() => setShowOfferSession(false)}
          onNeedsPlan={() => { setShowOfferSession(false); setShowPlans(true) }}
        />
      )}
    </div>
  )
}

/** Mentor picks a connection and proposes a topic/date/time. The offer lands
 *  in that member's "Requests" for them to accept or decline — the mirror of
 *  a mentee's booking request, not an instantly-scheduled session. */
function OfferSessionModal({ onClose, onNeedsPlan }: { onClose: () => void; onNeedsPlan: () => void }) {
  const { users, currentUser, connectionState, offerSession, notify } = useApp()
  const [menteeId, setMenteeId] = useState('')
  const [topic, setTopic] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [meetingLink, setMeetingLink] = useState('')
  const [resourceLink, setResourceLink] = useState('')
  const [resourceTitle, setResourceTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const connections = users.filter((u) => u.id !== currentUser.id && connectionState(u.id) === 'connected')
  const field = 'mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand'

  async function submit() {
    if (!menteeId) return notify('Pick who the session is for.', 'error')
    if (!topic.trim()) return notify('Add what the session will cover.', 'error')
    if (!date || !time) return notify('Pick a date and time.', 'error')
    if (!meetingLink.trim()) return notify('Add a meeting link so they know where to join.', 'error')
    if (!isHttpUrl(meetingLink.trim())) {
      return notify('The meeting link must be a full link, starting with https://', 'error')
    }
    if (resourceLink.trim() && !isHttpUrl(resourceLink.trim())) {
      return notify('The prep link must be a full link, starting with https://', 'error')
    }
    // Same human-readable labels the booking flow stores, so both kinds of
    // session render identically everywhere they're listed. Derived from the
    // one instant below, so the label and the timestamp cannot disagree.
    const when = new Date(`${date}T${time}`)
    const { dateLabel, timeLabel } = sessionLabels(when)

    setSaving(true)
    // The real timestamp travels alongside the display labels: there is no
    // later mentor-side accept step on an offer to attach one at.
    const result = await offerSession(
      menteeId, topic.trim(), dateLabel, timeLabel,
      meetingLink.trim(),
      when.toISOString(),
      resourceLink.trim() || undefined,
      resourceTitle.trim() || undefined,
    )
    setSaving(false)
    if (result === 'payment-required') return onNeedsPlan()
    // Keep the form open on a genuine failure so the mentor can retry —
    // closing would discard everything they just typed.
    if (result === 'error') return
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Host a session</h2>
            <p className="text-sm text-muted">They'll get it as a request to accept or decline.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <label className="block text-sm font-medium text-ink">Who is it for?</label>
        {connections.length === 0 ? (
          <p className="mt-1 rounded-lg bg-gray-50 px-3 py-4 text-center text-xs text-muted">
            You have no connections yet to offer a session to.
          </p>
        ) : (
          // A plain <select> can only show names, and duplicate names are
          // common in an alumni network — the photo and role are what tell
          // two "Chandana S"s apart.
          <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-line">
            {connections.map((u) => (
              <label
                key={u.id}
                className={`flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-2 last:border-b-0 hover:bg-gray-50 ${
                  menteeId === u.id ? 'bg-brand-50' : ''
                }`}
              >
                <input
                  type="radio"
                  name="offer-mentee"
                  checked={menteeId === u.id}
                  onChange={() => setMenteeId(u.id)}
                  className="h-4 w-4 shrink-0 accent-brand"
                />
                <Avatar name={u.name} src={u.photo} size={30} />
                <span className="min-w-0 flex-1 basis-48 truncate text-sm font-medium text-ink">{u.name}</span>
                {roleLine(u) && (
                  <span className="max-w-[45%] shrink-0 truncate text-right text-[11px] text-muted">
                    {roleLine(u)}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}

        <label className="mt-3 block text-sm font-medium text-ink">What will you cover?</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={2}
          placeholder="e.g. Reviewing your backend roadmap"
          className={`${field} resize-none`}
        />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ink">Date</label>
            <input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
          </div>
        </div>

        <label className="mt-3 block text-sm font-medium text-ink">
          Meeting link <span className="text-red-500">*</span>
        </label>
        <input
          value={meetingLink}
          onChange={(e) => setMeetingLink(e.target.value)}
          placeholder="https://meet.google.com/…"
          className={field}
        />

        <label className="mt-3 block text-sm font-medium text-ink">Prep for them (optional)</label>
        <input
          value={resourceLink}
          onChange={(e) => setResourceLink(e.target.value)}
          placeholder="A link for them to go through before you meet"
          className={field}
        />
        {/* Only once there's a link — a title on its own has nothing to name. */}
        {resourceLink.trim() && (
          <input
            value={resourceTitle}
            onChange={(e) => setResourceTitle(e.target.value)}
            placeholder="What is it? e.g. Read chapter 4 on rate limiters (optional)"
            maxLength={160}
            aria-label="Prep title"
            className={`${field} mt-2`}
          />
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} disabled={connections.length === 0} onClick={submit}>Send offer</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ShowAllToggle({ open, total, onToggle }: { open: boolean; total: number; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center justify-center gap-1 border-t border-line py-2.5 text-xs font-semibold text-brand hover:bg-brand-50"
    >
      {open ? 'Show less' : `Show all ${total}`}
      <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  )
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  sub?: string
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted uppercase">
        <span className="text-brand">{icon}</span>
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold text-ink">
        {value}
        {sub && <span className="ml-1 text-xs font-medium text-muted">{sub}</span>}
      </p>
    </div>
  )
}

/** Shown to anyone who is not an approved mentor. Explains what the space is
 *  and points at the real application, rather than hiding the tab entirely. */
function LockedState() {
  return (
    <Card className="px-6 py-12 text-center">
      <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-gray-100 text-muted">
        <Lock size={26} />
      </span>
      <h2 className="text-xl font-bold text-ink">Your mentor space is locked</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
        Once an admin verifies you as a mentor, this is where you'll handle session requests,
        see who you're helping and what they're working towards, and manage what you offer.
      </p>

      <div className="mx-auto mt-6 grid max-w-xl gap-2 text-left sm:grid-cols-2">
        {[
          'Accept or decline session requests',
          'See each mentee’s career roadmap',
          'List services and set your own price',
          'Track sessions, hours, ratings and badges',
        ].map((f) => (
          <p key={f} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-muted">
            <Lock size={12} className="shrink-0" />
            {f}
          </p>
        ))}
      </div>

      <Link to="/profile#mentor-verification">
        <Button className="mx-auto mt-6" icon={<Award size={14} />}>
          Apply to become a mentor
        </Button>
      </Link>
      <p className="mt-2 text-xs text-muted">
        Applications are submitted from your profile, with proof of your experience.
      </p>
    </Card>
  )
}
