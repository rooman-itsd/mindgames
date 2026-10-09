import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, Briefcase, Check, CircleDashed, Flag, Lock, Map, Target, Users, X } from 'lucide-react'
import { Avatar, Button, Card } from '../ui'
import { AlumniListModal } from './AlumniListModal'
import { blockedBy, isMemberAdded, nextStageAfter } from '../../lib/careerProgress'
import { SERVICE_ICONS, serviceName, servicePrice, servicesForStage } from '../../lib/careerServices'
import { alumniCount } from '../../lib/format'
import { useApp } from '../../store/AppStore'
import type { AlumniHelper, AlumniService, CareerRoadmap, CareerStage, CareerStageStatus } from '../../types'

const BADGE: Record<CareerStageStatus, string> = {
  completed: 'bg-green-500 text-white',
  in_progress: 'bg-brand text-white',
  upcoming: 'bg-gray-200 text-muted',
  paused: 'bg-amber-400 text-white',
}

/** The horizontal plan. Scrolls sideways on desktop when there are many
 *  stages and stacks vertically on small screens — the roadmap has to stay
 *  readable on a phone rather than being a shrunken desktop row.
 *
 *  Each stage leads with the network — the alumni who can help with it and
 *  the services matched to it — because the roadmap is a map to people, not
 *  a syllabus. Finishing a stage points the member at who can help with the
 *  next one, rather than grading them. */
