import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../store/AppStore'
import type { CareerResource } from '../../types'

/**
 * "Ask to resubmit" — the mentor's side of correcting work sent back (a wrong
 * link, the wrong file, not enough). Reopens the submission for the mentee and
 * notifies them; the row flips back to "waiting for their work" through
 * submissionState. Shown wherever a mentor sees work sent back.
 */
export function ResubmitButton({
  resource,
  onChange,
}: {
  resource: CareerResource
  onChange: (next: CareerResource) => void
}) {
  const { notify } = useApp()
  const [busy, setBusy] = useState(false)

  const ask = async () => {
    if (!window.confirm(`Ask ${resource.assignedToName ?? 'them'} to send "${resource.title}" again?`)) return
    setBusy(true)
    try {
      onChange(await api.requestResubmission(resource.id))
      notify('Asked them to send it again.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not ask for that.', 'error')
    }
    setBusy(false)
  }

  return (
    <button
      type="button"
      onClick={() => void ask()}
      disabled={busy}
      className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline disabled:opacity-50"
    >
      <RotateCcw size={11} /> Ask to resubmit
    </button>
  )
}
