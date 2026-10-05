import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  Award, BadgeCheck, BookOpen, CalendarClock, CheckCircle2, Clock, Crown, Flame, GraduationCap, Lock,
  Map as MapIcon, Plus, Star, Users, Wrench, X,
} from 'lucide-react'
import { Avatar, Button, Card } from '../ui'
import { api } from '../../lib/api'
import { badgeTierClasses, roleLine, sessionLabels } from '../../lib/format'
import { isHttpUrl } from '../../lib/links'
import { useApp } from '../../store/AppStore'
import { ManageServicesPanel } from '../career/ManageServicesPanel'
import { MenteeRoadmapModal } from './MenteeRoadmapModal'
import { AssignResourceModal } from './AssignResourceModal'
import { SubscriptionPlans } from '../subscription/SubscriptionPlans'
import type { Mentee, MentorshipSession, ProfileStats } from '../../types'

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

  const isMentor = currentUser.isMentor

  useEffect(() => {
    if (!isMentor) return
    api.getMentees().then(setMentees, () => {})
    api.getProfileStats(currentUser.id).then(setStats, () => {})
  }, [isMentor, currentUser.id])

  if (!isMentor) return <LockedState />

  // The banner below renders `blockedReason`, so it should appear exactly
  // when there IS one — i.e. when the mentor cannot currently accept.
  // Deriving it from status instead meant two wrong answers: a mentor who
  // cancelled but still has paid days got a false "you need a subscription"
  // alarm, and a mentor who had used up the month's session cap got no
  // warning at all despite being blocked.
  const canAccept = subscription?.canAcceptSessions ?? false

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

      {/* Offer a 1:1 session, rather than only ever waiting for someone to
          request one. Restricted to connections, and they accept or decline
          it the same way a mentor accepts a request today. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#edeff1] bg-white p-4">
        <p className="text-sm text-[#878a8c]">
          Offer one of your connections a 1:1 session instead of waiting to be asked.
        </p>
        <Button icon={<Plus size={15} />} onClick={() => setShowOfferSession(true)}>
          Host a session
        </Button>
      </div>

      {/* At a glance */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<GraduationCap size={16} />} label="Sessions given" value={stats?.sessionsGiven ?? 0} />
        <Stat icon={<Clock size={16} />} label="Hours mentored" value={stats?.hoursGiven ?? 0} />
        <Stat
          icon={<Star size={16} />}
          label="Rating"
          value={stats?.avgRating ? `${stats.avgRating}★` : '—'}
          sub={stats?.ratingCount ? `${stats.ratingCount} rated` : 'no ratings yet'}
        />
        <Stat
          icon={<Flame size={16} />}
          label="Streak"
          value={stats?.mentorStreakWeeks ?? 0}
          sub={stats?.mentorStreakWeeks === 1 ? 'week' : 'weeks'}
        />
      </div>

      {/* Requests waiting on this mentor */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#1c1c1c]">
            <CalendarClock size={18} className="text-[#ff4500]" />
            Requests
            {requests.length > 0 && (
              <span className="rounded-full bg-[#ff4500] px-2 py-0.5 text-xs font-bold text-white">
                {requests.length}
              </span>
            )}
          </h2>
        </div>
        {requests.length === 0 ? (
          <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-[#878a8c]">
            No one is waiting on you right now.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#edeff1] p-3">
                <Avatar name={s.menteeName} size={38} to={`/profile/${s.menteeId}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#1c1c1c]">{s.topic}</p>
                  <p className="text-xs text-[#878a8c]">
                    {s.menteeName} · {s.date} at {s.time}
                    {s.isPaid && (s.price ?? 0) > 0 && ` · ₹${(s.price ?? 0).toLocaleString('en-IN')}`}
                  </p>
                </div>
                {/* A slot this mentor offered is waiting on the other side —
                    accepting it here would confirm a session they never
                    agreed to, so it only offers a way to take it back. */}
                {s.requestedBy === 'mentor' ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
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
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Confirmed, still to happen */}
      {upcoming.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#1c1c1c]">
            <CalendarClock size={18} className="text-green-600" />
            Upcoming
          </h2>
          <div className="flex flex-col gap-2">
            {upcoming.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#edeff1] p-3">
                <Avatar name={s.menteeName} size={38} to={`/profile/${s.menteeId}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#1c1c1c]">{s.topic}</p>
                  <p className="text-xs text-[#878a8c]">
                    {s.menteeName} · {s.date} at {s.time}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {s.meetingLink ? (
                    <a
                      href={s.meetingLink}
                      target="_blank"
                      rel="noreferrer"
                      title="Join the meeting"
                      className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100"
                    >
                      Join
                    </a>
                  ) : (
                    <span title="Add a meeting link with Edit" className="px-1 text-xs text-[#878a8c]">
                      No link
                    </span>
                  )}
                  {/* One editor for topic, time and the meeting link — the
                      separate link shortcut was a second door to the same
                      field. */}
                  <Button variant="outline" className="!px-3 !py-1.5 !text-xs" title="Edit topic, time or meeting link" onClick={() => onEdit(s)}>
                    Edit
                  </Button>
                  {onResources && (
                    <Button variant="outline" className="!px-3 !py-1.5 !text-xs" icon={<BookOpen size={12} />} onClick={() => onResources(s)}>
                      Resources{s.resourceCount ? ` · ${s.resourceCount}` : ''}
                    </Button>
                  )}
                  <Button className="!px-3 !py-1.5 !text-xs" onClick={() => onComplete(s)}>
                    Complete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Completed or declined — this mentor's own record, since "My
          Sessions → Past" only shows the mentee side of the history. */}
      {finished.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#1c1c1c]">
            <GraduationCap size={18} className="text-[#878a8c]" />
            Past
          </h2>
          <div className="flex flex-col gap-2">
            {finished.map((s) => {
              const declined = s.status === 'declined'
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#edeff1] p-3 opacity-80">
                  <Avatar name={s.menteeName} size={38} to={`/profile/${s.menteeId}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#1c1c1c]">{s.topic}</p>
                    <p className="text-xs text-[#878a8c]">{s.menteeName} · {s.date}</p>
                  </div>
                  {/* Why a completed session isn't in the stats yet: it counts
                      once the mentee confirms too. Neutral grey, not amber —
                      the mentor has nothing to do here, so it isn't a warning.
                      Names who it's waiting on; the hover says why it matters. */}
                  {!declined && s.mentorConfirmed && !s.menteeConfirmed && (
                    <span
                      title={`Counts toward your hours and badges once ${s.menteeName} confirms it happened.`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-[#5f6368]"
                    >
                      <Clock size={11} /> {s.menteeName} to confirm
                    </span>
                  )}
                  {!declined && s.mentorConfirmed && s.menteeConfirmed && (
                    <span
                      title="Both of you confirmed it — it counts toward your record."
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-700"
                    >
                      <CheckCircle2 size={11} /> Confirmed
                    </span>
                  )}
                  {!declined && s.rating && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
                      <Star size={11} className="fill-amber-500 text-amber-500" /> {s.rating}
                    </span>
                  )}
                  {/* Everything under Past is completed, so only the
                      exception gets a badge. */}
                  {declined && (
                    <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-500">Declined</span>
                  )}
                  {/* After a session the mentor can still add follow-ups for
                      that mentee, so the button shows even with nothing
                      assigned yet. A declined session never happened. */}
                  {!declined && onResources && (
                    <Button variant="outline" className="!px-3 !py-1.5 !text-xs" icon={<BookOpen size={12} />} onClick={() => onResources(s)}>
                      {s.resourceCount ? `Resources · ${s.resourceCount}` : 'Add follow-up'}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* People being helped */}
      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#1c1c1c]">
          <Users size={18} className="text-[#ff4500]" />
          My mentees
        </h2>
        {mentees.length === 0 ? (
          <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-[#878a8c]">
            Once you accept a session, that member appears here with what they're working towards.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {mentees.map((m) => (
              <div key={m.id} className="flex flex-col gap-2 rounded-xl border border-[#edeff1] p-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={m.name} src={m.photo} size={38} to={`/profile/${m.id}`} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/profile/${m.id}`} className="block truncate text-sm font-bold text-[#1c1c1c] hover:underline">
                      {m.name}
                    </Link>
                    <p className="truncate text-xs text-[#878a8c]">
                      {[m.designation, m.company].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-[#878a8c]">
                    {m.sessions} {m.sessions === 1 ? 'session' : 'sessions'}
                  </span>
                </div>

                {m.goal?.targetRole && (
                  <p className="flex items-center gap-1.5 text-xs text-[#878a8c]">
                    <MapIcon size={12} className="shrink-0 text-[#ff4500]" />
                    Working towards <strong className="text-[#1c1c1c]">{m.goal.targetRole}</strong>
                  </p>
                )}

                {m.hasRoadmap ? (
                  <Button
                    variant="outline"
                    className="!py-1.5 !text-xs"
                    icon={<MapIcon size={13} />}
                    onClick={() => setRoadmapFor(m.id)}
                  >
                    View their roadmap
                  </Button>
                ) : (
                  <span className="rounded-lg bg-gray-50 py-1.5 text-center text-xs text-[#878a8c]">
                    No roadmap yet
                  </span>
                )}

                {/* Hand them something to learn without tying it to a session. */}
                <Button
                  variant="ghost"
                  className="!py-1.5 !text-xs"
                  icon={<BookOpen size={13} />}
                  onClick={() => setAssignTo({ id: m.id, name: m.name })}
                >
                  Assign resource
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* What they offer + what they've earned */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-[#1c1c1c]">
            <Wrench size={18} className="text-[#ff4500]" />
            My services
          </h2>
          <p className="mb-3 text-sm text-[#878a8c]">
            What you offer, and what you charge. Shown to members whose roadmap matches.
          </p>
          <Button variant="outline" onClick={() => setShowServices((v) => !v)}>
            {showServices ? 'Hide services' : 'Manage services'}
          </Button>
        </Card>

        <Card className="p-5">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-[#1c1c1c]">
            <Award size={18} className="text-[#ff4500]" />
            Badges
          </h2>
          {!stats || stats.badges.length === 0 ? (
            <p className="text-sm text-[#878a8c]">
              Complete a session and have your mentee confirm it to earn your first badge.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {stats.badges.map((b) => (
                <span
                  key={b.id}
                  title={b.description}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeTierClasses(b.tier)}`}
                >
                  <BadgeCheck size={13} />
                  {b.name}
                </span>
              ))}
            </div>
          )}
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
  const field = 'mt-1 w-full rounded-lg border border-[#edeff1] px-3 py-2 text-sm outline-none focus:border-[#ff4500]'

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
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#1c1c1c]">Host a session</h2>
            <p className="text-sm text-[#878a8c]">They'll get it as a request to accept or decline.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-[#878a8c] hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <label className="block text-sm font-medium text-[#1c1c1c]">Who is it for?</label>
        {connections.length === 0 ? (
          <p className="mt-1 rounded-lg bg-gray-50 px-3 py-4 text-center text-xs text-[#878a8c]">
            You have no connections yet to offer a session to.
          </p>
        ) : (
          // A plain <select> can only show names, and duplicate names are
          // common in an alumni network — the photo and role are what tell
          // two "Chandana S"s apart.
          <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-[#edeff1]">
            {connections.map((u) => (
              <label
                key={u.id}
                className={`flex cursor-pointer items-center gap-2.5 border-b border-[#edeff1] px-3 py-2 last:border-b-0 hover:bg-gray-50 ${
                  menteeId === u.id ? 'bg-orange-50' : ''
                }`}
              >
                <input
                  type="radio"
                  name="offer-mentee"
                  checked={menteeId === u.id}
                  onChange={() => setMenteeId(u.id)}
                  className="h-4 w-4 shrink-0 accent-[#ff4500]"
                />
                <Avatar name={u.name} src={u.photo} size={30} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1c1c1c]">{u.name}</span>
                {roleLine(u) && (
                  <span className="max-w-[45%] shrink-0 truncate text-right text-[11px] text-[#878a8c]">
                    {roleLine(u)}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}

        <label className="mt-3 block text-sm font-medium text-[#1c1c1c]">What will you cover?</label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={2}
          placeholder="e.g. Reviewing your backend roadmap"
          className={`${field} resize-none`}
        />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-[#1c1c1c]">Date</label>
            <input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#1c1c1c]">Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
          </div>
        </div>

        <label className="mt-3 block text-sm font-medium text-[#1c1c1c]">
          Meeting link <span className="text-red-500">*</span>
        </label>
        <input
          value={meetingLink}
          onChange={(e) => setMeetingLink(e.target.value)}
          placeholder="https://meet.google.com/…"
          className={field}
        />

        <label className="mt-3 block text-sm font-medium text-[#1c1c1c]">Prep for them (optional)</label>
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
    <Card className="p-4">
      <span className="flex items-center gap-1.5 text-xs font-medium text-[#878a8c]">
        <span className="text-[#ff4500]">{icon}</span>
        {label}
      </span>
      <p className="mt-1 text-2xl font-bold text-[#1c1c1c]">{value}</p>
      {sub && <p className="text-xs text-[#878a8c]">{sub}</p>}
    </Card>
  )
}

/** Shown to anyone who is not an approved mentor. Explains what the space is
 *  and points at the real application, rather than hiding the tab entirely. */
function LockedState() {
  return (
    <Card className="px-6 py-12 text-center">
      <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-gray-100 text-[#878a8c]">
        <Lock size={26} />
      </span>
      <h2 className="text-xl font-bold text-[#1c1c1c]">Your mentor space is locked</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-[#878a8c]">
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
          <p key={f} className="flex items-center gap-2 rounded-lg border border-[#edeff1] px-3 py-2 text-sm text-[#878a8c]">
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
      <p className="mt-2 text-xs text-[#878a8c]">
        Applications are submitted from your profile, with proof of your experience.
      </p>
    </Card>
  )
}
