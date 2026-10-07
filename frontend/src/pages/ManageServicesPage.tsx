import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Briefcase } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { ManageServicesPanel } from '../components/career/ManageServicesPanel'

/**
 * Managing the services you offer, on its own route
 * (/career-guidance/services).
 *
 * Same reasoning as the assessment and roadmap screens: adding, editing and
 * deleting a listing is its own job, and stacking it on top of the roadmap
 * meant the thing you were editing and the thing you were reading shared a
 * column.
 *
 * The panel component is unchanged and still renders inline inside Mentor
 * Space — this page just wraps it, so both surfaces stay in step.
 */
export function ManageServicesPage() {
  const { currentUser } = useApp()
  const navigate = useNavigate()

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

  // Listing a service is gated on being an approved mentor (the server
  // enforces it too). Replace rather than push, so Back from the roadmap
  // page doesn't land here again.
  useEffect(() => {
    if (!currentUser.isMentor) navigate('/career-guidance', { replace: true })
  }, [currentUser.isMentor, navigate])

  if (!currentUser.isMentor) return null

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
          <Briefcase size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-ink">Services you offer</h1>
          <p className="text-sm text-muted">
            Add, edit, pause or remove what you provide to other members.
          </p>
        </div>
      </div>

      <ManageServicesPanel hideHeading onClose={back} />
    </div>
  )
}
