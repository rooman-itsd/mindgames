import { useEffect, useState } from 'react'
import { ExternalLink, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { displayLink, resubmitRequested, submissionState } from '../../lib/learningHub'
import { useApp } from '../../store/AppStore'
import type { CareerResource } from '../../types'
import { ShareFiles } from '../learning/ShareFiles'
import { ResubmitButton } from './ResubmitButton'

/**
 * The mentor's side of direct assignments: what they already gave this member
 * without a session, and the work sent back when they asked for it.
 *
 * Shown under the Assign form, so the place a mentor hands something over is
 * also where they see what came of it — and where the "X submitted"
 * notification (target 'assignment') sends them. Session resources are not
 * listed here: they have the session's own Resources view.
 */
export function AssignedByMeList({ menteeId, menteeName }: { menteeId: string; menteeName: string }) {
  const { notify } = useApp()
  const [rows, setRows] = useState<CareerResource[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    api
      .getAssignedByMe(menteeId)
      .then((r) => live && setRows(r))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [menteeId])

  const remove = async (r: CareerResource) => {
    if (!window.confirm(`Remove "${r.title}"? ${menteeName} will no longer see it.`)) return
    setBusy(r.id)
    try {
      await api.deleteCareerResource(r.id)
      setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? prev)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not remove that.', 'error')
    } finally {
      setBusy(null)
    }
  }

  if (failed) return <p className="mt-4 text-xs text-red-600">Could not load what you assigned before.</p>
  if (!rows || rows.length === 0) return null

  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="text-xs font-bold text-ink">Already assigned to {menteeName}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((r) => {
          const state = submissionState(r)
          return (
            <li key={r.id} className="rounded-lg border border-line p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-semibold text-ink hover:underline"
                    >
                      {r.title}
                    </a>
                  ) : (
                    <p className="truncate text-sm font-semibold text-ink">{r.title}</p>
                  )}
                  {r.stepTitle && <p className="truncate text-xs text-muted">For stage “{r.stepTitle}”</p>}
                  {r.attachments && r.attachments.length > 0 && (
                    <ShareFiles files={r.attachments} fetchFile={(f) => api.getCareerResourceFile(r.id, f)} />
                  )}
                  {state === 'submitted' && r.submissionUrl && (
                    <a
                      href={r.submissionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      // Opening it ends the mentee's chance to swap it quietly.
                      onClick={() => r.submissionAt && void api.markEvidenceSeen(r.id, r.submissionAt).catch(() => {})}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline"
                    >
                      Sent back: {displayLink(r.submissionUrl)} <ExternalLink size={11} />
                    </a>
                  )}
                  {/* Evidence files sit UNDER the "Sent back:" line, so they're
                      never mistaken for the mentor's own attachments above.
                      With no link, they get the label themselves. */}
                  {state === 'submitted' && r.submissionFiles && r.submissionFiles.length > 0 && (
                    <>
                      {!r.submissionUrl && <p className="mt-1 text-xs font-semibold text-green-700">Sent back:</p>}
                      <ShareFiles files={r.submissionFiles} fetchFile={(f) => api.getCareerResourceFile(r.id, f)} />
                    </>
                  )}
                  {state === 'submitted' && (
                    <ResubmitButton
                      resource={r}
                      onChange={(next) => setRows((prev) => prev?.map((x) => (x.id === next.id ? next : x)) ?? prev)}
                    />
                  )}
                  {state === 'needed' && (
                    <p className="mt-0.5 text-xs text-muted">
                      {resubmitRequested(r) ? 'Asked them to send it again' : 'Waiting for their work'}
                    </p>
                  )}
                </div>
                {/* Once they have sent work back, what was assigned is a record. */}
                {!r.sessionLocked && (
                  <button
                    onClick={() => void remove(r)}
                    disabled={busy === r.id}
                    aria-label={`Remove ${r.title}`}
                    title="Remove"
                    className="shrink-0 rounded-md p-1 text-muted hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
