import { useCallback, useEffect, useState } from 'react'
import { HandHeart } from 'lucide-react'
import { api } from '../../lib/api'
import { appendPage } from '../../lib/learningHub'
import type { LearningShare } from '../../types'
import { GivenToMentees } from './GivenToMentees'
import { ShareCard } from './ShareCard'
import { CardGrid, LoadMore, SectionHeader } from './SectionHeader'

const PAGE = 20

/**
 * What this member has given the network, and what it did: each card carries
 * its own "helped N members" count, which is the only thanks the page keeps.
 * Below them, for mentors, what they gave their mentees (GivenToMentees).
 */
export function MySharesView({
  onShare,
  onSavedChange,
  canShare,
}: {
  onShare: () => void
  onSavedChange: (delta: 1 | -1) => void
  /** False when there is no stage to share for (no roadmap, no role topics):
   *  the share form would open with nothing to pick, so no button. */
  canShare: boolean
}) {
  const [rows, setRows] = useState<LearningShare[] | null>(null)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const loadPage = useCallback(async (after?: LearningShare) => {
    setLoading(true)
    try {
      const page = await api.getMyShares(after)
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

  const update = (next: LearningShare) => setRows((prev) => prev?.map((r) => (r.id === next.id ? next : r)) ?? prev)
  const drop = (id: string) => setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev)
  const helped = (rows ?? []).reduce((n, r) => n + r.helpedCount, 0)

  return (
    <section>
      <SectionHeader
        icon={<HandHeart size={18} />}
        title="What I've shared"
        sub={helped > 0 ? `Your shares have helped ${helped} ${helped === 1 ? 'member' : 'members'}.` : 'What you have given back to the network.'}
      />
      {failed && <p className="mb-3 text-sm text-red-600">Could not load what you shared.</p>}
      {rows === null && !failed && <p className="text-sm text-[#878a8c]">Loading…</p>}
      {rows && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#edeff1] bg-white p-4">
          <p className="text-sm font-semibold text-[#1c1c1c]">You haven't shared anything yet.</p>
          <p className="mt-0.5 text-xs text-[#878a8c]">
            One link and a sentence on why it helped is enough to save someone behind you a week.
          </p>
          {canShare ? (
            <button onClick={onShare} className="mt-2 text-xs font-semibold text-[#ff4500] hover:underline">
              Share what helped you →
            </button>
          ) : (
            <p className="mt-2 text-xs text-[#878a8c]">
              Build your career roadmap to share for its stages.
            </p>
          )}
        </div>
      )}
      {rows && rows.length > 0 && (
        <CardGrid>
          {rows.map((r) => (
            <ShareCard key={r.id} share={r} onChange={update} onRemoved={drop} onSavedChange={onSavedChange} mine />
          ))}
        </CardGrid>
      )}
      {more && rows && <LoadMore loading={loading} onClick={() => void loadPage(rows[rows.length - 1])} />}
      {/* As a mentor: what you gave your mentees, and who it went to. */}
      <GivenToMentees />
    </section>
  )
}
