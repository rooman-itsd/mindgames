import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { roleLine } from '../../lib/format'
import { appendPage, waitingLabel } from '../../lib/learningHub'
import { Avatar } from '../ui'
import type { LearningShare, LearningStageLite, StageHelper } from '../../types'
import { AskOrConnect } from './AskOrConnect'
import { ShareCard } from './ShareCard'
import { CardGrid, LoadMore, SectionHeader } from './SectionHeader'

const PAGE = 20

/**
 * What alumni shared for one roadmap stage, with chips to move between stages.
 *
 * When nobody has shared for a stage yet this does NOT show an empty page: it
 * shows the alumni who can help with it, so the member always has a person to
 * ask. That fallback is the whole idea of the page in miniature.
 */
export function StageView({
  stages,
  stepKey,
  currentStepKey,
  onSelect,
  reloadKey = 0,
  onShareHere,
  onSavedChange,
}: {
  stages: LearningStageLite[]
  stepKey: string | null
  currentStepKey: string | null
  onSelect: (stepKey: string) => void
  reloadKey?: number
  /** Opens the share form for the stage being viewed. */
  onShareHere: (stepKey: string) => void
  onSavedChange: (delta: 1 | -1) => void
}) {
  const [shares, setShares] = useState<LearningShare[]>([])
  const [alumni, setAlumni] = useState<StageHelper[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'none'>('loading')
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(false)
  // Bumped on every fresh load (a new stage, or a reload of the same one), so
  // an answer to a request from before it is ignored — comparing the stage key
  // alone would let a pre-reload answer for the same stage land.
  const gen = useRef(0)

  const loadPage = useCallback(async (key: string, offset: number) => {
    const g = gen.current
    setLoading(true)
    try {
      const r = await api.getLearningStage(key, offset)
      if (gen.current !== g) return
      setShares((prev) => (offset === 0 ? r.shares : appendPage(prev, r.shares)))
      if (offset === 0) {
        setAlumni(r.alumni)
        setMemberCount(r.memberCount)
      }
      setMore(r.shares.length === PAGE)
      setState('ready')
    } catch {
      if (gen.current === g) {
        setState('failed')
        setMore(false)
      }
    } finally {
      if (gen.current === g) setLoading(false)
    }
  }, [])

  useEffect(() => {
    gen.current += 1
    setShares([])
    setAlumni([])
    if (!stepKey) {
      setState('none')
      return
    }
    setState('loading')
    void loadPage(stepKey, 0)
  }, [stepKey, reloadKey, loadPage])

  const update = (next: LearningShare) => setShares((prev) => prev.map((x) => (x.id === next.id ? next : x)))
  const drop = (id: string) => setShares((prev) => prev.filter((x) => x.id !== id))
  // This stage's own shares, then Related ones (the server sends them in
  // that order, so a loaded page only ever adds to the end of either list).
  const sameStage = shares.filter((s) => s.match !== 'related')
  const related = shares.filter((s) => s.match === 'related')

  return (
    <section>
      <SectionHeader
        icon={<Users size={18} />}
        title="What alumni recommend"
        sub={memberCount > 0 ? waitingLabel(memberCount) : 'Shared by members who have been through this stage.'}
      />

      {stages.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Roadmap stage">
          {stages.map((s, i) => {
            const active = s.stepKey === stepKey
            return (
              <button
                key={s.stepKey}
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(s.stepKey)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  active ? 'border-brand bg-brand-50 text-brand' : 'border-line bg-surface text-muted hover:text-ink'
                }`}
              >
                {s.status === 'completed' ? <CircleCheck size={12} className="text-green-600" /> : <span>{i + 1}.</span>}
                <span className="max-w-[220px] truncate">{s.title}</span>
                {s.stepKey === currentStepKey && <span className="rounded-full bg-brand px-1.5 text-[9px] text-white">Now</span>}
              </button>
            )
          })}
        </div>
      )}

      {state === 'none' && (
        <Empty>
          Build your career roadmap and you'll see what alumni recommend for each stage.{' '}
          <Link to="/career-guidance/assessment" className="font-semibold text-brand hover:underline">
            Start
          </Link>
        </Empty>
      )}
      {state === 'loading' && <p className="text-sm text-muted">Loading…</p>}
      {state === 'failed' && <p className="text-sm text-red-600">Could not load this stage.</p>}

      {state === 'ready' && shares.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-4">
          <p className="text-sm font-semibold text-ink">No one has shared for this stage yet.</p>
          <p className="mt-0.5 text-xs text-muted">
            {alumni.length > 0
              ? 'These alumni have been where you are — ask them what helped.'
              : 'Ask in Mentorship, or share something yourself once you get through it.'}
          </p>
          {alumni.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {alumni.map((a) => (
                <li key={a.id} className="flex items-center gap-2.5 rounded-lg border border-line p-2.5">
                  <Avatar name={a.name} size={36} to={`/profile/${a.id}`} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/profile/${a.id}`} className="block truncate text-xs font-bold text-ink hover:underline">
                      {a.name}
                      {a.isMentor && <span className="ml-1 text-[10px] font-semibold text-brand">Mentor</span>}
                    </Link>
                    <p className="truncate text-[11px] text-muted">{roleLine(a)}</p>
                  </div>
                  <AskOrConnect userId={a.id} name={a.name} />
                </li>
              ))}
            </ul>
          )}
          {stepKey && (
            <button
              onClick={() => onShareHere(stepKey)}
              className="mt-3 text-xs font-semibold text-brand hover:underline"
            >
              Been through this stage? Share what helped you →
            </button>
          )}
        </div>
      )}

      {shares.length > 0 && (
        <>
          {/* The server sends this stage's own shares first, then Related —
              close in meaning, shared for a similar stage on another roadmap. */}
          {sameStage.length > 0 && (
            <CardGrid>
              {sameStage.map((s) => (
                <ShareCard key={s.id} share={s} onChange={update} onRemoved={drop} onSavedChange={onSavedChange} />
              ))}
            </CardGrid>
          )}
          {related.length > 0 && (
            <>
              <h3 className={`${sameStage.length ? 'mt-5' : ''} mb-1 text-xs font-bold uppercase tracking-wide text-muted`}>
                Related
              </h3>
              <p className="mb-3 text-xs text-muted">
                {sameStage.length
                  ? 'Shared for similar stages on other roadmaps.'
                  : 'Nobody has shared for this exact stage yet — these were shared for similar ones.'}
              </p>
              <CardGrid>
                {related.map((s) => (
                  <ShareCard key={s.id} share={s} onChange={update} onRemoved={drop} onSavedChange={onSavedChange} />
                ))}
              </CardGrid>
            </>
          )}
          {more && stepKey && <LoadMore loading={loading} onClick={() => void loadPage(stepKey, shares.length)} />}
          {/* Anyone can add to a stage, not only fill an empty one. */}
          {stepKey && (
            <button
              onClick={() => onShareHere(stepKey)}
              className="mt-3 text-xs font-semibold text-brand hover:underline"
            >
              Found something else that helped on this stage? Share it →
            </button>
          )}
        </>
      )}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line bg-surface p-4 text-sm text-muted">{children}</p>
}