export function CareerRoadmapTimeline({
  roadmap,
  people,
  onStepStatus,
  onBookPerson,
  onBookService,
}: {
  roadmap: CareerRoadmap
  /** The roadmap's full matched-alumni list — each stage card filters this
   *  down to its own relevantAlumniIds rather than fetching anything new. */
  people: AlumniHelper[]
  /** Resolves true when the change was saved, so the "Next up" strip only
   *  appears for a stage that really was marked done. */
  onStepStatus: (stepKey: string, status: CareerStageStatus) => Promise<boolean>
  onBookPerson: (person: AlumniHelper) => void
  onBookService: (service: AlumniService) => void
}) {
  // Live services for this roadmap's stages, sent with the roadmap itself.
  const services = roadmap.stageServices ?? []

  // Which stage's alumni list is open, if any. One at a time, so opening a
  // second stage's list closes the first rather than stacking modals.
  const [openFor, setOpenFor] = useState<string | null>(null)
  const openStage = roadmap.stages.find((s) => s.stepKey === openFor)
  const openStagePeople = openStage
    ? people.filter((p) => openStage.relevantAlumniIds.includes(p.id))
    : []

  // Same one-at-a-time rule for a stage's services.
  const [servicesFor, setServicesFor] = useState<string | null>(null)
  const servicesStage = roadmap.stages.find((s) => s.stepKey === servicesFor)

  // The "Next up" strip after a stage is marked done. Kept as keys, not
  // stage objects, so it always renders against the latest roadmap.
  const [nextUp, setNextUp] = useState<{ doneTitle: string; nextKey: string } | null>(null)
  const nextUpStage = nextUp ? roadmap.stages.find((s) => s.stepKey === nextUp.nextKey) : undefined

  async function changeStatus(stage: CareerStage, status: CareerStageStatus) {
    const ok = await onStepStatus(stage.stepKey, status)
    if (!ok) return
    if (status !== 'completed') {
      setNextUp(null)
      return
    }
    // `roadmap` here is from before the save, so treat this stage as done
    // when working out what comes next.
    const after = roadmap.stages.map((s) => (s.stepKey === stage.stepKey ? { ...s, status } : s))
    const next = nextStageAfter(after, stage.stepKey)
    setNextUp(next ? { doneTitle: stage.title, nextKey: next.stepKey } : null)
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
            <Map size={20} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink">Your Personalized Roadmap</h2>
            <p className="text-sm text-muted">
              A step-by-step plan to reach your goal, with support from the Rooman alumni network.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium text-muted">
          <Legend className="bg-green-500" label="Completed" />
          <Legend className="bg-brand" label="In Progress" />
          <Legend className="bg-gray-300" label="Upcoming" />
        </div>
      </div>

      {nextUp && nextUpStage && (
        <NextUpStrip
          doneTitle={nextUp.doneTitle}
          next={nextUpStage}
          serviceCount={servicesForStage(nextUpStage.relevantServiceIds, services).length}
          onSeePeople={() => setOpenFor(nextUpStage.stepKey)}
          onSeeServices={() => setServicesFor(nextUpStage.stepKey)}
          onDismiss={() => setNextUp(null)}
        />
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-0">
        {roadmap.stages.map((stage, i) => (
          <div key={stage.stepKey} className="flex flex-col lg:min-w-0 lg:flex-1 lg:flex-row lg:items-stretch">
            <StageCard
              stage={stage}
              index={i}
              isFirst={i === 0}
              isLast={i === roadmap.stages.length - 1}
              blockedBy={blockedBy(roadmap.stages, stage.stepKey)}
              serviceCount={servicesForStage(stage.relevantServiceIds, services).length}
              onStepStatus={(status) => void changeStatus(stage, status)}
              onShowPeople={() => setOpenFor(stage.stepKey)}
              onShowServices={() => setServicesFor(stage.stepKey)}
            />
            {i < roadmap.stages.length - 1 && (
              <span
                aria-hidden
                className="mx-auto h-4 w-px shrink-0 self-center border-l border-dashed border-gray-300 lg:mx-1 lg:h-px lg:w-4 lg:border-l-0 lg:border-t"
              />
            )}
          </div>
        ))}
      </div>

      {openStage && (
        <AlumniListModal
          people={openStagePeople}
          title={`Alumni who can help with “${openStage.title}”`}
          subtitle={`${openStagePeople.length} ${openStagePeople.length === 1 ? 'person matches' : 'people match'} this stage`}
          onClose={() => setOpenFor(null)}
          onBook={(p) => {
            onBookPerson(p)
            setOpenFor(null)
          }}
        />
      )}

      {servicesStage && (
        <StageServicesModal
          stage={servicesStage}
          services={servicesForStage(servicesStage.relevantServiceIds, services)}
          onClose={() => setServicesFor(null)}
          onBook={(s) => {
            onBookService(s)
            setServicesFor(null)
          }}
        />
      )}
    </Card>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  )
}

/** Shown after a stage is marked done: a nudge toward the people who can help
 *  with the next one. Stays until dismissed, so it isn't missed. */
function NextUpStrip({
  doneTitle,
  next,
  serviceCount,
  onSeePeople,
  onSeeServices,
  onDismiss,
}: {
  doneTitle: string
  next: CareerStage
  serviceCount: number
  onSeePeople: () => void
  onSeeServices: () => void
  onDismiss: () => void
}) {
  // Same count the stage card shows, so the two never disagree.
  const helpers = next.relevantAlumniIds.length

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-green-200 bg-green-50/60 px-4 py-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-green-500 text-white">
        <Check size={14} />
      </span>
      <p className="min-w-0 flex-1 text-sm text-ink">
        <span className="font-semibold">“{doneTitle}” done.</span> Next up:{' '}
        <span className="font-semibold">{next.title}</span>
        {helpers > 0 ? ` — ${alumniCount(helpers)} can help.` : '.'}
      </p>
      {/* People first — the network is the point. Services only when there's
          nobody to ask. */}
      {helpers > 0 ? (
        <Button variant="outline" className="!px-3 !py-1.5 !text-xs" icon={<Users size={12} />} onClick={onSeePeople}>
          See who
        </Button>
      ) : serviceCount > 0 ? (
        <Button variant="outline" className="!px-3 !py-1.5 !text-xs" icon={<Briefcase size={12} />} onClick={onSeeServices}>
          See services
        </Button>
      ) : null}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded-full p-1 text-muted hover:bg-surface hover:text-ink"
      >
        <X size={16} />
      </button>
    </div>
  )
}

function StageCard({
  stage,
  index,
  isFirst,
  isLast,
  blockedBy,
  serviceCount,
  onStepStatus,
  onShowPeople,
  onShowServices,
}: {
  stage: CareerStage
  index: number
  isFirst: boolean
  isLast: boolean
  /** Title of the earlier stage that still has to be finished, or null when
   *  this stage is open. The server enforces the same rule. */
  blockedBy: string | null
  /** How many of this stage's matched services are available to book. */
  serviceCount: number
  onStepStatus: (status: CareerStageStatus) => void
  onShowPeople: () => void
  onShowServices: () => void
}) {
  const { currentUser } = useApp()
  const Icon = isFirst ? Flag : isLast ? Target : stage.status === 'completed' ? Check : BookOpen
  const helpers = stage.relevantAlumniIds.length
  // An already-completed stage is never locked — reopening it stays available
  // so a member can correct a mistake.
  const locked = blockedBy !== null && stage.status !== 'completed'

  return (
    <div
      className={`flex w-full min-w-0 flex-1 flex-col items-center rounded-xl border p-3 text-center ${
        isLast
          ? 'border-indigo-100 bg-indigo-50/40'
          : stage.status === 'in_progress'
            ? 'border-brand/30 bg-brand-50/40'
            : 'border-line bg-surface'
      }`}
    >
      <div className="mb-2 flex w-full items-center justify-between">
        <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${BADGE[stage.status]}`}>
          {stage.status === 'completed' ? <Check size={13} /> : index + 1}
        </span>
        {(isFirst || isLast) ? (
          <span className={`text-[10px] font-semibold ${isLast ? 'text-indigo-600' : 'text-muted'}`}>
            {isFirst ? 'Current' : 'Target'}
          </span>
        ) : isMemberAdded(stage) ? (
          // The member's own stage, marked with their photo so it never reads
          // as something the AI suggested. Children ignore the pointer so the
          // hover shows this label rather than the avatar's own name tooltip.
          <span title="Added by you" aria-label="Added by you" className="[&_*]:pointer-events-none">
            <Avatar name={currentUser.name} src={currentUser.photo} size={18} />
          </span>
        ) : null}
      </div>

      <span className={`mb-2 grid h-9 w-9 place-items-center rounded-lg ${isLast ? 'bg-surface text-indigo-600' : 'bg-gray-50 text-muted'}`}>
        <Icon size={18} />
      </span>

      <p className="text-[13px] leading-tight font-semibold text-ink">{stage.title}</p>

      {stage.durationWeeks ? (
        <p className="mt-1 text-xs text-muted">{stage.durationWeeks} weeks</p>
      ) : null}

      {stage.status === 'completed' ? (
        <span className="mt-2 rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
          Completed
        </span>
      ) : helpers > 0 || serviceCount > 0 ? (
        // Who can help, then what can be booked — the network, before the work.
        <div className="mt-2 flex flex-wrap justify-center gap-1">
          {helpers > 0 && (
            <button
              onClick={onShowPeople}
              className="flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-brand-50 hover:text-brand"
              title={`See who: ${stage.title}`}
            >
              <Users size={11} />
              {alumniCount(helpers)} can help
            </button>
          )}
          {serviceCount > 0 && (
            <button
              onClick={onShowServices}
              className="flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-brand-50 hover:text-brand"
              title={`Services for: ${stage.title}`}
            >
              <Briefcase size={11} />
              {serviceCount} {serviceCount === 1 ? 'service' : 'services'}
            </button>
          )}
        </div>
      ) : null}

      {/* Progress control — the plan is the member's to drive, not a fixed
          script, so every non-bookend stage can be ticked off or paused.
          A stage whose predecessors are unfinished is locked instead: the
          server refuses it either way, so showing a live button here would
          only produce an error toast. */}
      {!isFirst && !isLast && (
        locked ? (
          <span
            title={`Finish "${blockedBy}" first — stages are completed in order.`}
            className="mt-2 flex cursor-not-allowed items-center gap-1 text-[11px] font-semibold text-gray-300"
          >
            <Lock size={11} />
            Locked
          </span>
        ) : (
          <button
            onClick={() => onStepStatus(stage.status === 'completed' ? 'upcoming' : 'completed')}
            className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
          >
            {stage.status === 'completed' ? <CircleDashed size={11} /> : <Check size={11} />}
            {stage.status === 'completed' ? 'Reopen' : 'Mark done'}
          </button>
        )
      )}

      {isFirst && <p className="mt-1.5 text-[11px] text-muted">You’re here</p>}
    </div>
  )
}

/** A stage's matched services, each bookable through the page's normal
 *  booking modal. Plain-div backdrop, same pattern as AlumniListModal — the
 *  shared Card component takes no onClick. */
function StageServicesModal({
  stage,
  services,
  onClose,
  onBook,
}: {
  stage: CareerStage
  services: AlumniService[]
  onClose: () => void
  onBook: (service: AlumniService) => void
}) {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">Services for “{stage.title}”</h2>
            <p className="text-xs text-muted">
              {services.length} {services.length === 1 ? 'alumnus offers' : 'alumni offer'} help with this stage
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto p-4">
          {services.map((s) => {
            const { icon: Icon, classes } = SERVICE_ICONS[s.serviceType] ?? SERVICE_ICONS.career_guidance
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${classes}`}>
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{serviceName(s)}</p>
                  <p className="truncate text-xs text-muted">
                    by {s.providerName ?? 'an alumnus'} · {servicePrice(s)}
                  </p>
                </div>
                <Button variant="outline" className="!px-3 !py-1.5 !text-xs" onClick={() => onBook(s)}>
                  Book
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
