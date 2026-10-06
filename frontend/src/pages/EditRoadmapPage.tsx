import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../store/AppStore'
import { EditRoadmapPanel } from '../components/career/EditRoadmapPanel'
import type { CareerRoadmap } from '../types'
import { SkeletonPage } from '../components/ui/Skeleton'

/**
 * Roadmap editing on its own route (/career-guidance/roadmap/edit).
 *
 * Previously this opened as a panel stacked above the live timeline, so the
 * plan being edited and the plan being read were on screen at once and the
 * other edit surfaces sat right beside it. On its own screen there is one
 * job, and the panel's change summary says what saving will do.
 */
export function EditRoadmapPage() {
  const { notify } = useApp()
  const navigate = useNavigate()

  const [roadmap, setRoadmap] = useState<CareerRoadmap | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .getCareerRoadmap()
      .then(setRoadmap)
      .catch((err) =>
        notify(err instanceof Error ? err.message : 'Could not load your roadmap.', 'error'),
      )
      .finally(() => setLoading(false))
  }, [notify])

  // Leaving an edit screen takes its history entry with it, otherwise the
  // browser's Back button walks straight back into the editor just left.
  // Popped rather than replaced: replacing left /career-guidance in history
  // twice in a row, so the first browser Back appeared to do nothing. See the
  // same handler in CareerAssessmentPage for the full reasoning.
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/career-guidance', { replace: true })
  }

  // There is nothing to edit before the assessment has been taken. Replace
  // rather than push, so Back from the roadmap page doesn't bounce straight
  // into this dead end again.
  useEffect(() => {
    if (!loading && !roadmap) navigate('/career-guidance', { replace: true })
  }, [loading, roadmap, navigate])

  if (loading || !roadmap) {
    return (
      <SkeletonPage />
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex items-start gap-2">
        <button
          onClick={back}
          className="mt-1 rounded-full p-1 text-muted hover:bg-gray-100"
          aria-label="Back to your roadmap"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
          <SlidersHorizontal size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-ink">Edit your roadmap</h1>
          <p className="text-sm text-muted">
            Working on <span className="font-semibold text-ink">{roadmap.goal.targetRole || 'your goal'}</span> ·{' '}
            {roadmap.stages.length} {roadmap.stages.length === 1 ? 'stage' : 'stages'}
          </p>
        </div>
      </div>

      <EditRoadmapPanel
        roadmap={roadmap}
        hideHeading
        onClose={back}
        onSaved={() => {
          /* The roadmap page refetches on mount, so there is nothing to hand
             back — the panel navigates away immediately after this. */
        }}
      />
    </div>
  )
}
