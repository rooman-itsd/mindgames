import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen, ExternalLink, Video, Award, Calendar, Gift, Hourglass, Star, X } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { SubscriptionPlans } from '../components/subscription/SubscriptionPlans'
import { MentorWorkspace } from '../components/mentor/MentorWorkspace'
import { GroupSessionsTab } from '../components/mentor/GroupSessionsTab'
import { CompleteSessionModal } from '../components/mentor/CompleteSessionModal'
import { EditSessionModal } from '../components/mentor/EditSessionModal'
import { SessionResourcesModal } from '../components/career/SessionResourcesModal'
import { DateTile, Timeline, TimelineItem } from '../components/mentor/AgendaParts'
import { IconAction } from '../components/mentor/IconAction'
import { SearchBox } from '../components/mentor/SearchBox'
import { api } from '../lib/api'
import { roleLine, sessionLabels, sessionPriceLabel } from '../lib/format'
import { isHttpUrl } from '../lib/links'
import { isBookableMentor } from '../lib/profileCompleteness'
import {
  dayHeading, daysFromToday, freeSessionsLeft, groupByDay, matchesHistory, matchesMentorSearch, matchesQuery, newestFirst,
  relativeDayLabel, sessionDayKey, sortMentors, type HistoryFilter, type MentorSort,
} from '../lib/agenda'
import { MENTORSHIP_TABS, useMentorshipTab } from '../hooks/useMentorshipTab'
import { useFocusId, useMentorshipFocus } from '../hooks/useMentorshipFocus'
import { Avatar, Button, Card } from '../components/ui'
import { FREE_MENTORSHIP_SESSIONS, type MentorshipSession, type User } from '../types'

