import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe } from 'lucide-react'
import { api } from '../../lib/api'
import { appendPage, isFiltering } from '../../lib/learningHub'
import type { BrowseFilters, LearningShare } from '../../types'
import { ShareCard } from './ShareCard'
import { CardGrid, LoadMore, SectionHeader } from './SectionHeader'

const PAGE = 20
/** Filters and the search box settle for this long before a request goes out,
 *  so typing "kubernetes" or ticking three boxes in a row is one request. */
const DEBOUNCE_MS = 300

/**
 * "All Resources" — everything shared across the whole network, roadmap or
 * not, narrowed by the search box and the Filter-by panel. The filtering
 * happens on the server, 20 at a time; this only ever holds what is on screen.
 */
export function BrowseView({
  filters,
  onClearFilters,
  onSavedChange,
}: {
  filters: BrowseFilters
  onClearFilters: () => void
  onSavedChange: (delta: 1 | -1) => void
}) {
  const [items, setItems] = useState<LearningShare[] | null>(null)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  // The cards on screen answer an older search while a newer one is on its
  // way — dimmed then, so they don't read as results for what was just typed.
  const [stale, setStale] = useState(false)
  // The filters a response was asked for: an answer to an older set is dropped.
  const asked = useRef('')

  const key = JSON.stringify(filters)

  const loadPage = useCallback(async (f: BrowseFilters, after: LearningShare | undefined, signal?: AbortSignal) => {
    const k = JSON.stringify(f)
    setLoading(true)
    try {
      const page = await api.browseLearning(f, after, signal)
      if (asked.current !== k) return
      setItems((prev) => (after ? appendPage(prev ?? [], page) : page))
      setMore(page.length === PAGE)
      setFailed(false)
      setStale(false)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      if (asked.current === k) {
        setFailed(true)
        setMore(false)
        setStale(false)
      }
    } finally {
      if (asked.current === k) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const f = JSON.parse(key) as BrowseFilters
    asked.current = key
    setStale(true)
    const ctrl = new AbortController()
    const t = setTimeout(() => void loadPage(f, undefined, ctrl.signal), DEBOUNCE_MS)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [key, loadPage])

  const update = (next: LearningShare) => setItems((prev) => prev?.map((x) => (x.id === next.id ? next : x)) ?? prev)
  const drop = (id: string) => setItems((prev) => prev?.filter((x) => x.id !== id) ?? prev)
  const filtering = isFiltering(filters)

  return (
    <section>
      <SectionHeader
        icon={<Globe size={18} />}
        title="All Resources"
        sub={
          filtering
            ? 'Matching your search and filters, most helpful first.'
            : 'Everything members have shared across the network, most helpful first.'
        }
      />
      {failed && <p className="mb-3 text-sm text-red-600">Could not load resources.</p>}
      {items === null && !failed && <p className="text-sm text-muted">Loading…</p>}
      {items && items.length === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-4 text-sm text-muted">
          {filtering ? (
            <>
              Nothing matches these filters yet.{' '}
              <button onClick={onClearFilters} className="font-semibold text-brand hover:underline">
                Clear filters
              </button>
            </>
          ) : (
            'Nothing has been shared yet. Members share what helped them from the strip above.'
          )}
        </div>
      )}
      {items && items.length > 0 && (
        <div aria-busy={stale} className={stale ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <CardGrid>
          {items.map((s) => (
            <ShareCard key={s.id} share={s} onChange={update} onRemoved={drop} onSavedChange={onSavedChange} />
          ))}
          </CardGrid>
        </div>
      )}
      {more && items && (
        <LoadMore loading={loading} onClick={() => void loadPage(filters, items[items.length - 1])} />
      )}
    </section>
  )
}
