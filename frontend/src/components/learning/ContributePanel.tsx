import { HandHeart, Users } from 'lucide-react'
import { waitingLabel } from '../../lib/learningHub'
import { Button } from '../ui'
import type { ContributeStage } from '../../types'

/**
 * The alum's half of the page: where members are waiting for help this member
 * can actually give.
 *
 * A member qualifies for a stage either because they have been through it
 * (their own completed roadmap stage) or because they already work in the role
 * it leads to. Gaps come first, so the ask lands where it matters most.
 *
 * A strip at the end of the main column, after the tabs: the right column on
 * this page is the Filter-by panel and Saved Resources. What the member has
 * already shared lives in the "I've shared" tab, not here.
 */
export function ContributePanel({
  stages,
  onShare,
}: {
  stages: ContributeStage[]
  onShare: (topicKey?: string) => void
}) {
  // Shares are filed only under the member's own roadmap stages, so 'members
  // are waiting' suggests only stages they have passed on it — not the stage
  // they are on, and not other roadmaps' stages for the role they hold.
  const gaps = stages.filter((s) => s.reason === 'passed' && s.sharesCount === 0 && s.membersWaiting > 0)
  const canHelp = stages.some((s) => s.reason === 'passed')

  return (
    <section className="rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 to-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-brand shadow-sm">
          <HandHeart size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">Help someone behind you</h2>
          <p className="text-xs text-muted">
            {canHelp
                ? 'Share what helped you get through a stage you have already passed.'
                : 'Found something useful on your path? Share it with everyone on that stage.'}
          </p>
        </div>
        <Button className="shrink-0" onClick={() => onShare()}>
          Share what helped you
        </Button>
      </div>

      {gaps.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {gaps.slice(0, 3).map((s) => (
            <li key={s.topicKey}>
              <button
                onClick={() => onShare(s.topicKey)}
                className="w-full rounded-lg border border-line bg-surface p-2 text-left hover:border-brand/40"
              >
                <span className="block truncate text-xs font-semibold text-ink">{s.title}</span>
                <span className="flex items-center gap-1 text-[11px] text-brand">
                  <Users size={10} /> {waitingLabel(s.membersWaiting)} · nothing shared yet
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

    </section>
  )
}
