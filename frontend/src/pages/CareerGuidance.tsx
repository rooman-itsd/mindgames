import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Briefcase, Compass, HelpCircle, Pencil, Route, SlidersHorizontal, Sparkles,
} from 'lucide-react'
import { Button, Card } from '../components/ui'
import { api } from '../lib/api'
import { useApp } from '../store/AppStore'
import { CareerGoalSummary } from '../components/career/CareerGoalSummary'
import { CareerRoadmapTimeline } from '../components/career/CareerRoadmapTimeline'
import { AlumniHelpSection } from '../components/career/AlumniHelpSection'
import { MatchedServices } from '../components/career/MatchedServices'
import { NextStepCard, QuickAccessCard } from '../components/career/NextStepCard'
import { CareerGuidanceIntro } from '../components/career/CareerGuidanceIntro'
import { RoadmapProgressBanner } from '../components/career/RoadmapProgressBanner'
import { serviceName } from '../lib/careerServices'
import { CAREER_INTRO_SEEN_KEY } from '../lib/careerIntro'
import type {
  AlumniHelper,
  AlumniService,
  CareerAssessment,
  CareerRoadmap,
  CareerStageStatus,
} from '../types'
import { SkeletonPage } from '../components/ui/Skeleton'

type BookingTarget =
  | { kind: 'person'; mentorId: string; name: string; topic: string }
  | { kind: 'service'; mentorId: string; name: string; topic: string; serviceId: string }

/**
 * Career Guidance: the assessment → roadmap → alumni/services flow.
 *
 * This page orchestrates existing features rather than duplicating them —
 * people, jobs and mentors all link back out to the pages that already own
 * them (see QuickAccessCard).
 */
