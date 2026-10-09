import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { api } from '../../lib/api'
import { isHttpUrl } from '../../lib/links'
import { useApp } from '../../store/AppStore'
import { Button } from '../ui'
import { AttachmentPicker } from '../ui/AttachmentPicker'
import { useAttachmentUploads } from '../../hooks/useAttachmentUploads'
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
 *
 * Laid out like Learning Resources' "Add a resource" (AddResourceForm), with
 * the fields an assignment has. On phones it opens as a sheet from the bottom.
 *
 * Opened from a stage of the mentee's roadmap, `stage` files it under that
 * stage of THEIR roadmap; the server checks the stage really is theirs.
 */
export function AssignResourceModal({
  menteeId,
  menteeName,
  stage,
  onClose,
}: {
  menteeId: string
  menteeName: string
  stage?: { roadmapId: string; stepKey: string; title: string }
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
  // Attachments go up as they are picked; Assign only sends their ids.
  const att = useAttachmentUploads()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const link = url.trim()
    if (!title.trim()) return setError('Give it a title.')
    if (link && !isHttpUrl(link)) return setError('Links start with http:// or https://')
    if (att.uploading) return setError('Wait for the files to finish uploading.')
    if (!link && !att.ready.length) return setError('Add a link or attach a file.')
    setSaving(true)
    setError('')
    try {
      await api.createCareerResource({
        title: title.trim(),
        url: link || undefined,
        fileIds: att.readyIds,
        note: note.trim() || undefined,
        kind,
        assignedTo: menteeId,
        roadmapId: stage?.roadmapId,
        stepKey: stage?.stepKey,
        requiresSubmission: proof,
      })
      att.claimed()
      notify(`Assigned to ${menteeName}.`)
      onClose()
    } catch (err) {
      att.recoverFrom(err)
      setError(err instanceof Error ? err.message : 'Could not assign that.')
      setSaving(false)
    }
  }

  return createPortal(
    // z-[100]: it can open on top of MenteeRoadmapModal, which sits at z-[100];
    // mounted later, this one wins the tie.
    <div
      className="fixed inset-0 z-[100] grid items-end bg-black/40 sm:place-items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assign-resource-title"
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
        <form onSubmit={submit}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="assign-resource-title" className="text-base font-bold text-ink">
                Assign a resource
              </h2>
              <p className="text-sm text-muted">To {menteeName} — shows in their Learning Resources.</p>
              {stage && <p className="text-sm text-ink">For stage: {stage.title}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                placeholder="e.g. AWS Well-Architected: the six pillars"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Link</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://… (optional if you attach files)"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </label>

            <div>
              <p className="mb-1.5 text-sm font-semibold text-ink">Attachments</p>
              <AttachmentPicker att={att} disabled={saving} />
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Why this helps</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="One or two sentences for them (optional)"
                className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-ink">Type</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as CareerResourceKind)}
                  className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm"
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-ink">Their work back</span>
                <select
                  value={proof ? 'yes' : 'no'}
                  onChange={(e) => setProof(e.target.value === 'yes')}
                  className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm"
                >
                  <option value="no">Not needed</option>
                  <option value="yes">Ask for their work</option>
                </select>
              </label>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Assign
              </Button>
            </div>
          </div>
        </form>
        <AssignedByMeList menteeId={menteeId} menteeName={menteeName} />
      </div>
    </div>,
    document.body,
  )
}