const HISTORY_FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'toConfirm', label: 'To confirm' },
  { id: 'toRate', label: 'To rate' },
  { id: 'declined', label: 'Declined' },
]

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
  // In the URL (?tab=…) so the Mentorship right sidebar can follow it.
  const [tab, setTab] = useMentorshipTab()
  const [params, setParams] = useSearchParams()
  const [accepting, setAccepting] = useState<string | null>(null)
  // Session the mentor was accepting when the paywall interrupted.
  const [payFor, setPayFor] = useState<{
    id: string; link?: string; resourceLink?: string; resourceTitle?: string
  } | null>(null)
  const [rating, setRating] = useState<MentorshipSession | null>(null)
  const [ratings, setRatings] = useState<Map<string, { avg: number; count: number }>>(new Map())
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<MentorSort>('rating')
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const [sessionQuery, setSessionQuery] = useState('')
  // A calendar click (?focus=…) scrolls to that row — so nothing may hide it.
  useMentorshipFocus()
  const focusId = useFocusId()
  useEffect(() => {
    if (!focusId) return
    setSessionQuery('')
    setHistoryFilter('all')
  }, [focusId])

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

  // "Book again" in the sidebar links here with ?book=<mentorId>: open the
  // same booking form the Find a Mentor list uses, then drop the param so a
  // refresh doesn't reopen it.
  const bookId = params.get('book')
  useEffect(() => {
    if (!bookId) return
    const m = users.find((u) => u.id === bookId)
    if (!m) return // users still loading — this runs again once they arrive
    const alreadyPending = sessions.some(
      (s) => s.status === 'requested' && s.menteeId === currentUser.id && s.requestedBy !== 'mentor' && s.mentorId === m.id,
    )
    if (isBookableMentor(m) && m.id !== currentUser.id && !alreadyPending) setBooking(m)
    setParams((prev) => { const p = new URLSearchParams(prev); p.delete('book'); return p }, { replace: true })
  }, [bookId, users, sessions, currentUser.id, setParams])

  const q = query.trim().toLowerCase()
  const allMentors = users
    .filter((u) => isBookableMentor(u) && u.id !== currentUser.id && u.id !== 'rooman')
    .filter((u) => !q || `${u.name} ${u.domain} ${u.expertise.join(' ')}`.toLowerCase().includes(q))
  const mentors = sortMentors(allMentors.filter((u) => matchesMentorSearch(u, search)), sort, ratings)

  // Split by role rather than mixing both into one list: a mentor's incoming
  // requests and their own bookings as a mentee were previously interleaved,
  // so "Requests" could mean either "someone wants your time" or "you are
  // waiting on someone". Mentor-side items now live in Mentor Space.
  const asMentee = sessions.filter((s) => s.menteeId === currentUser.id)
  const asMentor = sessions.filter((s) => s.mentorId === currentUser.id)
  // My Sessions search: topic, the other person, or the date.
  const sessionHit = (s: MentorshipSession) =>
    matchesQuery([s.topic, s.mentorId === currentUser.id ? s.menteeName : userById(s.mentorId)?.name, s.date], sessionQuery)
  const requested = asMentee.filter((s) => s.status === 'requested' && sessionHit(s))
  const upcoming = asMentee.filter((s) => s.status === 'upcoming' && sessionHit(s))
  const finished = newestFirst(asMentee.filter((s) => (s.status === 'past' || s.status === 'declined') && sessionHit(s)))
  const searching = sessionQuery.trim().length > 0
  const mentorRequests = asMentor.filter((s) => s.status === 'requested')
  const mentorUpcoming = asMentor.filter((s) => s.status === 'upcoming')
  const mentorFinished = asMentor.filter((s) => s.status === 'past' || s.status === 'declined')

  // Mentee free-session allowance (lib/agenda.ts — the same rule the
  // sidebar's meter and mentorship.routes.ts use).
  const freeRemaining = freeSessionsLeft(sessions, currentUser.id, FREE_MENTORSHIP_SESSIONS)

  // Mentors I already have a pending request with (as the mentee). A slot a
  // mentor offered *me* doesn't belong here — "Requested — awaiting
  // confirmation" would be backwards, and it wrongly blocked booking that
  // mentor over a request the member never made.
  const pendingMentorRequestIds = new Set(
    sessions
      .filter((s) => s.status === 'requested' && s.menteeId === currentUser.id && s.requestedBy !== 'mentor')
      .map((s) => s.mentorId),
  )

  const now = Date.now()
  const shownHistory = finished.filter((s) => matchesHistory(s, historyFilter))
  const select = 'rounded-full border border-line bg-page px-4 py-2 text-sm text-ink outline-none focus:border-brand'

  return (
    <div className="flex flex-col gap-5">
      {/* Emerald band: title, free-session allowance and the tabs, kept compact. */}
      <section className="rounded-2xl bg-linear-to-br from-brand-700 to-brand-900 p-3 text-white shadow-sm sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3 px-1 pt-0.5">
        <div>
          <h1 className="text-xl font-bold text-white">Mentorship</h1>
          {/* Free-session allowance */}
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-brand-100">
            <Gift size={14} className={freeRemaining > 0 ? 'text-marigold' : 'text-brand-200'} />
            {freeRemaining > 0 ? (
              <span>
                <strong className="text-white">{freeRemaining}</strong> of {FREE_MENTORSHIP_SESSIONS} free mentorship{' '}
                {freeRemaining === 1 ? 'session' : 'sessions'} left — book any mentor you like, free.
              </span>
            ) : (
              <span>
                You've used your {FREE_MENTORSHIP_SESSIONS} free sessions. New sessions are <strong className="text-white">paid</strong> at the mentor's hourly rate (arranged with the mentor).
              </span>
            )}
          </p>
        </div>
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
      <nav aria-label="Mentorship sections" className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-white/10 p-1 ring-1 ring-white/15 sm:flex sm:rounded-full">
        {MENTORSHIP_TABS.map((t) => (
          <button
            key={t.id}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors sm:flex-1 sm:rounded-full sm:px-4 ${
              tab === t.id ? 'bg-white text-brand shadow-sm' : 'text-white/85 hover:bg-white/10 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      </section>

      {tab === 'find' ? (
        <>
          {/* One bar, like the other tabs: search + sort. */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-sm">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder="Search by name, skill or company"
              label="Search mentors"
              className="min-w-0 flex-1 basis-56 !border-0 !shadow-none"
            />
            <select value={sort} onChange={(e) => setSort(e.target.value as MentorSort)} className={select} aria-label="Sort mentors">
              <option value="rating">Top rated</option>
              <option value="sessions">Most sessions</option>
              <option value="rate">Lowest rate</option>
            </select>
          </div>
          {mentors.length === 0 ? (
            <Empty label={search.trim() || q ? 'No mentors match that search.' : 'No mentors available yet.'} />
          ) : (
            <Card className="overflow-hidden">
              {/* The count lives on the list's own heading, like Past / You're hosting. */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
                <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                  Mentors
                  <span className="rounded-full bg-gray-100 px-2 py-px text-[11px] font-bold text-muted">{mentors.length}</span>
                </h2>
                {mentors.length < allMentors.length && (
                  <span className="text-xs text-muted">Showing {mentors.length} of {allMentors.length}</span>
                )}
              </div>
              <div className="divide-y divide-line border-t border-line">
              {mentors.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <Avatar name={m.name} src={m.photo} size={48} to={`/profile/${m.id}`} />
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <Link to={`/profile/${m.id}`} className="truncate font-semibold text-ink hover:underline">{m.name}</Link>
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <Star size={13} className="fill-marigold text-marigold" />
                        {ratings.has(m.id)
                          ? <><b className="text-ink">{ratings.get(m.id)!.avg}</b> ({ratings.get(m.id)!.count})</>
                          : 'No ratings yet'}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted">
                      {[roleLine(m), `${m.sessionsConducted ?? 0} sessions`].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand">{m.domain}</span>
                      {m.expertise.slice(0, 2).map((e) => (
                        <span key={e} className="rounded-full bg-page px-2.5 py-0.5 text-xs text-muted">{e}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {m.mentorRate ? (
                      <span className="font-bold text-ink">₹{m.mentorRate.toLocaleString('en-IN')}<span className="text-xs font-normal text-muted">/hr</span></span>
                    ) : (
                      <span className="text-xs text-muted">Rate on request</span>
                    )}
                    {pendingMentorRequestIds.has(m.id) ? (
                      <Button variant="subtle" className="!px-3 !py-1.5 text-xs" disabled>
                        <Calendar size={14} /> Requested — awaiting confirmation
                      </Button>
                    ) : (
                      <Button className="!px-3 !py-1.5 text-xs" onClick={() => setBooking(m)}>
                        <Calendar size={14} />{' '}
                        {freeRemaining > 0
                          ? 'Book a free session'
                          : m.mentorRate
                            ? `Book · ₹${m.mentorRate.toLocaleString('en-IN')}/hr`
                            : 'Book a session'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              </div>
            </Card>
          )}
        </>
      ) : tab === 'sessions' ? (
        <div className="flex flex-col gap-6">
          <SearchBox
            value={sessionQuery}
            onChange={setSessionQuery}
            placeholder="Search by topic, mentor or date"
            label="Search my sessions"
          />
          {/* Requests: mentor decides; mentee awaits */}
          {requested.length > 0 && (
            <Card className="overflow-hidden border-l-4 border-l-marigold">
              <h2 className="flex items-center gap-2 px-5 pt-4 pb-2 text-base font-bold text-ink">
                <Hourglass size={16} className="text-marigold-800" /> Waiting on a reply
                <span className="rounded-full bg-gray-100 px-2 py-px text-[11px] font-bold text-muted">{requested.length}</span>
              </h2>
              <div className="divide-y divide-line">
                {requested.map((s) => {
                  const iAmMentor = s.mentorId === currentUser.id
                  const other = iAmMentor ? s.menteeName : userById(s.mentorId)?.name
                  // A mentor-offered slot waits on *me* (the mentee) instead
                  // of the other way round, so this row gets the buttons.
                  const offeredToMe = !iAmMentor && s.requestedBy === 'mentor'
                  return (
                    <div key={s.id} id={`row-${s.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="font-semibold text-ink">{s.topic}</p>
                        <p className="text-xs text-muted">
                          {iAmMentor
                            ? `${other} requested this session`
                            : offeredToMe
                              ? <><b className="text-ink">{other}</b> offered you this session</>
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
                          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => declineSessionOffer(s.id)}>
                            Decline
                          </Button>
                          <Button className="!px-3 !py-1.5 text-xs" onClick={() => acceptSessionOffer(s.id)}>
                            Accept
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-marigold-100 px-2.5 py-0.5 text-xs font-semibold text-marigold-800">
                            Awaiting confirmation
                          </span>
                          {/* Until now a request you sent could not be taken
                              back — it sat in the mentor's queue forever. */}
                          <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => cancelSession(s.id)}>
                            Withdraw
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          <section>
            <h2 className="mb-3 text-base font-bold text-ink">Coming up</h2>
            {upcoming.length === 0 ? (
              <Empty label={searching ? 'No upcoming sessions match.' : 'No upcoming sessions.'} />
            ) : (
              <Timeline>
                {groupByDay(upcoming).map((g) => (
                  <div key={g.dayKey ?? 'undated'}>
                    <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">
                      {g.dayKey ? dayHeading(g.dayKey) : 'Other dates'}
                      {g.dayKey && (
                        <span className="font-medium tracking-normal normal-case"> · {relativeDayLabel(daysFromToday(g.dayKey, now))}</span>
                      )}
                    </p>
                    {g.items.map((s) => {
                      const iAmMentor = s.mentorId === currentUser.id
                      const other = iAmMentor ? s.menteeName : userById(s.mentorId)?.name
                      const person = iAmMentor ? undefined : userById(s.mentorId)
                      return (
                        <TimelineItem key={s.id} kind="confirmed">
                          <Card id={`row-${s.id}`} className="mb-4 flex flex-wrap items-center gap-3 p-4">
                            <div className="w-20 shrink-0">
                              <p className="text-sm font-bold text-ink">{s.time.replace(/\s*IST$/, '')}</p>
                              <p className="text-[11px] text-muted">{g.dayKey ? 'IST' : s.date}</p>
                            </div>
                            <Avatar name={other ?? 'Mentor'} src={person?.photo} size={36} />
                            <div className="min-w-0 flex-1 basis-48">
                              <p className="font-semibold text-ink">{s.topic}</p>
                              <p className="text-xs text-muted">
                                {iAmMentor ? 'mentoring' : 'with'} {other}
                                {sessionPriceLabel(s) && <span className="font-semibold text-brand"> · {sessionPriceLabel(s)}</span>}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {s.meetingLink ? (
                                <a
                                  href={s.meetingLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full bg-ocean-50 px-2.5 py-1 text-xs font-semibold text-ocean-700 hover:bg-ocean-100"
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
                              <span className="rounded-full bg-jade-100 px-2.5 py-0.5 text-xs font-semibold text-jade-700">Confirmed</span>
                              {iAmMentor && (
                                <Button variant="outline" className="!px-3 !py-1.5 text-xs" onClick={() => completeSession(s.id)}>
                                  Mark completed
                                </Button>
                              )}
                              {/* A student's own session: only their mentor assigns
                                  resources here, so the button only appears once
                                  there is actually something to see. On an upcoming
                                  session that's prep to go through before it, so the
                                  icon shows the count. */}
                              {!!s.resourceCount && (
                                <IconAction label={`Resources · ${s.resourceCount}`} tip="Resources your mentor shared" count={s.resourceCount} onClick={() => setResourcesFor(s)}>
                                  <BookOpen size={14} />
                                </IconAction>
                              )}
                              <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => cancelSession(s.id)}>
                                Cancel
                              </Button>
                            </div>
                          </Card>
                        </TimelineItem>
                      )
                    })}
                  </div>
                ))}
              </Timeline>
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-ink">History</h2>
              {finished.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {HISTORY_FILTERS.map((f) => {
                    const n = finished.filter((s) => matchesHistory(s, f.id)).length
                    return (
                      <button
                        key={f.id}
                        onClick={() => setHistoryFilter(f.id)}
                        aria-pressed={historyFilter === f.id}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          historyFilter === f.id ? 'bg-brand text-white' : 'border border-line bg-surface text-muted hover:text-ink'
                        }`}
                      >
                        {f.label} <span className="opacity-60">{n}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            {finished.length === 0 ? (
              <Empty label={searching ? 'No past sessions match.' : 'No past sessions.'} />
            ) : shownHistory.length === 0 ? (
              <Empty label="Nothing here." />
            ) : (
              <Card className="divide-y divide-line overflow-hidden">
                {shownHistory.map((s) => {
                  const iAmMentor = s.mentorId === currentUser.id
                  const other = iAmMentor ? s.menteeName : userById(s.mentorId)?.name
                  const declined = s.status === 'declined'
                  const day = sessionDayKey(s)
                  return (
                    <div key={s.id} id={`row-${s.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <DateTile dayKey={day} label={s.date} dim />
                      <div className="min-w-0 flex-1 basis-48 opacity-90">
                        <p className="font-semibold text-ink">{s.topic}</p>
                        <p className="text-xs text-muted">
                          {iAmMentor ? 'mentored' : 'with'} {other}{day ? '' : ` · ${s.date}`}
                          {sessionPriceLabel(s) && <span className="font-semibold text-brand"> · {sessionPriceLabel(s)}</span>}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* The mentee's half of mutual confirmation. Without this
                            the session never gets confirmed_at, and so never
                            counts toward either side's stats or badges. */}
                        {!declined && s.mentorConfirmed && !s.menteeConfirmed && (
                          <Button className="!px-3 !py-1.5 text-xs" onClick={() => confirmSession(s.id)}>
                            Confirm it happened
                          </Button>
                        )}
                        {!declined && s.mentorConfirmed && s.menteeConfirmed && (
                          <span className="rounded-full bg-jade-100 px-2.5 py-0.5 text-xs font-semibold text-jade-700">
                            Confirmed
                          </span>
                        )}
                        {!declined && s.rating && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-marigold-50 px-2.5 py-0.5 text-xs font-semibold text-marigold-800">
                            <Star size={11} className="fill-marigold text-marigold" /> {s.rating}
                          </span>
                        )}
                        {!declined && !s.rating && !iAmMentor && (
                          <Button variant="outline" className="!px-3 !py-1.5 text-xs" onClick={() => setRating(s)}>
                            <Star size={13} /> Rate
                          </Button>
                        )}
                        {/* Everything in History is completed, so only the
                            exception gets a badge. */}
                        {declined && (
                          <span className="rounded-full bg-rosewood-50 px-2.5 py-0.5 text-xs font-semibold text-rosewood-700">Declined</span>
                        )}
                        {/* A declined session never happened, so there is nothing
                            to attach reading material to. Otherwise, same rule as
                            Coming up: only the mentee's own session, only shown
                            once the mentor has actually assigned something. */}
                        {!declined && !!s.resourceCount && (
                          <IconAction label={`Resources · ${s.resourceCount}`} tip="Resources your mentor shared" count={s.resourceCount} onClick={() => setResourcesFor(s)}>
                            <BookOpen size={14} />
                          </IconAction>
                        )}
                      </div>
                    </div>
                  )
                })}
              </Card>
            )}
          </section>
        </div>
      ) : tab === 'space' ? (
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
            setTab('sessions')
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