export function CareerGuidance() {
  const { currentUser, bookSession, notify } = useApp()
  const navigate = useNavigate()

  const [roadmap, setRoadmap] = useState<CareerRoadmap | null>(null)
  const [assessment, setAssessment] = useState<CareerAssessment | null>(null)
  const [draft, setDraft] = useState<CareerAssessment | null>(null)
  const [helpers, setHelpers] = useState<AlumniHelper[]>([])
  const [matched, setMatched] = useState<AlumniService[]>([])
  // Feeds the Quick access card, and stays in step with anything a mentor
  // assigns — the summary counts everything assigned to this member, not just
  // what they saved themselves. Only the number is fetched: this page never
  // shows the rows, and the list itself is paged.
  const [resourceCount, setResourceCount] = useState(0)
  const [allServices, setAllServices] = useState<AlumniService[] | null>(null)
  const [showingAll, setShowingAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState<BookingTarget | null>(null)
  const [showIntro, setShowIntro] = useState(false)

  // Editing happens on its own routes rather than in panels stacked on this
  // page — see CareerAssessmentPage and EditRoadmapPage.
  const goToAssessment = useCallback(() => navigate('/career-guidance/assessment'), [navigate])
  const goToRoadmapEdit = useCallback(() => navigate('/career-guidance/roadmap/edit'), [navigate])
  const goToServices = useCallback(() => navigate('/career-guidance/services'), [navigate])

  // The walkthrough opens by itself the first time someone lands here, because
  // the page otherwise starts with a form and no explanation of what the
  // feature is for. After that it is on demand only.
  // localStorage throws in some privacy modes, so a failed read must not take
  // the page down with it — worst case the tour opens once more than needed.
  const markIntroSeen = useCallback(() => {
    setShowIntro(false)
    try {
      window.localStorage.setItem(CAREER_INTRO_SEEN_KEY, '1')
    } catch {
      /* ignore — the tour is still reachable from "How this works" */
    }
  }, [])

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(CAREER_INTRO_SEEN_KEY)) setShowIntro(true)
    } catch {
      /* ignore */
    }
  }, [])

  const loadRoadmapExtras = useCallback(() => {
    Promise.all([api.getCareerAlumniHelp(), api.getMatchedServices(), api.getCareerResourceSummary()])
      .then(([people, services, resources]) => {
        setHelpers(people)
        setMatched(services)
        setResourceCount(resources.count)
      })
      .catch(() => {
        /* the roadmap itself still renders without these side panels */
      })
  }, [])

  useEffect(() => {
    Promise.all([api.getCareerRoadmap(), api.getLastCareerAssessment(), api.getCareerDraft()])
      .then(([r, last, d]) => {
        setRoadmap(r)
        setAssessment(last)
        setDraft(d)
        if (r) loadRoadmapExtras()
      })
      .catch((err) => notify(err instanceof Error ? err.message : 'Could not load Career Guidance.', 'error'))
      .finally(() => setLoading(false))
  }, [notify, loadRoadmapExtras])

  // Resolves true once saved, so the timeline only shows its "Next up" strip
  // for a stage that really was marked done. Failures still toast here.
  async function setStepStatus(stepKey: string, status: CareerStageStatus): Promise<boolean> {
    try {
      setRoadmap(await api.setCareerStepStatus(stepKey, status))
      return true
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update that step.', 'error')
      return false
    }
  }

  // Shared by the services section below and each stage's "N services" list,
  // so both book a service through exactly the same path.
  function bookService(s: AlumniService) {
    setBooking({
      kind: 'service',
      mentorId: s.userId,
      name: s.providerName ?? 'this alumnus',
      topic: serviceName(s),
      serviceId: s.id,
    })
  }

  // Shared by the timeline's per-stage "X alumni can help" list and the
  // aggregate "People from Rooman" section below it — same action either way.
  function bookPerson(p: AlumniHelper) {
    setBooking({
      kind: 'person',
      mentorId: p.id,
      name: p.name,
      topic: p.reason || `Guidance towards ${roadmap?.goal.targetRole ?? 'my career goal'}`,
    })
  }

  async function toggleAllServices() {
    if (!showingAll && allServices === null) {
      try {
        setAllServices(await api.getAllServices())
      } catch {
        notify('Could not load the full service list.', 'error')
        return
      }
    }
    setShowingAll((v) => !v)
  }

  if (loading) {
    return (
      <SkeletonPage />
    )
  }

  if (!roadmap) {
    return (
      <div className="flex flex-col gap-4">
        {/* A mentor manages what they offer from here too. Without this the
            supply side would be gated behind the demand side: a mentor who
            never takes the assessment could never list a service. */}
        <PageHeader
          onBack={() => navigate(-1)}
          actions={
            <>
              <Button
                variant="ghost"
                icon={<HelpCircle size={14} />}
                onClick={() => setShowIntro(true)}
              >
                How this works
              </Button>
              {currentUser.isMentor && (
                <Button variant="outline" icon={<Briefcase size={14} />} onClick={goToServices}>
                  My services
                </Button>
              )}
            </>
          }
        />
        <EmptyState hasDraft={!!draft} onStart={goToAssessment} />
        {showIntro && (
          <CareerGuidanceIntro
            onClose={markIntroSeen}
            onStart={goToAssessment}
            startLabel={draft ? 'Resume my assessment' : 'Start my assessment'}
          />
        )}
      </div>
    )
  }

  const nextStage = roadmap.stages.find((s) => s.status === 'in_progress' || s.status === 'upcoming')
  const services = showingAll ? allServices ?? [] : matched

  return (
    <div className="flex flex-col gap-4 pb-4">
      <PageHeader
        onBack={() => navigate(-1)}
        actions={
          <>
            <Button
              variant="ghost"
              icon={<HelpCircle size={14} />}
              onClick={() => setShowIntro(true)}
            >
              How this works
            </Button>
            <Button variant="outline" icon={<Pencil size={14} />} onClick={goToAssessment}>
              Edit assessment
            </Button>
            <Button variant="outline" icon={<SlidersHorizontal size={14} />} onClick={goToRoadmapEdit}>
              Edit roadmap
            </Button>
            {currentUser.isMentor && (
              <Button variant="outline" icon={<Briefcase size={14} />} onClick={goToServices}>
                My services
              </Button>
            )}
          </>
        }
      />

      <RoadmapProgressBanner
        roadmap={roadmap}
        onFindAlumni={() => {
          const el = document.getElementById('career-alumni-help')
          if (el) el.scrollIntoView({ behavior: 'smooth' })
          else navigate('/network/matches')
        }}
      />

      <CareerGoalSummary roadmap={roadmap} supportPreference={assessment?.supportPreference ?? ''} />

      <CareerRoadmapTimeline
        roadmap={roadmap}
        people={helpers}
        onStepStatus={setStepStatus}
        onBookPerson={bookPerson}
        onBookService={bookService}
      />

      <AlumniHelpSection people={helpers} onBook={bookPerson} />

      <MatchedServices
        services={services}
        showingAll={showingAll}
        onToggleAll={toggleAllServices}
        onBook={bookService}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NextStepCard
            stage={nextStage}
            onFindAlumni={() => {
              const el = document.getElementById('career-alumni-help')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
              else navigate('/network/matches')
            }}
          />
        </div>
        <QuickAccessCard resourceCount={resourceCount} />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-5 py-4">
        <p className="text-sm">
          <span className="font-bold text-ink">Your network is your net worth.</span>
          <span className="block text-muted">
            Tap into the Rooman alumni community and build the career you want.
          </span>
        </p>
        <span className="hidden shrink-0 items-center gap-2 sm:flex">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
            R
          </span>
          <span className="text-xs leading-tight font-bold text-ink">
            RooConnect
            <span className="block font-medium text-muted">Alumni Network</span>
          </span>
        </span>
      </div>

      {showIntro && (
        <CareerGuidanceIntro
          onClose={markIntroSeen}
          onStart={goToRoadmapEdit}
          startLabel="Shape my roadmap"
        />
      )}

      {booking && (
        <BookModal
          target={booking}
          onClose={() => setBooking(null)}
          onBook={(topic, date, time) => {
            bookSession(
              booking.mentorId,
              topic,
              date,
              time,
              booking.kind === 'service' ? booking.serviceId : undefined,
            )
            setBooking(null)
          }}
        />
      )}
    </div>
  )
}

