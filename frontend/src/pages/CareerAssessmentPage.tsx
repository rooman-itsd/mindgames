import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../store/AppStore'
import { CareerAssessmentWizard } from '../components/career/CareerAssessmentWizard'
import type { CareerAssessment } from '../types'
import { SkeletonPage } from '../components/ui/Skeleton'

/**
 * The assessment on its own route (/career-guidance/assessment).
 *
 * It used to render inside the roadmap page, so starting it swapped the page
 * contents in place and sat in the same column as the other edit panels —
 * there was no sense of having gone somewhere. As a route it gets its own
 * screen, its own back button and its own browser history entry, so the
 * browser's Back works the way it does everywhere else in the app.
 */
export function CareerAssessmentPage() {
  const { notify } = useApp()
  const navigate = useNavigate()

  const [draft, setDraft] = useState<CareerAssessment | null>(null)
  const [last, setLast] = useState<CareerAssessment | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // The draft is what the wizard resumes from; the last submitted
    // assessment is what it compares against on the review step.
    Promise.all([api.getCareerDraft(), api.getLastCareerAssessment()])
      .then(([d, l]) => {
        setDraft(d)
        setLast(l)
      })
      .catch((err) =>
        notify(err instanceof Error ? err.message : 'Could not load your assessment.', 'error'),
      )
      .finally(() => setLoading(false))
  }, [notify])

  // Leaving an edit screen takes its history entry with it, otherwise the
  // browser's Back button walks straight back into the editor just left.
  //
  // Popping is not the same as replacing here. Replacing put /career-guidance
  // in the editor's slot while the hub was already the entry underneath, so
  // history held it twice and the first browser Back appeared to do nothing.
  // The hub is the only route that links here, so going back one entry always
  // lands there. idx 0 means the editor was opened directly in a fresh tab —
  // nothing to pop, so the hub takes that slot instead.
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/career-guidance', { replace: true })
  }

  if (loading) {
    return (
      <SkeletonPage />
    )
  }

  const retaking = !!last

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
          <ClipboardList size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {retaking ? 'Edit your assessment' : 'Career assessment'}
          </h1>
          <p className="text-sm text-muted">
            {retaking
              ? 'Change any answer, then review what it changes before your roadmap is rebuilt.'
              : 'A few questions about where you are and where you want to go. Saved after every step.'}
          </p>
        </div>
      </div>

      {retaking && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Submitting builds a <span className="font-semibold">new version</span> of your roadmap.
          Stage progress you have already marked is kept, but hand-edits to stages that no longer
          apply may not carry over.
        </p>
      )}

      <CareerAssessmentWizard
        initial={draft ?? last}
        previous={last}
        onCancel={back}
        onDone={() => {
          notify('Your roadmap is ready.', 'success')
          back()
        }}
      />
    </div>
  )
}
