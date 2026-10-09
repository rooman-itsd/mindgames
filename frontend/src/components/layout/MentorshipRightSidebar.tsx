import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Award, BookOpen, CalendarPlus, ChevronRight, Clock, Compass, Crown, Gift, Hourglass, Trophy, Users, Video, Wrench,
} from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { api } from '../../lib/api'
import {
  byDayThenTime, dayHeading, daysFromToday, freeSessionsLeft, groupCalendar, hostingRecord, istDayKey, mentorCalendar, menteeCalendar,
  myMentors, nextSession, openByDomain, overviewCalendar, relativeDayLabel, sessionDayKey,
} from '../../lib/agenda'
import { useMentorshipTab } from '../../hooks/useMentorshipTab'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { MentorshipCalendar } from '../mentor/MentorshipCalendar'
import { Dot } from '../mentor/AgendaParts'
import { GROUP_SESSIONS_EVENT, lastGroupSessions, type GroupSessionsLoad, type GroupSessionsSnapshot } from '../mentor/groupSessionsBus'
import { MENTOR_STATS_EVENT, lastMentorStats, openManageServices, type MentorStatsLoad } from '../mentor/mentorSpaceBus'
import { MentorBadgeChips } from '../mentor/MentorBadgeChips'
import { SubscriptionPlans } from '../subscription/SubscriptionPlans'
import { Avatar, Button, Card } from '../ui'
import { FREE_MENTORSHIP_SESSIONS, type CareerResource, type GroupSession, type ProfileStats } from '../../types'

/**
 * The Mentorship page's own right rail (AppLayout swaps it in for the general
 * RightSidebar on /mentorship only). A calendar on every tab, filtered to that
 * tab, then a few cards that change with the tab. Reads what the app already
 * holds, plus the member's own group sessions and the next session's prep
 * (one small request each); every action routes back into the page's
 * existing flows. Only mounted where it's visible (xl and up) — below that it
 * would fetch for a rail no one can see.
 */
export function MentorshipRightSidebar() {
  return useMediaQuery('(min-width: 1280px)') ? <MentorshipRail /> : null
}

function MentorshipRail() {
  const [tab] = useMentorshipTab()
  const { sessions, currentUser, userById } = useApp()
  const me = currentUser.id
  const groups = useGroupSnapshot(me, tab !== 'group')

  const mentee = useMemo(() => menteeCalendar(sessions, me, (id) => userById(id)?.name), [sessions, me, userById])
  const mentor = useMemo(() => mentorCalendar(sessions, me), [sessions, me])
  const group = useMemo(() => groupCalendar(groups.mine, groups.open, me), [groups, me])

  const calendar =
    tab === 'sessions' ? <MentorshipCalendar key={tab} items={mentee} legend={['confirmed', 'waiting']} scope="Your 1:1s" />
    : tab === 'space' ? (currentUser.isMentor
        ? <MentorshipCalendar key={tab} items={mentor} legend={['confirmed', 'waiting', 'toConfirm']} scope="Your mentoring" />
        : null)
    : tab === 'group' ? <MentorshipCalendar key={tab} items={group} legend={['hosting', 'joined', 'open']} scope="Group sessions" />
    : <MentorshipCalendar key={tab} items={overviewCalendar(mentee, mentor, group)} legend={['confirmed', 'waiting', 'group']} scope="Everything" />

  return (
    <aside className="fixed top-14 right-[calc(var(--shell-gutter)+14px)] bottom-0 hidden w-[288px] overflow-y-auto py-3.5 xl:block">
      {/* pb-20: the floating Ask Roo button must not cover the last card. */}
      <div className="flex flex-col gap-4 pb-20">
        {calendar}
        {tab === 'find' && <><ThisWeek items={overviewCalendar(mentee, mentor, group)} /><FreeSessions /></>}
        {tab === 'sessions' && <><UpNext /><YourMentors /><FreeSessions /></>}
        {tab === 'space' && (currentUser.isMentor ? <><PlanUsage /><AwaitingMentees /><MyServices /><Badges /></> : <BecomeMentor />)}
        {tab === 'group' && <><HostingNext mine={groups.mine} /><OpenByDomain open={groups.open} mine={groups.mine} /><HostingRecord mine={groups.mine} /></>}
        <p className="px-2 text-[11px] leading-relaxed text-muted">
          Root Connect · Rooman Technologies Alumni Network · 25 years · 500,000+ alumni
        </p>
      </div>
    </aside>
  )
}

