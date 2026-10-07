import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { api } from '../../lib/api'
import { isHttpUrl } from '../../lib/links'
import { useApp } from '../../store/AppStore'
import { Button, Card } from '../ui'
import type { CareerResourceKind } from '../../types'
import { AssignedByMeList } from './AssignedByMeList'

const KINDS: { value: CareerResourceKind; label: string }[] = [
  { value: 'article', label: 'Article' },
  { value: 'doc', label: 'Documentation' },
  { value: 'video', label: 'Video' },
  { value: 'course', label: 'Course' },
  { value: 'book', label: 'Book' },
  { value: 'other', label: 'Link' },
]

/**
 * A mentor assigning a resource straight to one of their mentees — no session
 * needed. It lands in the mentee's "Assigned to You" with a notification; the
 * server checks the two have had an agreed session. Below the form, what the
 * mentor already assigned this member and any work sent back.
 */
export function AssignResourceModal({
  menteeId,
  menteeName,
  onClose,
}: {
  menteeId: string
  menteeName: string
  onClose: () => void
}) {
  const { notify } = useApp()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<CareerResourceKind>('article')
  const [proof, setProof] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!title.trim()) return setError('Give it a title.')
    if (!isHttpUrl(url.trim())) return setError('Add a link that starts with http:// or https://')
    setSaving(true)
    setError('')
    try {
      await api.createCareerResource({
        title: title.trim(),
        url: url.trim(),
        note: note.trim() || undefined,
        kind,
        assignedTo: menteeId,
        requiresSubmission: proof,
      })
      notify(`Assigned to ${menteeName}.`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not assign that.')
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <Card className="max-h-[85vh] w-full max-w-md overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink">Assign a resource</h2>
            <p className="truncate text-sm text-muted">To {menteeName} — shows in their Learning Resources.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            aria-label="Resource title"
            maxLength={160}
            className="rounded-lg border border-line px-3 py-2 text-sm"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Link (required) — https://…"
            aria-label="Resource link"
            className="rounded-lg border border-line px-3 py-2 text-sm"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for them (optional)"
            aria-label="Note"
            maxLength={1000}
            rows={2}
            className="rounded-lg border border-line px-3 py-2 text-sm"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CareerResourceKind)}
            aria-label="Resource type"
            className="rounded-lg border border-line px-3 py-2 text-sm"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-ink">
            <input type="checkbox" checked={proof} onChange={(e) => setProof(e.target.checked)} />
            Ask them to send back a link to their work
          </label>
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void submit()}>
              Assign
            </Button>
          </div>
        </div>
        <AssignedByMeList menteeId={menteeId} menteeName={menteeName} />
      </Card>
    </div>,
    document.body,
  )
}
