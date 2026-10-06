import { useCallback, useEffect, useState } from 'react'
import { UserRound } from 'lucide-react'
import { api } from '../../lib/api'
import { appendPage } from '../../lib/learningHub'
import type { CareerResource } from '../../types'
import { AssignedCard } from './AssignedCard'
import { CardGrid, LoadMore, SectionHeader } from './SectionHeader'

const PAGE = 20

/**
 * "Assigned to You" — everything a mentor gave the member, before a session,
 * after it, or directly. The only place these appear on the page. 20 a page,
 * newest first, paged by the last row's id.
 */
export function AssignedView() {
  const [rows, setRows] = useState<CareerResource[] | null>(null)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const loadPage = useCallback(async (after?: CareerResource) => {
    setLoading(true)
    try {
      const page = await api.getLearningAssigned(after)
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

  const update = (next: CareerResource) => setRows((prev) => prev?.map((r) => (r.id === next.id ? next : r)) ?? prev)

  return (
    <section>
      <SectionHeader
        icon={<UserRound size={18} />}
        title="Assigned to You"
        sub="From your mentors — before a session, after it, or directly."
      />
      {failed && <p className="mb-3 text-sm text-red-600">Could not load what was assigned to you.</p>}
      {rows === null && !failed && <p className="text-sm text-muted">Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-line bg-surface p-4 text-sm text-muted">
          Nothing assigned yet. When a mentor shares something with you, it shows up here.
        </p>
      )}
      {rows && rows.length > 0 && (
        <CardGrid>
          {rows.map((r) => (
            <AssignedCard key={r.id} resource={r} onChange={update} />
          ))}
        </CardGrid>
      )}
      {more && rows && <LoadMore loading={loading} onClick={() => void loadPage(rows[rows.length - 1])} />}
    </section>
  )
}
