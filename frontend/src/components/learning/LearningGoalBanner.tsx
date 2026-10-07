import { Link } from 'react-router-dom'
import { ArrowRight, Calendar, Clock, HandHelping, Target } from 'lucide-react'
import { monthsLabel, stepPosition, supportLabel } from '../../lib/learningHub'
import type { LearningRoadmapSummary } from '../../types'

/**
 * "Your current learning goal" — built entirely from the overview response
 * the page already has; no request of its own.
 */
export function LearningGoalBanner({
  roadmap,
  currentStepKey,
  supportPreference,
}: {
  roadmap: LearningRoadmapSummary | null
  currentStepKey: string | null
  supportPreference: string | null
}) {
  if (!roadmap) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand">
            <Target size={20} />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">Set your learning goal</p>
            <p className="text-xs text-muted">
              Build your career roadmap and we'll recommend resources and projects for each stage.
            </p>
          </div>
        </div>
        <Link
          to="/career-guidance/assessment"
          className="inline-flex items-center gap-1 rounded-lg border border-brand/40 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand-50"
        >
          Build my roadmap <ArrowRight size={12} />
        </Link>
      </section>
    )
  }

  const current = roadmap.stages.find((s) => s.stepKey === currentStepKey)
  const position = stepPosition(roadmap.stages, currentStepKey)
  const support = supportLabel(supportPreference)

  return (
    <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
      {/* basis-full below sm so the goal keeps a whole row to itself: squeezed
          beside the stats it truncated to "Deepen AWS and…", which is the one
          line on this banner that has to be readable. */}
      <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand">
          <Target size={22} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-muted">Your Current Learning Goal</p>
            {position && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand">
                Step {position.index} of {position.total}
              </span>
            )}
          </div>
          <p className="line-clamp-2 text-base font-bold text-ink">{current?.title ?? 'Roadmap complete'}</p>
          <p className="truncate text-xs text-muted">
            From your career goal: {roadmap.goal.currentRole || 'Today'} → {roadmap.goal.targetRole || 'your next role'}
          </p>
        </div>
      </div>

      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <Stat icon={<Calendar size={14} />} label="Timeline" value={monthsLabel(roadmap.timelineMonths)} />
        <Stat icon={<Clock size={14} />} label="Weekly time" value={`${roadmap.hoursPerWeek} hours/week`} />
        {support && <Stat icon={<HandHelping size={14} />} label="Support preference" value={support} />}
      </dl>

      <Link
        to="/career-guidance"
        className="inline-flex items-center gap-1 rounded-lg border border-brand/40 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand-50"
      >
        View roadmap <ArrowRight size={12} />
      </Link>
    </section>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted">{icon}</span>
      <div>
        <dt className="text-[10px] text-muted">{label}</dt>
        <dd className="font-semibold text-ink">{value}</dd>
      </div>
    </div>
  )
}
