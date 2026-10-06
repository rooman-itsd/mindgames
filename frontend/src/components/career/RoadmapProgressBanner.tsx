import { PartyPopper, Trophy } from 'lucide-react'
import { Button, Card } from '../ui'
import { roadmapProgress } from '../../lib/careerProgress'
import type { CareerRoadmap } from '../../types'

/**
 * Progress across the roadmap, and the congratulations when it is finished.
 *
 * Two states from one component because they are the same fact — how much of
 * the plan is done — and keeping them together means the "you're finished"
 * moment can never disagree with the bar right above it.
 *
 * "Finished" counts only the stages between the bookends: the first card is
 * where the member already was and the last is the goal itself, so neither is
 * work (see careerProgress.ts).
 */
export function RoadmapProgressBanner({
  roadmap,
  onFindAlumni,
}: {
  roadmap: CareerRoadmap
  /** Offered alongside the congratulations — finishing a plan is a good
   *  moment to mentor the next person, not a dead end. */
  onFindAlumni?: () => void
}) {
  const { total, done, percent, complete } = roadmapProgress(roadmap.stages)

  // Nothing workable in the plan (a two-stage roadmap) — a 0% bar would be
  // misleading, so say nothing at all.
  if (total === 0) return null

  if (complete) {
    return (
      <Card className="overflow-hidden border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-green-500 text-white">
            <PartyPopper size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-green-800">
              Congratulations — you finished your roadmap! 🎉
            </h2>
            <p className="mt-0.5 text-sm text-green-900/80">
              All {total} {total === 1 ? 'stage' : 'stages'} towards{' '}
              <span className="font-semibold">{roadmap.goal.targetRole || 'your goal'}</span> are
              complete. That is the whole plan, start to finish.
            </p>
          </div>
          {onFindAlumni && (
            <Button variant="outline" icon={<Trophy size={14} />} onClick={onFindAlumni}>
              Help someone else
            </Button>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-ink">
          Your progress
          <span className="ml-2 font-medium text-muted">
            {done} of {total} stages complete
          </span>
        </p>
        <span className="text-sm font-bold text-brand">{percent}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Roadmap progress"
      >
        <div
          className="h-full rounded-full bg-brand transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </Card>
  )
}
