import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, Clock, ExternalLink, GraduationCap, Link2, UserRound } from 'lucide-react'
import { api } from '../../lib/api'
import { KIND_LABEL, appendPage, assignmentOrigin, displayLink, resubmitRequested, submissionState } from '../../lib/learningHub'
import type { CareerResource } from '../../types'
import { KindBadge, KindIcon } from './KindIcon'
import { CardGrid, LoadMore } from './SectionHeader'
import { ShareFiles } from './ShareFiles'
import { ResubmitButton } from '../mentor/ResubmitButton'
import { EvidenceLink } from '../mentor/EvidenceLink'

const PAGE = 20
/** career_resources.kind → the hub's kind, for the icon and badge. */
const toHubKind = (kind: string) => (kind === 'other' || kind === 'book' ? 'link' : kind)

/**
 * "Given to your mentees" — the mentor's side of From my mentors, under
 * I've shared: everything this member handed a mentee (before a session,
 * after it, or directly), each with who it went to and whether their work
 * has come back. Private to the two of them; nothing here is public.
 * Renders nothing for a member who has never given anyone anything.
 */
export function GivenToMentees() {
  const [rows, setRows] = useState<CareerResource[] | null>(null)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadPage = useCallback(async (after?: CareerResource) => {
    setLoading(true)
    try {
      const page = await api.getLearningGiven(after)
      setRows((prev) => (after ? appendPage(prev ?? [], page) : page))
      setMore(page.length === PAGE)
    } catch {
      setRows((prev) => prev ?? [])
      setMore(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  if (!rows || rows.length === 0) return null

  return (
    <section className="mt-8">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink">
        <GraduationCap size={16} className="text-brand" /> Given to your mentees
      </h3>
      <p className="mb-3 text-xs text-muted">Only you and that mentee can see these.</p>
      <CardGrid>
        {rows.map((r) => (
          <GivenCard
            key={r.id}
            resource={r}
            onChange={(next) => setRows((prev) => prev?.map((x) => (x.id === next.id ? next : x)) ?? prev)}
          />
        ))}
      </CardGrid>
      {more && <LoadMore loading={loading} onClick={() => void loadPage(rows[rows.length - 1])} />}
    </section>
  )
}

function GivenCard({ resource, onChange }: { resource: CareerResource; onChange: (next: CareerResource) => void }) {
  const kind = toHubKind(resource.kind)
  const state = submissionState(resource)
  const asked = resubmitRequested(resource)
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
      {resource.attachments && resource.attachments.length > 0 && (
        <ShareFiles files={resource.attachments} fetchFile={(f) => api.getCareerResourceFile(resource.id, f)} />
      )}

      <div className="mt-auto pt-3">
        <p className="flex items-center gap-1 text-[11px] text-muted">
          <UserRound size={11} className="shrink-0" />
          <span className="truncate">
            Assigned to{' '}
            {resource.assignedToId ? (
              <Link to={`/profile/${resource.assignedToId}`} className="font-semibold text-ink hover:underline">
                {resource.assignedToName ?? 'your mentee'}
              </Link>
            ) : (
              <span className="font-semibold text-ink">{resource.assignedToName ?? 'your mentee'}</span>
            )}
            {' · '}
            {assignmentOrigin(resource)}
          </span>
        </p>
        {state === 'needed' && (
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted">
            <Clock size={12} /> {asked ? 'Asked them to send it again' : 'Waiting for their work'}
          </p>
        )}
        {/* The work sent back — and, after "Ask to resubmit", still the work
            they rejected, so it can be looked at again. */}
        {(state === 'submitted' || asked) && resource.submissionUrl && (
          <EvidenceLink
            resource={resource}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 hover:underline"
          >
            <CircleCheck size={12} /> {asked ? 'Previously sent — open it' : 'Work sent back — open it'}{' '}
            <ExternalLink size={10} />
          </EvidenceLink>
        )}
        {(state === 'submitted' || asked) && resource.submissionFiles && resource.submissionFiles.length > 0 && (
          <>
            {!resource.submissionUrl && (
              <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-green-700">
                <CircleCheck size={12} /> {asked ? 'Previously sent' : 'Work sent back'}
              </p>
            )}
            <ShareFiles files={resource.submissionFiles} fetchFile={(f) => api.getCareerResourceFile(resource.id, f)} />
          </>
        )}
        {state === 'submitted' && <ResubmitButton resource={resource} onChange={onChange} />}
      </div>
    </article>
  )
}
