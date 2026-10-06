import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, ChevronDown, Sparkles } from 'lucide-react'
import { api } from '../../lib/api'
import { hasMatchEvidence, rankCompanies } from '../../lib/companyMatch'
import { useApp } from '../../store/AppStore'
import { Button, cx } from '../ui'
import { CompanyMatchRow } from './CompanyMatchRow'
import { CompareModal } from './CompareModal'
import type { CompanyWithSignals } from '../../types'

// "Companies for you" — the ranked strip above the plain directory.
//
// HOW IT STAYS FRESH, with no sync button anywhere:
//
//  1. It refetches every time this section mounts, i.e. on every visit to the
//     Companies tab and on every full page refresh.
//  2. It refetches when the tab becomes visible again, which is what "close
//     the app and open it later" looks like to a browser — a laptop waking up,
//     or switching back to the tab, both fire `visibilitychange`.
//  3. Both are throttled by STALE_AFTER_MS so flicking between tabs does not
//     hammer the endpoint. The scoring itself is arithmetic over data the
//     server already has, so a refresh costs one query, not an AI call.
//
// Nothing here is cached across sessions on purpose: the inputs (your profile,
// who joined, who posted a job) change underneath it, and a stale score shown
// confidently is worse than a half-second wait.
const STALE_AFTER_MS = 5 * 60 * 1000

/** How many ranked companies the strip shows before "show all". */
const TOP_N = 6

/** Comparing more than three columns stops being readable on a phone. */
const MAX_COMPARE = 3

export function ForYouSection() {
  const { currentUser } = useApp()
  const [companies, setCompanies] = useState<CompanyWithSignals[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const [comparing, setComparing] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)
  const fetchedAt = useRef(0)
  // Guards against a visibility refetch landing after the component unmounts.
  const alive = useRef(true)

  const load = useCallback(async (force = false) => {
    if (!force && Date.now() - fetchedAt.current < STALE_AFTER_MS) return
    fetchedAt.current = Date.now()
    try {
      const rows = await api.getCompaniesForYou()
      if (!alive.current) return
      setCompanies(rows)
      setFailed(false)
    } catch {
      if (!alive.current) return
      // Reset the clock so the next visibility change retries rather than
      // being throttled out by a failed attempt.
      fetchedAt.current = 0
      setFailed(true)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void load(true)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive.current = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // Only companies with actual alumni to judge — open Hiring roles alone are
  // not enough (see hasMatchEvidence), since nobody there could actually help
  // you get in. A company with no alumni cannot be scored honestly and would
  // sit here at 0 — or worse, at a confident-looking number earned entirely
  // from an industry match. Zero-alumni companies are excluded from the
  // directory below too (GET /api/companies), even a saved one.
  const ranked = useMemo(
    () => (companies ? rankCompanies(companies.filter(hasMatchEvidence), currentUser) : []),
    [companies, currentUser],
  )

  /** How many the filter above removed, so the section can say so. */
  const hidden = (companies?.length ?? 0) - ranked.length

  // Sorted by score, NOT by the order they were ticked. compareVerdict treats
  // the first entry as the winner, so selection order would let a 38% company
  // be announced as "suits your profile best" beside an 86% one.
  const comparedRows = useMemo(
    () =>
      comparing
        .map((id) => ranked.find((r) => r.company.id === id))
        .filter((r) => !!r)
        .sort((a, b) => b.match.score - a.match.score),
    [comparing, ranked],
  )

  function toggleCompare(id: string) {
    setComparing((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= MAX_COMPARE ? ids : [...ids, id],
    )
  }

  // Nothing useful to say yet, and an empty bordered box would just be noise
  // above a directory that works fine on its own.
  if (failed || (companies && companies.length === 0)) return null

  const shown = showAll ? ranked : ranked.slice(0, TOP_N)

  return (
    <section className="flex flex-col gap-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-left"
        aria-expanded={open}
      >
        <Sparkles size={18} className="text-brand" />
        <h2 className="text-lg font-bold text-ink">Companies for you</h2>
        <ChevronDown
          size={16}
          className={cx('text-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <>
          <p className="-mt-1 text-sm text-muted">
            Ranked against your profile and resume — skills, domain, seniority, and who you already
            know inside. Pick up to {MAX_COMPARE} to compare.
          </p>

          {!companies ? (
            <p className="text-sm text-muted">Scoring companies against your profile…</p>
          ) : ranked.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
              No company has Rooman alumni yet, so there is nothing to rank against your profile.
            </p>
          ) : (
            <div className="flex flex-col">
              {shown.map((r, i) => (
                <CompanyMatchRow
                  key={r.company.id}
                  ranked={r}
                  rank={i + 1}
                  selected={comparing.includes(r.company.id)}
                  onToggleSelect={() => toggleCompare(r.company.id)}
                  last={i === shown.length - 1}
                />
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {companies && ranked.length > TOP_N && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="text-xs font-semibold text-brand hover:underline"
              >
                {showAll ? 'Show top matches only' : `Show all ${ranked.length} ranked`}
              </button>
            )}
            {hidden > 0 && (
              <span className="text-xs text-muted">
                {hidden} more compan{hidden === 1 ? 'y has' : 'ies have'} no Rooman alumni yet, so
                {hidden === 1 ? " it isn't" : " they aren't"} ranked here.
              </span>
            )}
          </div>

          {/* A selection bar rather than an inline table: the comparison is a
              popup now, so the strip keeps its grid rhythm and nothing below it
              jumps down when companies are picked. */}
          {comparedRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-brand-50 px-4 py-2.5">
              <span className="text-sm text-ink">
                <span className="font-bold">{comparedRows.length}</span> selected —{' '}
                {comparedRows.map((r) => r.company.name).join(', ')}
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => setComparing([])}
                  className="text-xs font-semibold text-muted hover:text-ink"
                >
                  Clear
                </button>
                <Button
                  variant="primary"
                  className="!px-3 !py-1.5 text-xs"
                  icon={<BarChart3 size={13} />}
                  onClick={() => setShowCompare(true)}
                >
                  Compare
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {showCompare && comparedRows.length > 0 && (
        <CompareModal
          ranked={comparedRows}
          onRemove={(id) => {
            const left = comparing.filter((x) => x !== id)
            setComparing(left)
            // Removing the last one leaves nothing to compare, so the popup
            // closes itself rather than sitting there empty.
            if (left.length === 0) setShowCompare(false)
          }}
          onClose={() => setShowCompare(false)}
        />
      )}
    </section>
  )
}