/** Group lists: whatever GroupSessionsTab last loaded, else the member's own. */
function useGroupSnapshot(me: string, fetchMine: boolean): GroupSessionsSnapshot {
  // Start from the tab's last load, if this rail mounted after it happened.
  const [snap, setSnap] = useState<GroupSessionsSnapshot | null>(() => lastGroupSessions(me))
  useEffect(() => {
    const onLoad = (e: Event) => {
      const load = (e as CustomEvent<GroupSessionsLoad>).detail
      if (load.owner === me) setSnap(load.snapshot)
    }
    window.addEventListener(GROUP_SESSIONS_EVENT, onLoad)
    // On the Group tab the tab itself loads both lists and announces them, so
    // a second fetch would just repeat it. Elsewhere, fetch only the member's
    // own sessions (the public list is the Group tab's job).
    let alive = true
    if (fetchMine && !lastGroupSessions(me)) {
      api.getMyGroupSessions().then(
        (mine) => alive && setSnap((s) => s ?? { open: [], mine }),
        () => {},
      )
    }
    return () => {
      alive = false
      window.removeEventListener(GROUP_SESSIONS_EVENT, onLoad)
    }
    // Runs once per mount: the rail stays mounted across tab switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return snap ?? { open: [], mine: [] }
}

function SideCard({ title, icon, action, children, className = '' }: {
  title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string
}) {
  return (
    <Card className={`p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">{icon}{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  )
}

// ---- Find a Mentor ------------------------------------------------------------

function ThisWeek({ items }: { items: ReturnType<typeof overviewCalendar> }) {
  const now = Date.now()
  const week = items
    .filter((i) => { const d = daysFromToday(i.dayKey, now); return d >= 0 && d < 7 })
    .sort(byDayThenTime)
    .slice(0, 5)
  return (
    <SideCard title="This week">
      {week.length === 0 ? (
        <p className="text-xs text-muted">Nothing booked in the next 7 days.</p>
      ) : (
        week.map((i, n) => (
          <Link
            key={n}
            replace
            to={`/mentorship?tab=${i.ref.tab}&focus=${encodeURIComponent(i.ref.id)}`}
            className={`-mx-1.5 flex items-center gap-3 rounded-lg px-1.5 py-2 hover:bg-page ${n ? 'border-t border-line' : ''}`}
          >
            <span className="w-12 shrink-0 text-[11px] font-bold text-muted">{dayHeading(i.dayKey).slice(0, -4)}</span>
            <Dot kind={i.kind} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">{i.title}</p>
              <p className="truncate text-[11px] text-muted">{i.detail}</p>
            </div>
          </Link>
        ))
      )}
    </SideCard>
  )
}

function FreeSessions() {
  const { sessions, currentUser } = useApp()
  const left = freeSessionsLeft(sessions, currentUser.id, FREE_MENTORSHIP_SESSIONS)
  return (
    <SideCard title="Free sessions" icon={<Gift size={16} className="text-jade-600" />}>
      <div className="flex gap-1">
        {Array.from({ length: FREE_MENTORSHIP_SESSIONS }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < FREE_MENTORSHIP_SESSIONS - left ? 'bg-gray-200' : 'bg-jade-600'}`} />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        <b className="text-ink">{left} of {FREE_MENTORSHIP_SESSIONS}</b> left.{' '}
        {left > 0 ? "After that, sessions are paid at the mentor's hourly rate." : "New sessions are paid at the mentor's hourly rate."}
      </p>
    </SideCard>
  )
}

// ---- My Sessions -----------------------------------------------------------------

function UpNext() {
  const { sessions, currentUser, userById } = useApp()
  const next = nextSession(sessions.filter((s) => s.menteeId === currentUser.id), Date.now())
  const [prep, setPrep] = useState<CareerResource[]>([])

  // One fetch, for the one session shown, and only when it has something.
  useEffect(() => {
    setPrep([])
    if (!next?.id || !next.resourceCount) return
    let alive = true
    api.getCareerResources(next.id).then((r) => alive && setPrep(r), () => {})
    return () => { alive = false }
  }, [next?.id, next?.resourceCount])

  if (!next) return null
  const mentor = userById(next.mentorId)
  const day = sessionDayKey(next)
  return (
    <Card className="border-l-4 border-l-jade-600 p-4">
      <p className="text-[11px] font-bold tracking-wider text-saffron-700 uppercase">
        Up next{day ? ` · ${relativeDayLabel(daysFromToday(day, Date.now()))}` : ''}
      </p>
      <p className="mt-2 leading-snug font-semibold text-ink">{next.topic}</p>
      <p className="mt-1 flex items-center gap-2 text-xs text-muted">
        <Avatar name={mentor?.name ?? 'Mentor'} src={mentor?.photo} size={22} />
        <span className="truncate">{mentor?.name} · {next.date} · {next.time}</span>
      </p>
      {prep.length > 0 && (
        <div className="mt-3 rounded-xl border border-line p-3">
          <p className="text-[11px] font-bold tracking-wider text-muted uppercase">
            Prep from {mentor?.name.split(' ')[0] ?? 'your mentor'} · {prep.length}
          </p>
          {prep.slice(0, 3).map((r) => (
            <a
              key={r.id}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-2.5 rounded-lg hover:bg-page"
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-jade-50 text-jade-700"><BookOpen size={14} /></span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-ink">{r.title}</span>
                <span className="block text-[11px] text-muted capitalize">{r.kind}</span>
              </span>
            </a>
          ))}
        </div>
      )}
      {next.meetingLink && (
        <a
          href={next.meetingLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-ocean-50 py-1.5 text-xs font-semibold text-ocean-700 hover:bg-ocean-100"
        >
          <Video size={13} /> Join
        </a>
      )}
    </Card>
  )
}

function YourMentors() {
  const { sessions, currentUser, userById } = useApp()
  const pending = new Set(
    sessions.filter((s) => s.status === 'requested' && s.menteeId === currentUser.id && s.requestedBy !== 'mentor').map((s) => s.mentorId),
  )
  const list = myMentors(sessions, currentUser.id).slice(0, 4)
  if (list.length === 0) return null
  return (
    <SideCard
      title="Your mentors"
      icon={<Users size={16} className="text-brand" />}
      action={<Link to="/mentorship" className="text-xs font-semibold text-brand hover:underline">Find more</Link>}
    >
      <div className="flex flex-col gap-3">
        {list.map(({ mentorId, count }) => {
          const m = userById(mentorId)
          if (!m) return null
          return (
            <div key={mentorId} className="flex items-center gap-2.5">
              <Avatar name={m.name} src={m.photo} size={34} to={`/profile/${m.id}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{m.name}</p>
                <p className="truncate text-[11px] text-muted">{count} {count === 1 ? 'session' : 'sessions'}{m.domain ? ` · ${m.domain}` : ''}</p>
              </div>
              {pending.has(mentorId) ? (
                <span title="Requested — awaiting confirmation" className="grid size-8 place-items-center rounded-full bg-gray-100 text-gray-400">
                  <Clock size={14} />
                </span>
              ) : (
                <Link
                  to={`/mentorship?tab=sessions&book=${encodeURIComponent(mentorId)}`}
                  title={`Book ${m.name} again`}
                  aria-label={`Book ${m.name} again`}
                  className="grid size-8 place-items-center rounded-full bg-brand-50 text-brand hover:bg-brand-100"
                >
                  <CalendarPlus size={16} />
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </SideCard>
  )
}

// ---- Mentor Space --------------------------------------------------------------

function PlanUsage() {
  const { subscription, refreshSubscription } = useApp()
  const [showPlans, setShowPlans] = useState(false)
  if (!subscription) return null
  const label = subscription.plan[0].toUpperCase() + subscription.plan.slice(1)
  const cap = subscription.sessionsPerMonth
  const used = subscription.sessionsThisMonth
  const until = subscription.expiresAt
    ? new Date(subscription.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  return (
    <>
      {subscription.canAcceptSessions ? (
        <SideCard
          title={`${label} plan`}
          icon={<Crown size={16} className="text-marigold" />}
          action={<span className="rounded-full bg-jade-100 px-2.5 py-0.5 text-[11px] font-semibold text-jade-700">Active</span>}
        >
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-muted">Sessions this month</span>
            <span className="font-semibold text-ink">{cap === null ? `${used} so far · no limit` : `${used} of ${cap}`}</span>
          </div>
          {cap !== null && (
            <div className="h-1.5 rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, Math.round((used / Math.max(cap, 1)) * 100))}%` }} />
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted">
            {until && <>Active until {until} · </>}
            <button onClick={() => setShowPlans(true)} className="font-semibold text-brand hover:underline">Manage plan</button>
          </p>
        </SideCard>
      ) : (
        <Card className="border-marigold-100 bg-marigold-50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><Crown size={16} className="text-marigold-800" /> Mentor plan</p>
          <p className="mt-1 text-xs text-marigold-800">{subscription.blockedReason ?? 'You need a subscription to accept sessions.'}</p>
          <Button className="mt-3 w-full !py-1.5 !text-xs" icon={<Crown size={13} />} onClick={() => setShowPlans(true)}>See plans</Button>
        </Card>
      )}
      {showPlans && (
        <SubscriptionPlans onClose={() => setShowPlans(false)} onActivated={() => { setShowPlans(false); refreshSubscription() }} />
      )}
    </>
  )
}

function AwaitingMentees() {
  const { sessions, currentUser } = useApp()
  const waiting = sessions.filter(
    (s) => s.mentorId === currentUser.id && s.status === 'past' && s.mentorConfirmed && !s.menteeConfirmed,
  )
  return (
    <SideCard title="Waiting on mentees" icon={<Hourglass size={16} className="text-brand" />}>
      {waiting.length === 0 ? (
        <p className="text-xs text-muted">Every session you completed has been confirmed.</p>
      ) : (
        <>
          {waiting.slice(0, 4).map((s, n) => (
            <div key={s.id} className={`flex items-center gap-2.5 py-2 ${n ? 'border-t border-line' : ''}`}>
              <Avatar name={s.menteeName} size={28} to={`/profile/${s.menteeId}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">{s.topic}</p>
                <p className="truncate text-[11px] text-muted">{s.menteeName} · {s.date}</p>
              </div>
            </div>
          ))}
          <p className="mt-2 text-[11px] text-muted">These count towards your hours and badges once they confirm.</p>
        </>
      )}
    </SideCard>
  )
}

function MyServices() {
  return (
    <SideCard title="My services" icon={<Wrench size={16} className="text-brand" />}>
      <p className="text-xs text-muted">What you offer, and what you charge. Shown to members whose roadmap matches.</p>
      {/* The panel is a full-width form, so it opens in Mentor Space itself. */}
      <Button variant="outline" className="mt-3 w-full !py-1.5 !text-xs" onClick={openManageServices}>
        Manage services
      </Button>
    </SideCard>
  )
}

/** Earned badges, from the stats Mentor Space already loaded (no second fetch). */
function Badges() {
  const { currentUser } = useApp()
  // Start from Mentor Space's last load, if this rail mounted after it happened.
  const [stats, setStats] = useState<ProfileStats | null>(() => lastMentorStats(currentUser.id))
  useEffect(() => {
    const onStats = (e: Event) => {
      const load = (e as CustomEvent<MentorStatsLoad>).detail
      if (load.owner === currentUser.id) setStats(load.stats)
    }
    window.addEventListener(MENTOR_STATS_EVENT, onStats)
    return () => window.removeEventListener(MENTOR_STATS_EVENT, onStats)
  }, [currentUser.id])
  return (
    <SideCard title="Badges" icon={<Award size={16} className="text-brand" />}>
      <MentorBadgeChips stats={stats} />
    </SideCard>
  )
}

function BecomeMentor() {
  return (
    <SideCard title="Mentor Space" icon={<Award size={16} className="text-brand" />}>
      <p className="text-xs text-muted">Once an admin verifies you as a mentor, your mentoring calendar and plan live here.</p>
      <Link to="/profile#mentor-verification" className="mt-3 inline-block text-xs font-semibold text-brand hover:underline">
        Apply to become a mentor
      </Link>
    </SideCard>
  )
}

// ---- Group Sessions --------------------------------------------------------------

function HostingNext({ mine }: { mine: GroupSession[] }) {
  const { currentUser } = useApp()
  const today = istDayKey(Date.now()) ?? ''
  const next = mine
    .filter((g) => g.mentorId === currentUser.id && g.status === 'scheduled' && (istDayKey(g.scheduledAt) ?? '') >= today)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0]
  if (!next) return null
  const day = istDayKey(next.scheduledAt) ?? today
  const pct = Math.round((next.attendeeCount / Math.max(next.capacity, 1)) * 100)
  const time = new Date(next.scheduledAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).toUpperCase()
  return (
    <Card className="border-l-4 border-l-brand p-4">
      <p className="text-[11px] font-bold tracking-wider text-saffron-700 uppercase">
        You host next · {relativeDayLabel(daysFromToday(day, Date.now()))}
      </p>
      <p className="mt-2 font-semibold text-ink">{next.topic}</p>
      <p className="mt-1 text-xs font-semibold text-brand">{dayHeading(day)} · {time} · {next.durationMinutes} min</p>
      <div className="mt-3 mb-1 flex justify-between text-[11px] text-muted">
        <span>{next.attendeeCount} of {next.capacity} joined</span><span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
      {next.meetingLink && (
        <a
          href={next.meetingLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-ocean-50 py-1.5 text-xs font-semibold text-ocean-700 hover:bg-ocean-100"
        >
          <Video size={13} /> Join call
        </a>
      )}
    </Card>
  )
}

function OpenByDomain({ open, mine }: { open: GroupSession[]; mine: GroupSession[] }) {
  const domains = openByDomain(open, mine)
  if (domains.length === 0) return null
  return (
    <SideCard title="Discover by topic" icon={<Compass size={16} className="text-brand" />}>
      {domains.map(({ domain, count }, n) => (
        <Link
          key={domain}
          to={`/mentorship?tab=group&domain=${encodeURIComponent(domain)}`}
          replace
          className={`flex items-center gap-2.5 py-2 hover:text-brand ${n ? 'border-t border-line' : ''}`}
        >
          <span className="flex-1 text-[13px] font-medium text-ink">{domain}</span>
          <span className="text-xs text-muted">{count} open</span>
          <ChevronRight size={14} className="text-muted" />
        </Link>
      ))}
    </SideCard>
  )
}

function HostingRecord({ mine }: { mine: GroupSession[] }) {
  const { currentUser } = useApp()
  const rec = hostingRecord(mine.filter((g) => g.mentorId === currentUser.id))
  if (rec.hosted === 0) return null
  return (
    <SideCard title="Your hosting record" icon={<Trophy size={16} className="text-brand" />}>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[[rec.hosted, 'hosted'], [rec.attendees, 'attendees'], [rec.avgFill === null ? '—' : `${rec.avgFill}%`, 'avg fill']].map(([v, l]) => (
          <div key={l} className="rounded-xl border border-line py-2.5">
            <p className="text-base font-bold text-ink">{v}</p>
            <p className="text-[10px] text-muted">{l}</p>
          </div>
        ))}
      </div>
    </SideCard>
  )
}
