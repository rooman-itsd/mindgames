import { alumniCount } from '../../lib/format'
import {
  Briefcase,
  Building2,
  Code2,
  Layers,
  MapPin,
  Trophy,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CompanyLogo, cx } from '../ui'
import { MatchScoreRing } from './MatchScoreRing'
import { compareVerdict, type CompanyFactorKey, type RankedCompany } from '../../lib/companyMatch'

// Side-by-side comparison, as a popup.
//
// Each factor is an icon tile: the one-word name on top, the icon in a circle
// tinted by how well it scored, and the score underneath. The tile is read at a
// glance — colour for "is this good", number for "how good" — with the full
// sentence kept as a tooltip rather than printed, so three companies fit side
// by side without turning into a wall of text.
//
// Tint is a three-step scale, not a gradient: a continuous colour ramp reads as
// precision the score does not have. Grey specifically means "no data", and is
// the only tile with no number — "unknown" and "zero" must never look alike.

const ICONS: Record<CompanyFactorKey, LucideIcon> = {
  skills: Code2,
  domain: Layers,
  seniority: TrendingUp,
  network: Users,
  industry: Building2,
  location: MapPin,
  hiring: Briefcase,
}

const FACTOR_ORDER: CompanyFactorKey[] = [
  'skills',
  'domain',
  'seniority',
  'network',
  'industry',
  'location',
  'hiring',
]

/** Strong / moderate / weak / unknown. */
function tintFor(ratio: number | null) {
  if (ratio === null) return { ring: 'bg-gray-100 text-gray-300', text: 'text-gray-300' }
  if (ratio >= 0.66) return { ring: 'bg-brand text-white', text: 'text-ink' }
  if (ratio >= 0.33) return { ring: 'bg-brand-100 text-brand', text: 'text-muted' }
  return { ring: 'bg-gray-100 text-muted', text: 'text-muted' }
}

function FactorTile({
  factorKey,
  short,
  ratio,
  detail,
  leads,
}: {
  factorKey: CompanyFactorKey
  short: string
  ratio: number | null
  detail: string
  leads: boolean
}) {
  const Icon = ICONS[factorKey]
  const tint = tintFor(ratio)
  return (
    <div className="flex flex-col items-center gap-1" title={detail}>
      <span className={cx('text-[10px] font-semibold tracking-wide uppercase', tint.text)}>
        {short}
      </span>
      <span
        className={cx(
          'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
          tint.ring,
          // The row leader gets a ring rather than a different colour, so the
          // tint keeps meaning "how good" and never doubles as "who won".
          leads && 'ring-2 ring-brand ring-offset-2',
        )}
      >
        <Icon size={16} />
      </span>
      <span className={cx('text-[11px] font-bold', tint.text)}>
        {ratio === null ? '—' : Math.round(ratio * 100)}
      </span>
    </div>
  )
}

export function CompareModal({
  ranked,
  onRemove,
  onClose,
}: {
  ranked: RankedCompany[]
  onRemove: (companyId: string) => void
  onClose: () => void
}) {
  const verdict = compareVerdict(ranked)

  // Best ratio per factor across the compared companies, so one tile per row
  // can be marked as leading. Computed once rather than per tile.
  const leaders = new Map<CompanyFactorKey, number>()
  for (const key of FACTOR_ORDER) {
    const best = Math.max(
      ...ranked.map((r) => r.match.factors.find((f) => f.key === key)?.ratio ?? -1),
    )
    leaders.set(key, best)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 className="text-lg font-bold text-ink">
              Comparing {ranked.length} compan{ranked.length === 1 ? 'y' : 'ies'}
            </h2>
            <p className="text-xs text-muted">
              Scored against your profile. Hover a tile for the detail behind it.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close comparison"
            className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-gray-100 hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>

        {verdict && (
          <div className="flex items-start gap-2 border-b border-line bg-brand-50 px-5 py-3">
            <Trophy size={15} className="mt-0.5 shrink-0 text-brand" />
            <p className="text-sm text-ink">
              <span className="font-bold">{verdict.winner.company.name}</span> suits your profile
              best — biggest lead on {verdict.because}.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 p-5">
          {ranked.map(({ company, match }) => (
            <div key={company.id} className="rounded-xl border border-line p-4">
              <div className="mb-4 flex items-center gap-3">
                <CompanyLogo name={company.name} logoUrl={company.logoUrl} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink">{company.name}</p>
                  <p className="truncate text-xs text-muted">
                    {company.industry} · {alumniCount(company.alumniCount)} · {match.confidence} confidence
                  </p>
                </div>
                <MatchScoreRing score={match.score} confidence={match.confidence} size={44} />
                <button
                  onClick={() => onRemove(company.id)}
                  aria-label={`Remove ${company.name} from the comparison`}
                  className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-gray-100 hover:text-ink"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Seven tiles, wrapping on narrow screens rather than scrolling */}
              <div className="grid grid-cols-4 gap-y-3 sm:grid-cols-7">
                {FACTOR_ORDER.map((key) => {
                  const f = match.factors.find((x) => x.key === key)
                  if (!f) return null
                  const best = leaders.get(key) ?? -1
                  return (
                    <FactorTile
                      key={key}
                      factorKey={key}
                      short={f.short}
                      ratio={f.ratio}
                      detail={f.detail}
                      leads={f.ratio !== null && f.ratio === best && best > 0 && ranked.length > 1}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
