import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock, X } from 'lucide-react'
import { Button } from '../ui'
import { DOMAINS } from '../../types'
import { isHttpUrl } from '../../lib/links'

/**
 * Captures how long a session actually ran, and what it covered.
 *
 * The duration is the point: profile hours, streaks and badges are all built
 * from it, and a "completed" session with no duration is exactly the shape a
 * session that happened somewhere else leaves behind. Confirmation happens
 * separately (mentee, or each attendee for a group session) before any of it
 * counts — `who` describes that in each case rather than assuming a single
 * mentee, since this modal now serves both a 1:1 session and a group one.
 */
export function CompleteSessionModal({
  topic,
  who,
  allowFollowUp = false,
  onClose,
  onConfirm,
}: {
  topic: string
  who: string
  /** 1:1 sessions only: lets the mentor set a task that needs evidence. */
  allowFollowUp?: boolean
  onClose: () => void
  onConfirm: (durationMinutes: number, domain: string, followUp?: { title: string; url: string }) => void
}) {
  const [minutes, setMinutes] = useState(60)
  const [domain, setDomain] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskUrl, setTaskUrl] = useState('')
  const [taskError, setTaskError] = useState('')

  function confirm() {
    const url = taskUrl.trim()
    // A title with no link would otherwise be dropped without a word — and the
    // session is locked once completed, so the task could never be added later.
    if (!url && taskTitle.trim()) {
      setTaskError('Add the task’s link, or clear the title to complete without a task.')
      return
    }
    if (!url) return onConfirm(minutes, domain)
    if (!isHttpUrl(url)) {
      setTaskError('The task link should start with http:// or https://')
      return
    }
    onConfirm(minutes, domain, { title: taskTitle.trim(), url })
  }

  const PRESETS = [30, 45, 60, 90]

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">Mark session completed</h2>
          <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          “{topic}” with {who}. They'll be asked to confirm it — once they do,
          it counts towards both your records.
        </p>

        <label className="mb-1.5 block text-xs font-semibold text-muted">How long did it run?</label>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {PRESETS.map((m) => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                minutes === m
                  ? 'border-brand bg-brand-50 text-brand'
                  : 'border-line text-ink hover:bg-gray-50'
              }`}
            >
              {m} min
            </button>
          ))}
          <span className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={600}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Math.min(600, Number(e.target.value) || 0)))}
              className="w-20 rounded-lg border border-line px-2 py-1.5 text-center text-sm outline-none focus:border-brand"
            />
            <span className="text-xs text-muted">min</span>
          </span>
        </div>

        <label className="mb-1.5 block text-xs font-semibold text-muted">What was it about? (optional)</label>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="mb-4 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        >
          <option value="">Not specified</option>
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {allowFollowUp && (
          <div className="mb-4 rounded-lg border border-line p-3">
            <p className="text-xs font-semibold text-ink">Follow-up task (optional)</p>
            <p className="mb-2 text-xs text-muted">
              Something for {who} to do after the session. They'll submit a link as evidence.
            </p>
            <input
              value={taskTitle}
              onChange={(e) => { setTaskTitle(e.target.value); setTaskError('') }}
              placeholder="Task — e.g. Build a small RAG demo"
              maxLength={160}
              className="mb-2 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <input
              value={taskUrl}
              onChange={(e) => { setTaskUrl(e.target.value); setTaskError('') }}
              placeholder="Link to the brief — https://…"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
            />
            {taskError && <p className="mt-1.5 text-xs font-semibold text-red-600">{taskError}</p>}
          </div>
        )}

        <p className="mb-4 flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-muted">
          <Clock size={13} className="shrink-0" />
          {minutes} minutes will be added to your mentoring hours once {who} confirms.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm}>Mark completed</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