function PageHeader({ onBack, actions }: { onBack: () => void; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2">
        <button
          onClick={onBack}
          className="mt-1 rounded-full p-1 text-muted hover:bg-gray-100"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-ink">Your Career Roadmap</h1>
          <p className="text-sm text-muted">
            Built from your goals, skills, time, and the kind of help you want.
          </p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

function EmptyState({ hasDraft, onStart }: { hasDraft: boolean; onStart: () => void }) {
  return (
    <Card className="px-6 py-12 text-center">
      <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand-50 text-brand">
        <Route size={26} />
      </span>
      <h2 className="text-xl font-bold text-ink">
        {hasDraft ? 'Pick up where you left off' : 'Build your career roadmap'}
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
        Answer a few questions about where you are and where you want to go. We’ll build a
        step-by-step plan and connect you with Rooman alumni who’ve walked a similar path.
      </p>

      <div className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
        <Perk icon={<Compass size={18} />} title="A plan for your goal" body="Stages sized to the time you actually have." />
        <Perk icon={<Sparkles size={18} />} title="Alumni who fit" body="People who made a similar move before you." />
        <Perk icon={<Briefcase size={18} />} title="Help you can book" body="Guidance and services matched to each stage." />
      </div>

      <Button variant="ai" className="mx-auto mt-6" icon={<Sparkles size={14} />} onClick={onStart}>
        {hasDraft ? 'Resume assessment' : 'Start assessment'}
      </Button>
      <p className="mt-2 text-xs text-muted">Takes about 5–10 minutes. Your progress is saved.</p>
    </Card>
  )
}

function Perk({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-line p-4 text-left">
      <span className="mb-2 grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand">
        {icon}
      </span>
      <p className="text-sm font-bold text-ink">{title}</p>
      <p className="text-xs text-muted">{body}</p>
    </div>
  )
}

/** Booking reuses the existing mentorship session flow — topic, date and
 *  time, exactly as Mentorship does. A service booking additionally carries
 *  its service id so the session snapshots that service's price. */
function BookModal({
  target,
  onClose,
  onBook,
}: {
  target: BookingTarget
  onClose: () => void
  onBook: (topic: string, date: string, time: string) => void
}) {
  const [topic, setTopic] = useState(target.topic)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      {/* The click guard wraps the whole Card. On an inner div, clicking the
          Card's own p-5 padding still reached the backdrop handler and closed
          the modal, discarding whatever had been typed. */}
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card className="w-full p-5">
          <div>
          <h2 className="text-lg font-bold text-ink">Request a session with {target.name}</h2>
          <p className="mb-4 text-sm text-muted">
            They’ll get your request and confirm a time. Payment, if any, is arranged directly with them.
          </p>

          <label className="mb-1 block text-xs font-semibold text-muted">Topic</label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="mb-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Preferred date</label>
              <input
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="Mon, 12 Oct"
                className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted">Preferred time</label>
              <input
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="6:00 PM IST"
                className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!topic.trim() || !date.trim() || !time.trim()}
              onClick={() => onBook(topic.trim(), date.trim(), time.trim())}
            >
              Send request
            </Button>
          </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
