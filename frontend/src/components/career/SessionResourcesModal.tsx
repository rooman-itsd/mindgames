import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock, ExternalLink, Link2, Trash2, X } from 'lucide-react'
import { Button, Card } from '../ui'
import { HttpError, api } from '../../lib/api'
import { assignedRelativeToSession, isSharedWithMe, shortStamp } from '../../lib/careerResources'
import { resubmitRequested, submissionState } from '../../lib/learningHub'
import { useApp } from '../../store/AppStore'
import type { CareerResource, CareerResourceKind } from '../../types'
import { ShareFiles } from '../learning/ShareFiles'
import { ResubmitButton } from '../mentor/ResubmitButton'

/**
 * Resources attached to one mentorship session.
 *
 * Two kinds, set at different moments:
 *   - prep: assigned while the session is live (offer, accept, or the form
 *     below). Just something to go through — never asks for evidence.
 *   - a follow-up task: set when the mentor completes the session. That is
 *     the only kind that asks the mentee to submit a link as evidence.
 * Once the session is over this is a read-only record for the mentor. The
 * mentee never adds; they read, and submit evidence for a follow-up task.
 */

const KINDS: CareerResourceKind[] = ['article', 'video', 'course', 'book', 'doc', 'other']

export function SessionResourcesModal({
  sessionId,
  topic,
  iAmMentor,
  canAdd,
  followUp = false,
  sessionAt,
  onClose,
}: {
  sessionId: string
  topic: string
  iAmMentor: boolean
  /** The mentor of a session that is upcoming or done — the only case with a
   *  form. (A declined session never happened, so it takes nothing.) */
  canAdd: boolean
  /** The session has happened: what is added now is a follow-up, which may
   *  ask the mentee to send work back. */
  followUp?: boolean
  /** The session's real scheduled instant, when it has one. */
  sessionAt?: string
  onClose: () => void
}) {
  const { currentUser, notify, setSessionResourceCount } = useApp()
  const [items, setItems] = useState<CareerResource[]>([])
  const [loading, setLoading] = useState(true)
  // Only true once a load succeeded — a failed load leaves items empty, and
  // syncing that as "0" would hide the card's Resources button.
  const [loaded, setLoaded] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<CareerResourceKind>('article')
  const [askProof, setAskProof] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await api.getCareerResources(sessionId))
      setLoaded(true)
    } catch {
      setError('Could not load resources.')
    }
    setLoading(false)
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  // The card behind this modal shows the count; keep it true as rows change.
  useEffect(() => {
    if (loaded) setSessionResourceCount(sessionId, items.length)
  }, [items.length, loaded, sessionId, setSessionResourceCount])

  const add = async () => {
    if (!title.trim() || !url.trim()) {
      setError('Add a title and a link.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const created = await api.createCareerResource({
        title: title.trim(),
        url: url.trim() || undefined,
        kind,
        sessionId,
        // Only after the session: a follow-up can ask for proof of work.
        requiresSubmission: followUp && askProof,
      })
      setItems((prev) => [created, ...prev])
      setTitle('')
      setUrl('')
      setAskProof(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not assign that.')
    }
    setSaving(false)
  }

  const remove = async (r: CareerResource) => {
    setItems((prev) => prev.filter((x) => x.id !== r.id))
    try {
      await api.deleteCareerResource(r.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that.')
      void load()
    }
  }

  const submit = async (r: CareerResource) => {
    const draft = (drafts[r.id] ?? '').trim()
    if (!draft) return
    setSubmitting(r.id)
    try {
      const updated = await api.submitCareerResource(r.id, draft)
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
      setDrafts((prev) => ({ ...prev, [r.id]: '' }))
      notify('Submitted — your mentor has been notified.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not submit that.', 'error')
      // 409: already sent elsewhere — reload so the row shows the evidence
      // instead of an input that fails every retry.
      if (e instanceof HttpError && e.status === 409) void load()
    }
    setSubmitting(null)
  }

  // The shared rule (lib/learningHub): files-only evidence counts too.
  const submittedCount = items.filter((r) => submissionState(r) === 'submitted').length
  const needsCount = items.filter((r) => r.requiresSubmission).length

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <Card className="max-h-[85vh] w-full max-w-lg overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink">Resources</h2>
            <p className="truncate text-sm text-muted">{topic}</p>
            {needsCount > 0 && (
              <p className="mt-1 text-xs font-semibold text-ink">
                {submittedCount} of {needsCount} submitted
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {canAdd && (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-line p-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              aria-label="Resource title"
              className="rounded-lg border border-line px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Link (required) — https://…"
                aria-label="Resource link"
                required
                className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm"
              />
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as CareerResourceKind)}
                aria-label="Resource type"
                className="rounded-lg border border-line px-2 py-2 text-sm"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k[0].toUpperCase() + k.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {/* Before the session it's prep — nothing to send back. After it,
                a follow-up can ask the mentee for their work. */}
            <div className="flex items-center justify-between gap-2">
              {followUp ? (
                <label className="flex items-center gap-2 text-xs text-ink">
                  <input type="checkbox" checked={askProof} onChange={(e) => setAskProof(e.target.checked)} />
                  Ask them to send back their work
                </label>
              ) : (
                <span className="text-xs text-muted">Prep for them to go through — no evidence asked.</span>
              )}
              <Button className="!px-3 !py-1.5 !text-xs" loading={saving} onClick={() => void add()}>
                Assign
              </Button>
            </div>
            {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {loading && <p className="text-sm text-muted">Loading…</p>}
          {!loading && items.length === 0 && (
            <p className="py-4 text-center text-sm text-muted">Nothing assigned.</p>
          )}
          {!canAdd && error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          {items.map((r) => {
            const mine = !isSharedWithMe(r, currentUser.id)
            const relative = assignedRelativeToSession(r.createdAt, sessionAt)
            return (
              <div key={r.id} className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gray-50 text-muted"><Link2 size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{r.title}</p>
                    {/* The link itself, spelled out — hiding it behind the
                        title left the mentee seeing only a name. */}
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <span className="truncate">{r.url}</span>
                        <ExternalLink size={11} className="shrink-0" />
                      </a>
                    ) : !r.attachments?.length ? (
                      <p className="mt-0.5 text-xs italic text-muted">No link attached</p>
                    ) : null}
                    {/* Files the mentor attached (the API allows them on
                        session resources too, with or without a link). */}
                    {r.attachments && r.attachments.length > 0 && (
                      <ShareFiles files={r.attachments} fetchFile={(f) => api.getCareerResourceFile(r.id, f)} />
                    )}
                    <p className="mt-1 text-[11px] text-muted" title={shortStamp(r.createdAt)}>
                      Assigned {relative ?? shortStamp(r.createdAt)}
                      {!mine && ` · by ${r.ownerName ?? 'your mentor'}`}
                    </p>
                  </div>
                  {/* A completed session's record (and anything already
                      answered) is locked server-side — no button to fail. */}
                  {canAdd && mine && !r.sessionLocked && (
                    <button
                      onClick={() => void remove(r)}
                      aria-label={`Remove ${r.title}`}
                      className="rounded-full p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                <div className="pl-9 text-xs">
                  {!r.requiresSubmission ? (
                    <span className="text-muted">No evidence needed</span>
                  ) : submissionState(r) === 'submitted' ? (
                    <div className="rounded-lg bg-green-50 px-2.5 py-2">
                      <p className="flex items-center gap-1 font-semibold text-green-700">
                        <CheckCircle2 size={13} />
                        {iAmMentor ? 'Their evidence' : 'Your evidence'}
                        {r.submissionAt && (
                          <span className="font-normal text-green-700/80">· submitted {shortStamp(r.submissionAt)}</span>
                        )}
                      </p>
                      {r.submissionUrl && (
                        <a
                          href={r.submissionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          // The mentor opening it ends the mentee's chance to swap it quietly.
                          onClick={() => iAmMentor && r.submissionAt && void api.markEvidenceSeen(r.id, r.submissionAt).catch(() => {})}
                          className="mt-1 flex min-w-0 items-center gap-1 text-blue-600 hover:underline"
                        >
                          <span className="truncate">{r.submissionUrl}</span>
                          <ExternalLink size={11} className="shrink-0" />
                        </a>
                      )}
                      {r.submissionFiles && r.submissionFiles.length > 0 && (
                        <ShareFiles files={r.submissionFiles} fetchFile={(f) => api.getCareerResourceFile(r.id, f)} />
                      )}
                      {iAmMentor && (
                        <ResubmitButton
                          resource={r}
                          onChange={(next) => setItems((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
                        />
                      )}
                    </div>
                  ) : iAmMentor ? (
                    <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                      <Clock size={13} /> {resubmitRequested(r) ? 'Asked to resubmit' : 'Evidence pending'}
                    </span>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        value={drafts[r.id] ?? ''}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="Paste your evidence link"
                        aria-label={`Evidence link for ${r.title}`}
                        className="min-w-0 flex-1 rounded-lg border border-line px-3 py-1.5 text-xs"
                      />
                      <Button className="!px-3 !py-1.5 !text-xs" loading={submitting === r.id} onClick={() => void submit(r)}>
                        Submit
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
