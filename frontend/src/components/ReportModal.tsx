import { useState } from 'react'
import { Flag, X, Link as LinkIcon } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../store/AppStore'
import { Button } from './ui'

/** Flag a post or member for the admin team with optional evidence. */
export function ReportModal({
  targetType,
  targetId,
  targetLabel,
  onClose,
}: {
  targetType: 'post' | 'user'
  targetId: string
  targetLabel: string
  onClose: () => void
}) {
  const { notify } = useApp()
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [sending, setSending] = useState(false)

  async function submit() {
    if (reason.trim().length < 3) return
    setSending(true)
    try {
      const r = await api.report(targetType, targetId, reason.trim(), evidence.trim() || undefined)
      notify(
        r.already
          ? 'You already reported this — the admin team is on it.'
          : 'Report sent. The admin team will review it.',
        'info',
      )
      onClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not send the report.', 'error')
      setSending(false)
    }
  }

  const canSubmit = reason.trim().length >= 3 && !sending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-slidein w-full max-w-md rounded-2xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Flag size={17} className="text-red-500" />
            <h2 className="font-bold text-ink">Report {targetType}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-muted">
            Reporting <span className="font-semibold text-ink">{targetLabel}</span>. Only the
            Rooman admin team sees this.
          </p>

          <div>
            <label className="mb-2 block text-sm font-medium text-ink">What's the issue?</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="Describe what happened (spam, harassment, fake job offer, scam, etc.)"
              className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <p className="mt-1 text-xs text-muted">{reason.length}/500 characters</p>
          </div>

          {targetType === 'user' && (
            <div>
              <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink">
                <LinkIcon size={14} />
                Evidence (optional)
              </label>
              <textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value.slice(0, 500))}
                rows={2}
                placeholder="Links to fake job posts, screenshots, profile links that confirm the issue..."
                className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <p className="mt-1 text-xs text-muted">Paste links or describe evidence that supports your report</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button disabled={!canSubmit} onClick={submit} loading={sending}>
            {sending ? 'Sending…' : 'Send report'}
          </Button>
        </div>
      </div>
    </div>
  )
}
