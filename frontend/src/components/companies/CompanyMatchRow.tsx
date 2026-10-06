import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { CompanyLogo, cx } from '../ui'
import type { RankedCompany } from '../../lib/companyMatch'

// One company in the ranked list.
//
// A row, not a card. These are ranked against each other, and a grid of boxes
// reads as a set of unordered options — the eye has to hunt for the order.
// Rows stacked under a rank number read as a leaderboard, which is what this
// actually is. It also lets the reasons run full-width instead of being
// truncated to fit a third of the screen.
//
// The separator is a bottom border rather than a bordered box, so the section
// carries no visual weight of its own above the directory it sits on top of.
export function CompanyMatchRow({
  ranked,
  rank,
  selected,
  onToggleSelect,
  last,
}: {
  ranked: RankedCompany
  rank: number
  selected: boolean
  onToggleSelect: () => void
  /** The final row drops its separator, so the list does not end in a line. */
  last?: boolean
}) {
  const { company, match } = ranked
  // Four pips instead of a number-only readout: the eye gets the magnitude
  // without having to compare two-digit numbers down the column.
  const pips = Math.round((match.score / 100) * 4)

  return (
    <div
      className={cx(
        'flex items-start gap-3 py-3 transition-colors sm:gap-4',
        !last && 'border-b border-line',
      )}
    >
      <span className="w-4 shrink-0 pt-1 text-right text-sm font-bold text-gray-300 tabular-nums">
        {rank}
      </span>

      <CompanyLogo name={company.name} logoUrl={company.logoUrl} size={36} />

      <div className="min-w-0 flex-1">
        <Link
          to={`/companies/${company.id}`}
          className="font-bold text-ink hover:text-brand hover:underline"
        >
          {company.name}
        </Link>

        {/* The reasons, full width — the point of a row over a box. */}
        <p className="mt-0.5 text-sm text-muted">
          {match.reasons.length > 0
            ? match.reasons.map((r) => r.detail).join(' · ')
            : match.confidenceNote}
        </p>

        <p className="mt-0.5 text-xs text-muted">
          {company.industry} · {company.alumniCount} alumn{company.alumniCount === 1 ? 'us' : 'i'}
          {company.signals.roadmapCount > 0 && (
            <>
              {' · '}
              <Link
                to={`/companies/${company.id}/roadmaps`}
                className="font-semibold text-brand hover:underline"
              >
                {company.signals.roadmapCount} roadmap
                {company.signals.roadmapCount > 1 ? 's' : ''}
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-lg font-bold text-ink tabular-nums">{match.score}</span>
        <span className="flex gap-0.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cx('h-1.5 w-1.5 rounded-full', i < pips ? 'bg-brand' : 'bg-line')}
            />
          ))}
        </span>
        <button
          onClick={onToggleSelect}
          aria-pressed={selected}
          className={cx(
            'mt-0.5 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors',
            selected
              ? 'border-brand bg-brand text-white'
              : 'border-line text-muted hover:border-brand hover:text-brand',
          )}
        >
          {selected && <Check size={10} />}
          {selected ? 'Added' : 'Compare'}
        </button>
      </div>
    </div>
  )
}
