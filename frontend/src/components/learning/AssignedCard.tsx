import { useState } from 'react'
import { CircleCheck, ExternalLink, Link2, UserRound } from 'lucide-react'
import { api } from '../../lib/api'
import { isHttpUrl } from '../../lib/links'
import { KIND_LABEL, assignmentOrigin, displayLink, submissionState } from '../../lib/learningHub'
import { useApp } from '../../store/AppStore'
import type { CareerResource } from '../../types'
import { KindBadge, KindIcon } from './KindIcon'

/** career_resources.kind → the hub's kind, for the icon and badge. */
const toHubKind = (kind: string) => (kind === 'other' || kind === 'book' ? 'link' : kind)

/**
 * Something a mentor gave the member: before a session, after it, or
 * directly. Shows who it is from (name only — no photos in lists) and, when
 * the mentor asked for proof, a box to send the work back.
 */
export function AssignedCard({
  resource,
  onChange,
}: {
  resource: CareerResource
  onChange: (next: CareerResource) => void
}) {
  const { notify } = useApp()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const kind = toHubKind(resource.kind)
  const state = submissionState(resource)

  const submit = async () => {
    const url = draft.trim()
    if (!isHttpUrl(url)) {
      notify('Paste a link that starts with http:// or https://', 'error')
      return
    }
    setSending(true)
    try {
      onChange(await api.submitCareerResource(resource.id, url))
      setDraft('')
      notify('Submitted — your mentor has been notified.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not submit that.', 'error')
    }
    setSending(false)
  }

  return (
    <article className="flex h-full flex-col rounded-xl border border-line bg-surface p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <KindIcon kind={kind} />
        <KindBadge kind={kind} label={KIND_LABEL[kind] ?? 'Link'} />
      </div>

      <h3 className="mt-3 line-clamp-2 text-sm font-bold text-ink">{resource.title}</h3>
      {resource.note && <p className="mt-1 line-clamp-2 text-xs text-muted">{resource.note}</p>}
      {resource.url && (
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex min-w-0 items-center gap-1 text-[11px] text-muted hover:text-brand"
        >
          <Link2 size={11} className="shrink-0" />
          <span className="truncate">{displayLink(resource.url)}</span>
          <ExternalLink size={10} className="shrink-0" />
        </a>
      )}

      <div className="mt-auto pt-3">
        <p className="flex items-center gap-1 text-[11px] text-muted">
          <UserRound size={11} className="shrink-0" />
          <span className="truncate">
            By <span className="font-semibold text-ink">{resource.ownerName ?? 'your mentor'}</span>
            {' · '}
            {assignmentOrigin(resource)}
          </span>
        </p>

        {state === 'needed' && (
          <div className="mt-2 flex gap-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Link to your work"
              aria-label={`Your work for ${resource.title}`}
              className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1 text-xs"
            />
            <button
              onClick={() => void submit()}
              disabled={sending || !draft.trim()}
              className="rounded-lg bg-brand px-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Submit
            </button>
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-md border border-brand/40 px-2 py-0.5 text-[11px] font-semibold text-brand">
            Assigned
          </span>
          {state === 'submitted' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700">
              <CircleCheck size={12} /> Submitted
            </span>
          )}
          {state === 'needed' && <span className="text-[11px] text-muted">Send your work back</span>}
        </div>
      </div>
    </article>
  )
}
