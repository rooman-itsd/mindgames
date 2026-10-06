import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, ExternalLink, Video, Award, Calendar, GraduationCap, Star, X } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { SubscriptionPlans } from '../components/subscription/SubscriptionPlans'
import { MentorWorkspace } from '../components/mentor/MentorWorkspace'
import { GroupSessionsTab } from '../components/mentor/GroupSessionsTab'
import { CompleteSessionModal } from '../components/mentor/CompleteSessionModal'
import { EditSessionModal } from '../components/mentor/EditSessionModal'
import { SessionResourcesModal } from '../components/career/SessionResourcesModal'
import { api } from '../lib/api'
import { roleLine, sessionLabels, sessionPriceLabel } from '../lib/format'
import { isHttpUrl } from '../lib/links'
import { isBookableMentor } from '../lib/profileCompleteness'
import { Avatar, Button, Card } from '../components/ui'
import { FREE_MENTORSHIP_SESSIONS, type MentorshipSession, type User } from '../types'

type Tab = 'Find a Mentor' | 'My Sessions' | 'Mentor Space' | 'Group Sessions'

export function Mentorship() {
  const {
    users,
    currentUser,
    sessions,
    userById,
    bookSession,
    acceptSession,
    acceptSessionOffer,
    declineSessionOffer,
    confirmSession,
    cancelSession,
    rateSession,
    declineSession,
    completeSession,
    editSession,
    refreshSubscription,
    query,
  } = useApp()
  const [tab, setTab] = useState<Tab>('Find a Mentor')
  const [accepting, setAccepting] = useState<string | null>(null)
  // Session the mentor was accepting when the paywall interrupted.
  const [payFor, setPayFor] = useState<{
    id: string; link?: string; resourceLink?: string; resourceTitle?: string
  } | null>(null)
  const [rating, setRating] = useState<MentorshipSession | null>(null)
  const [ratings, setRatings] = useState<Map<string, { avg: number; count: number }>>(new Map())

  useEffect(() => {
    api.getMentorRatings().then(
      (rows) => setRatings(new Map(rows.map((r) => [r.mentorId, { avg: r.avg, count: r.count }]))),
      () => {},
    )
  }, [])
  const [booking, setBooking] = useState<User | null>(null)
  // Session being marked completed — captures how long it actually ran.
  const [completing, setCompleting] = useState<MentorshipSession | null>(null)
  // Session being rescheduled/renamed by its mentor.
  const [editing, setEditing] = useState<MentorshipSession | null>(null)
  const [resourcesFor, setResourcesFor] = useState<MentorshipSession | null>(null)

  const q = query.trim().toLowerCase()
  const mentors = users
    .filter((u) => isBookableMentor(u) && u.id !== currentUser.id && u.id !== 'rooman')
    .filter((u) => !q || `${u.name} ${u.domain} ${u.expertise.join(' ')}`.toLowerCase().includes(q))

  // Split by role rather than mixing both into one list: a mentor's incoming
  // requests and their own bookings as a mentee were previously interleaved,
  // so "Requests" could mean either "someone wants your time" or "you are
  // waiting on someone". Mentor-side items now live in Mentor Space.
  const asMentee = sessions.filter((s) => s.menteeId === currentUser.id)
  const asMentor = sessions.filter((s) => s.mentorId === currentUser.id)
  const requested = asMentee.filter((s) => s.status === 'requested')
  const upcoming = asMentee.filter((s) => s.status === 'upcoming')
  const finished = asMentee.filter((s) => s.status === 'past' || s.status === 'declined')
  const mentorRequests = asMentor.filter((s) => s.status === 'requested')
  const mentorUpcoming = asMentor.filter((s) => s.status === 'upcoming')
  const mentorFinished = asMentor.filter((s) => s.status === 'past' || s.status === 'declined')

  // Mentee free-session allowance: the first N booked (non-declined) sessions
  // are free; beyond that, sessions are paid at the mentor's rate. Sessions a
  // mentor offered are excluded — they were given, not spent, so they must
  // not eat an allowance the member never used. Mirrors the same rule in
  // mentorship.routes.ts.
  const freeUsed = sessions.filter(
    (s) => s.menteeId === currentUser.id && s.status !== 'declined' && s.requestedBy !== 'mentor',
  ).length
  const freeRemaining = Math.max(0, FREE_MENTORSHIP_SESSIONS - freeUsed)

  // Mentors I already have a pending request with (as the mentee). A slot a
  // mentor offered *me* doesn't belong here — "Requested — awaiting
  // confirmation" would be backwards, and it wrongly blocked booking that
  // mentor over a request the member never made.
  const pendingMentorRequestIds = new Set(
    sessions
      .filter((s) => s.status === 'requested' && s.menteeId === currentUser.id && s.requestedBy !== 'mentor')
      .map((s) => s.mentorId),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Mentorship</h1>
        {!currentUser.isMentor && (
          // Links to the real verification flow on the profile. It used to
          // call updateProfile({isMentor:true}), which the backend rejects
          // with 403 unless already verified — so every unverified member who
          // pressed it got an error and no way forward.
          <Link to="/profile#mentor-verification">
            <Button variant="cta">
              <Award size={16} /> Become a Mentor
            </Button>
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm">
        {(['Find a Mentor', 'My Sessions', 'Mentor Space', 'Group Sessions'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              tab === t ? 'bg-brand text-white' : 'text-muted hover:bg-gray-100'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Free-session allowance */}
      <div className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${freeRemaining > 0 ? 'border-green-200 bg-green-50 text-green-800' : 'border-line bg-surface text-muted'}`}>
        {freeRemaining > 0 ? (
          <>🎁 You have <strong>{freeRemaining}</strong> of {FREE_MENTORSHIP_SESSIONS} free mentorship {freeRemaining === 1 ? 'session' : 'sessions'} left — book any mentor you like, free.</>
        ) : (
          <>You've used your {FREE_MENTORSHIP_SESSIONS} free sessions. New sessions are <strong>paid</strong> at the mentor's hourly rate (arranged with the mentor).</>
        )}
      </div>

      {tab === 'Find a Mentor' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {mentors.map((m) => (
            <Card key={m.id} className="p-5">
              <div className="flex items-center gap-3">
                <Avatar name={m.name} src={m.photo} size={56} to={`/profile/${m.id}`} />
                <div className="min-w-0">
                  <Link to={`/profile/${m.id}`} className="font-semibold text-ink hover:underline">{m.name}</Link>
                  {roleLine(m) && <p className="truncate text-xs text-muted">{roleLine(m)}</p>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand">{m.domain}</span>
                {m.expertise.slice(0, 2).map((e) => (
                  <span key={e} className="rounded-full bg-page px-2.5 py-0.5 text-xs text-muted">{e}</span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-muted">
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  {ratings.has(m.id)
                    ? `${ratings.get(m.id)!.avg} (${ratings.get(m.id)!.count}) · ${m.sessionsConducted ?? 0} sessions`
                    : `${m.sessionsConducted ?? 0} sessions`}
                </span>
                {m.mentorRate ? (
                  <span className="font-bold text-ink">₹{m.mentorRate.toLocaleString('en-IN')}<span className="text-xs font-normal text-muted">/hr</span></span>
                ) : (
                  <span className="text-xs text-muted">Rate on request</span>
                )}
              </div>
              {pendingMentorRequestIds.has(m.id) ? (
                <Button variant="subtle" className="mt-4 w-full" disabled>
                  <Calendar size={15} /> Requested — awaiting confirmation
                </Button>
              ) : (
                <Button className="mt-4 w-full" onClick={() => setBooking(m)}>
                  <Calendar size={15} />{' '}
                  {freeRemaining > 0
                    ? 'Book a free session'
                    : m.mentorRate
                      ? `Book · ₹${m.mentorRate.toLocaleString('en-IN')}/hr`
                      : 'Book a session'}
                </Button>
              )}
            </Card>
          ))}
        </div>
      ) : tab === 'My Sessions' ? (
        <div className="flex flex-col gap-5">
          {/* Requests: mentor decides; mentee awaits */}
          {requested.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold text-ink">Requests</h2>
              <div className="flex flex-col gap-3">
                {requested.map((s) => {
                  const iAmMentor = s.mentorId === currentUser.id
                  const other = iAmMentor ? s.menteeName : userById(s.mentorId)?.name
                  // A mentor-offered slot waits on *me* (the mentee) instead
                  // of the other way round, so this row gets the buttons.
                  const offeredToMe = !iAmMentor && s.requestedBy === 'mentor'
                  return (
                    <Card key={s.id} className="flex flex-wrap items-center gap-3 p-4">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                        <GraduationCap size={20} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink">{s.topic}</p>
                        <p className="text-xs text-muted">
                          {iAmMentor
                            ? `${other} requested this session`
                            : offeredToMe
                              ? `${other} offered you this session`
                              : `with ${other}`} · {s.date} · {s.time}
                          {sessionPriceLabel(s) && <span className="font-semibold text-brand"> · {sessionPriceLabel(s)}</span>}
                        </p>
                      </div>
                      {iAmMentor ? (
                        <div className="flex gap-2">
                          <Button className="!px-3 !py-1.5 text-xs" onClick={() => setAccepting(s.id)}>
                            Accept
                          </Button>
                          <Button variant="subtle" className="!px-3 !py-1.5 text-xs" onClick={() => declineSession(s.id)}>
                            Decline
                          </Button>
                        </div>
                      ) : offeredToMe ? (
                        <div className="flex gap-2">
                          <Button className="!px-3 !py-1.5 text-xs" onClick={() => acceptSessionOffer(s.id)}>
                            Accept
                          </Button>
                          <Button variant="subtle" className="!px-3 !py-1.5 text-xs" onClick={() => declineSessionOffer(s.id)}>
                            Decline
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                            Awaiting confirmation
                          </span>
                          {/* Until now a request you sent could not be taken
                              back — it sat in the mentor's queue forever. */}
                          <Button variant="subtle" className="!px-3 !py-1.5 text-xs" onClick={() => cancelSession(s.id)}>
                            Withdraw
                          </Button>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-bold text-ink">Upcoming</h2>
            <div className="flex flex-col gap-3">
              {upcoming.map((s) => {
                const iAmMentor = s.mentorId === currentUser.id
                const other = iAmMentor ? s.menteeName : userById(s.mentorId)?.name
                return (
                  <Card key={s.id} className="flex flex-wrap items-center gap-3 p-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand">
                      <GraduationCap size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{s.topic}</p>
                      <p className="text-xs text-muted">
                        {iAmMentor ? 'mentoring' : 'with'} {other} · {s.date} · {s.time}
                        {sessionPriceLabel(s) && <span className="font-semibold text-brand"> · {sessionPriceLabel(s)}</span>}
                      </p>
                    </div>
                    {s.meetingLink ? (
                      <a
                        href={s.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600 hover:bg-blue-100"
                      >
                        <Video size={12} /> Join <ExternalLink size={10} />
                      </a>
                    ) : (
                      // Previously this rendered nothing at all, so a session
                      // with no link looked identical to one you simply
                      // couldn't see the link for.
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-muted">
                        No link yet
                      </span>
                    )}
                    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">Confirmed</span>
                    {iAmMentor && (
                      <Button variant="outline" className="!px-3 !py-1.5 text-xs" onClick={() => completeSession(s.id)}>
                        Mark completed
                      </Button>
                    )}
                    {/* A student's own session: only their mentor assigns
                        resources here, so the button only appears once
                        there is actually something to see. On an upcoming
                        session that's prep to go through before it, so it's
                        outlined and shows the count. */}
                    {!!s.resourceCount && (
                      <Button variant="outline" className="!px-3 !py-1.5 text-xs" icon={<BookOpen size={12} />} onClick={() => setResourcesFor(s)}>
                        Resources · {s.resourceCount}
                      </Button>
                    )}
                    <Button variant="subtle" className="!px-3 !py-1.5 text-xs" onClick={() => cancelSession(s.id)}>
                      Cancel
                    </Button>
                  </Card>
                )
              })}
              {upcoming.length === 0 && <Empty label="No upcoming sessions." />}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-ink">Past</h2>
            <div className="flex flex-col gap-3">
              {finished.map((s) => {
                const iAmMentor = s.mentorId === currentUser.id
                const other = iAmMentor ? s.menteeName : userById(s.mentorId)?.name
                const declined = s.status === 'declined'
                return (
                  <Card key={s.id} className="flex items-center gap-3 p-4 opacity-80">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-muted">
                      <GraduationCap size={20} />
                    </span>
                    <div className="flex-1">
                      <p className="font-semibold text-ink">{s.topic}</p>
                      <p className="text-xs text-muted">
                        {iAmMentor ? 'mentored' : 'with'} {other} · {s.date}
                        {sessionPriceLabel(s) && <span className="font-semibold text-brand"> · {sessionPriceLabel(s)}</span>}
                      </p>
                    </div>
                    {/* The mentee's half of mutual confirmation. Without this
                        the session never gets confirmed_at, and so never
                        counts toward either side's stats or badges. */}
                    {!declined && s.mentorConfirmed && !s.menteeConfirmed && (
                      <Button className="!px-3 !py-1.5 text-xs" onClick={() => confirmSession(s.id)}>
                        Confirm it happened
                      </Button>
                    )}
                    {!declined && s.mentorConfirmed && s.menteeConfirmed && (
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                        Confirmed
                      </span>
                    )}
                    {!declined && s.rating && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
                        <Star size={11} className="fill-amber-500 text-amber-500" /> {s.rating}
                      </span>
                    )}
                    {!declined && !s.rating && !iAmMentor && (
                      <Button variant="outline" className="!px-3 !py-1.5 text-xs" onClick={() => setRating(s)}>
                        <Star size={13} /> Rate
                      </Button>
                    )}
                    {/* Everything under Past is completed, so only the
                        exception gets a badge. */}
                    {declined && (
                      <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-500">Declined</span>
                    )}
                    {/* A declined session never happened, so there is nothing
                        to attach reading material to. Otherwise, same rule as
                        Upcoming: only the mentee's own session, only shown
                        once the mentor has actually assigned something. */}
                    {!declined && !!s.resourceCount && (
                      <Button variant="subtle" className="!px-3 !py-1.5 text-xs" icon={<BookOpen size={12} />} onClick={() => setResourcesFor(s)}>
                        Resources · {s.resourceCount}
                      </Button>
                    )}
                  </Card>
                )
              })}
              {finished.length === 0 && <Empty label="No past sessions." />}
            </div>
          </section>
        </div>
      ) : tab === 'Mentor Space' ? (
        <MentorWorkspace
          requests={mentorRequests}
          upcoming={mentorUpcoming}
          finished={mentorFinished}
          onAccept={(id) => setAccepting(id)}
          onDecline={declineSession}
          onComplete={(session) => setCompleting(session)}
          onEdit={(session) => setEditing(session)}
          onResources={(session) => setResourcesFor(session)}
        />
      ) : (
        <GroupSessionsTab />
      )}

      {resourcesFor && (
        <SessionResourcesModal
          sessionId={resourcesFor.id}
          topic={resourcesFor.topic}
          iAmMentor={resourcesFor.mentorId === currentUser.id}
          // Before, during and after a session that happened, the mentor can
          // keep handing that mentee resources — private to the two of them,
          // and also listed in the mentee's Learning Resources.
          canAdd={
            resourcesFor.mentorId === currentUser.id &&
            (resourcesFor.status === 'upcoming' ||
              resourcesFor.status === 'requested' ||
              resourcesFor.status === 'past')
          }
          followUp={resourcesFor.status === 'past'}
          sessionAt={resourcesFor.scheduledAt}
          onClose={() => setResourcesFor(null)}
        />
      )}

      {editing && (
        <EditSessionModal
          session={editing}
          onClose={() => setEditing(null)}
          onSave={async (changes) => {
            // Only dismiss once the PATCH succeeded -- a rejected edit (past
            // time, malformed link) used to close the modal and lose the input.
            if (await editSession(editing.id, changes)) setEditing(null)
          }}
        />
      )}

      {completing && (
        <CompleteSessionModal
          topic={completing.topic}
          who={completing.menteeName}
          allowFollowUp
          onClose={() => setCompleting(null)}
          onConfirm={(minutes, domain, followUp) => {
            completeSession(completing.id, minutes, domain, followUp)
            setCompleting(null)
          }}
        />
      )}

      {accepting && (
        <AcceptModal
          onClose={() => setAccepting(null)}
          onAccept={async (link, resourceLink, resourceTitle) => {
            const id = accepting
            setAccepting(null)
            // A mentor without an active plan cannot accept. Open the plans
            // rather than showing an error they have no way to act on, and
            // remember the session so accepting resumes once they've paid.
            const result = await acceptSession(id, link || undefined, resourceLink, resourceTitle)
            if (result === 'payment-required') {
              setPayFor({ id, link: link || undefined, resourceLink, resourceTitle })
            }
          }}
        />
      )}

      {payFor && (
        <SubscriptionPlans
          reason="You need a subscription to accept sessions"
          onClose={() => setPayFor(null)}
          onActivated={async () => {
            // Pick up exactly where they left off: the session they were
            // accepting when the paywall interrupted is accepted now.
            const pending = payFor
            setPayFor(null)
            await refreshSubscription()
            if (pending) {
              await acceptSession(pending.id, pending.link, pending.resourceLink, pending.resourceTitle)
            }
          }}
        />
      )}
      {rating && (
        <RateModal
          session={rating}
          onClose={() => setRating(null)}
          onRate={(stars, review) => {
            rateSession(rating.id, stars, review || undefined)
            setRating(null)
          }}
        />
      )}
      {booking && (
        <BookModal
          mentor={booking}
          freeRemaining={freeRemaining}
          onClose={() => setBooking(null)}
          onBook={(topic, date, time) => {
            bookSession(booking.id, topic, date, time)
            setBooking(null)
            // Land the user on My Sessions so the new request is visible.
            setTab('My Sessions')
          }}
        />
      )}
    </div>
  )
}

// Booking requires a topic, date and time — the mentor gets all three in the
// session request + notification.
function BookModal({
  mentor,
  freeRemaining,
  onClose,
  onBook,
}: {
  mentor: User
  freeRemaining: number
  onClose: () => void
  onBook: (topic: string, date: string, time: string) => void
}) {
  const [topic, setTopic] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [error, setError] = useState<string | null>(null)
  const isPaid = freeRemaining <= 0

  const field =
    'mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand'

  function submit() {
    if (!topic.trim()) return setError('Tell the mentor what you want to discuss.')
    if (!date) return setError('Pick a date for the session.')
    if (!time) return setError('Pick a time for the session.')
    // The shared formatter, so a booked session's label reads exactly like a
    // hosted or edited one ("Mon, 6 Jul 2026" / "6:00 PM IST").
    const { dateLabel, timeLabel } = sessionLabels(new Date(`${date}T${time}`))
    onBook(topic.trim(), dateLabel, timeLabel)
  }

  return (
    <Overlay onClose={onClose} title={`Book a session with ${mentor.name}`}>
      <p className="text-sm text-muted">
        {mentor.designation}
        {mentor.mentorRate ? ` · ₹${mentor.mentorRate.toLocaleString('en-IN')}/hr` : ' · rate on request'}
      </p>
      {isPaid ? (
        <div className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-ink">
          💳 This is a <strong>paid session</strong>
          {mentor.mentorRate ? ` · ₹${mentor.mentorRate.toLocaleString('en-IN')}/hr` : ''}. You've used your {FREE_MENTORSHIP_SESSIONS} free sessions — arrange payment directly with the mentor.
        </div>
      ) : (
        <div className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          🎁 <strong>Free session</strong> — {freeRemaining} of {FREE_MENTORSHIP_SESSIONS} left.
        </div>
      )}
      <label className="mt-4 block text-sm font-medium text-ink">What would you like to discuss? *</label>
      <textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        rows={3}
        placeholder="e.g. System design interview prep"
        className={`${field} resize-none`}
      />
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-ink">Date *</label>
          <input
            type="date"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            className={field}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink">Time *</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      <Button className="mt-4 w-full" onClick={submit}>
        {isPaid ? 'Request paid session' : 'Request free session'}
      </Button>
    </Overlay>
  )
}

function Overlay({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-slidein w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-gray-100"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-xl border border-line bg-surface py-10 text-center text-sm text-muted shadow-sm">{label}</div>
}

// Mentor confirms a request; the meeting link is required, so a confirmed
// session always has a way to join.
function AcceptModal({
  onClose,
  onAccept,
}: {
  onClose: () => void
  onAccept: (link: string, resourceLink?: string, resourceTitle?: string) => void
}) {
  const [link, setLink] = useState('')
  const [resourceLink, setResourceLink] = useState('')
  const [resourceTitle, setResourceTitle] = useState('')
  const [error, setError] = useState('')

  function confirm() {
    const l = link.trim()
    if (!l) return setError('Add a meeting link so your mentee knows where to join.')
    if (!isHttpUrl(l)) return setError('The meeting link must be a full link, starting with https://')
    const prep = resourceLink.trim()
    if (prep && !isHttpUrl(prep)) return setError('The prep link must be a full link, starting with https://')
    onAccept(l, resourceLink.trim() || undefined, resourceTitle.trim() || undefined)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-slidein w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-ink">Confirm this session</h2>
        <p className="mt-1 text-sm text-muted">
          Add a meeting link (Google Meet, Zoom…) so your mentee knows where to join.
        </p>
        <label className="mt-3 block text-sm font-medium text-ink">
          Meeting link <span className="text-red-500">*</span>
        </label>
        <input
          value={link}
          onChange={(e) => { setLink(e.target.value); setError('') }}
          placeholder="https://meet.google.com/…"
          className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />
        {error && <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
        <label className="mt-3 block text-sm font-medium text-ink">Prep for them (optional)</label>
        <input
          value={resourceLink}
          onChange={(e) => setResourceLink(e.target.value)}
          placeholder="A link for them to go through before you meet"
          className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />
        {/* Only once there's a link — a title on its own has nothing to name. */}
        {resourceLink.trim() && (
          <input
            value={resourceTitle}
            onChange={(e) => setResourceTitle(e.target.value)}
            placeholder="What is it? e.g. Read chapter 4 on rate limiters (optional)"
            maxLength={160}
            aria-label="Prep title"
            className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm}>
            Confirm session
          </Button>
        </div>
      </div>
    </div>
  )
}

// Mentee rates a completed session 1-5 stars.
function RateModal({
  session,
  onClose,
  onRate,
}: {
  session: MentorshipSession
  onClose: () => void
  onRate: (stars: number, review: string) => void
}) {
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [review, setReview] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-slidein w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-ink">How was "{session.topic}"?</h2>
        <p className="mt-1 text-sm text-muted">Your rating shows on the mentor's card and helps other alumni choose.</p>
        <div className="mt-4 flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setStars(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
            >
              <Star
                size={30}
                className={
                  n <= (hover || stars) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                }
              />
            </button>
          ))}
        </div>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value.slice(0, 500))}
          rows={2}
          placeholder="A short review (optional)"
          className="mt-4 w-full resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={stars === 0} onClick={() => onRate(stars, review.trim())}>
            Submit rating
          </Button>
        </div>
      </div>
    </div>
  )
}
