import { useCallback, useEffect, useState } from 'react'
import { Bookmark, BookmarkMinus, ExternalLink } from 'lucide-react'
import { api } from '../../lib/api'
import { appendPage, displayLink } from '../../lib/learningHub'
import { useApp } from '../../store/AppStore'
import type { CareerResource } from '../../types'
import { KindIcon } from './KindIcon'
import { LoadMore, SectionHeader } from './SectionHeader'

const PAGE = 20

/** career_resources.kind → the icon this page uses for it. */
const iconKind = (kind: string) =>
  ({ video: 'tutorial', book: 'article', other: 'article' } as Record<string, string>)[kind] ?? kind

/**
 * Saved Resources — a plain list of what the member kept. No grouping, no
 * stages: each row is the thing, who recommended it, and a way to remove it.
 * Pressing the save icon on any card puts it here.
 */
export function SavedList({ onCountChange }: { onCountChange: (delta: number) => void }) {
  const { notify } = useApp()
  const [rows, setRows] = useState<CareerResource[] | null>(null)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const loadPage = useCallback(async (after?: CareerResource) => {
    setLoading(true)
    try {
      const page = await api.getCareerResources(undefined, {
        limit: PAGE,
        after: after?.id,
        afterAt: after?.createdAt,
        saved: true,
      })
      setRows((prev) => (after ? appendPage(prev ?? [], page) : page))
      setMore(page.length === PAGE)
      setFailed(false)
    } catch {
      setFailed(true)
      setMore(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  const remove = async (r: CareerResource) => {
    setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? prev)
    try {
      // A saved alum share goes through unsave, so its "saved by" count drops
      // with it; anything else is the member's own row.
      if (r.shareId) await api.unsaveShare(r.shareId)
      else await api.deleteCareerResource(r.id)
      onCountChange(-1)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not remove that.', 'error')
      void loadPage()
    }
  }

  return (
    <section>
      <SectionHeader icon={<Bookmark size={18} />} title="Saved Resources" sub="What you kept, newest first." />
      {failed && <p className="mb-3 text-sm text-red-600">Could not load your saved resources.</p>}
      {rows === null && !failed && <p className="text-sm text-muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-line bg-surface p-4 text-sm text-muted">
          Nothing saved yet. Press the save icon on any resource and it will appear here.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
              <KindIcon kind={iconKind(r.kind)} size={32} />
              <div className="min-w-0 flex-1">
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm font-semibold text-ink hover:text-brand"
                  >
                    <span className="truncate">{r.title}</span>
                    <ExternalLink size={11} className="shrink-0" />
                  </a>
                ) : (
                  <span className="block truncate text-sm font-semibold text-ink">{r.title}</span>
                )}
                <p className="truncate text-[11px] text-muted">
                  {r.sharedByName ? `Recommended by ${r.sharedByName}` : 'Saved by you'}
                  {r.url ? ` · ${displayLink(r.url)}` : ''}
                </p>
              </div>
              <button
                onClick={() => void remove(r)}
                aria-label={`Remove ${r.title} from saved`}
                title="Remove from saved"
                className="shrink-0 rounded-full p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
              >
                <BookmarkMinus size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {more && rows && <LoadMore loading={loading} onClick={() => void loadPage(rows[rows.length - 1])} />}
    </section>
  )
}
