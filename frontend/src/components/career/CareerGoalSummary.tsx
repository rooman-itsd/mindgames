import { ArrowRight, CalendarDays, Clock, Target, Users } from 'lucide-react'
import type { CareerRoadmap } from '../../types'
import { SUPPORT_PREFERENCES } from '../../types'

/** The goal banner at the top of the roadmap: where they are, where they're
 *  going, and the three constraints the plan was built around. */
export function CareerGoalSummary({
  roadmap,
  supportPreference,
}: {
  roadmap: CareerRoadmap
  supportPreference: string
}) {
  const support = SUPPORT_PREFERENCES.find((s) => s.value === supportPreference)

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50 p-5">
      {/* The facts strip is fixed-width and does not shrink; the goal column
          takes the rest and has a floor. Previously both sides were free to
          size themselves, so a long support label grew the strip until the
          goal had a few pixels left and wrapped one word per line. */}
      {/* Row layout only from xl. At lg the left sidebar still takes 276px,
          so a row here left the goal column too narrow to fit a job title. */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-3 xl:basis-[320px]">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-brand shadow-sm">
            <Target size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted">Your goal</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-lg leading-snug font-bold text-ink">
              <span>{roadmap.goal.currentRole || 'Your current role'}</span>
              <ArrowRight size={16} className="shrink-0 text-brand" />
              <span>{roadmap.goal.targetRole || 'Still exploring'}</span>
            </p>
            <p className="mt-0.5 text-sm text-muted">
              A plan built from your profile, skills and the time you have.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:shrink-0 xl:gap-6 xl:border-l xl:border-brand-100 xl:pl-6">
          <Fact icon={<CalendarDays size={16} />} label="Target" value={`${roadmap.timelineMonths} months`} />
          <Fact icon={<Clock size={16} />} label="Weekly time" value={`${roadmap.hoursPerWeek} hours/week`} />
          <Fact
            icon={<Users size={16} />}
            label="Support preference"
            value={support?.short ?? 'Alumni help'}
            title={support?.label}
          />
        </div>
      </div>
    </div>
  )
}

function Fact({
  icon,
  label,
  value,
  title,
}: {
  icon: React.ReactNode
  label: string
  value: string
  /** Full text when `value` is an abbreviated form, shown on hover. */
  title?: string
}) {
  return (
    <div className="flex items-start gap-2 xl:w-[150px]" title={title}>
      <span className="mt-0.5 shrink-0 text-brand">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium whitespace-nowrap text-muted">{label}</p>
        <p className="text-sm leading-snug font-bold text-ink">{value}</p>
      </div>
    </div>
  )
}
