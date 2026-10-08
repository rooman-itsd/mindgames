import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../store/AppStore'
import { useLeaderboard } from '../../hooks/useLeaderboard'
import { useUpcomingEvents } from '../../hooks/useUpcomingEvents'
import { Avatar } from '../ui'
import { CountUp } from '../ui/CountUp'
import { sortPostsBySortMode } from '../../lib/postSort'
import { reactionTotal } from '../../lib/spotlight'
import { timeAgo } from '../../lib/format'

/**
 * Home's right column (Spotlight theme): a top-3 contributors podium with
 * places 4–5 below it, a Trending card (Hot / New / Top) and the next events.
 * Trending ranks every post, feed posts included.
 */

const TRENDING_MODES = ['Hot', 'New', 'Top'] as const
type TrendingMode = (typeof TRENDING_MODES)[number]

// Medal colours sit under fixed dark text, so they're literal, not theme tokens.
const STEP: Record<1 | 2 | 3, { height: string; background: string }> = {
  1: { height: '66px', background: 'linear-gradient(135deg, var(--color-marigold-light), var(--color-marigold))' },
  2: { height: '46px', background: '#d6d3cc' },
  3: { height: '34px', background: '#e2b48a' },
}

export function HomeRightSidebar() {
  const { posts, userById } = useApp()
  const leaders = useLeaderboard()
  const [mode, setMode] = useState<TrendingMode>('Hot')
  // Every post is eligible, feed posts included (the member's call).
  const trending = useMemo(() => sortPostsBySortMode(posts, mode).slice(0, 3), [posts, mode])
  const nextEvents = useUpcomingEvents(2)
  // Podium order on screen: 2nd, 1st, 3rd.
  const podium = leaders.length >= 3 ? [leaders[1], leaders[0], leaders[2]] : []
  const rest = leaders.length >= 3 ? leaders.slice(3, 5) : leaders

  return (
    <aside className="fixed bottom-0 right-[calc(var(--shell-gutter)+14px)] top-14 hidden w-[288px] overflow-y-auto py-3.5 pb-24 xl:block">
      <div className="flex flex-col gap-3.5">
        {leaders.length > 0 && (
          <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm" aria-labelledby="top-contributors">
            <h3 id="top-contributors" className="mb-3 text-[11px] font-extrabold tracking-wider text-muted uppercase">
              Top contributors
            </h3>
            {podium.length === 3 && (
              <ol className="grid grid-cols-[1fr_1.15fr_1fr] items-end gap-2 text-center">
                {podium.map((l) => {
                  const place = (leaders.indexOf(l) + 1) as 1 | 2 | 3
                  return (
                    <li key={l.id} className="min-w-0">
                      <Link to={`/profile/${l.id}`} className="group flex flex-col items-center gap-1" aria-label={`${place}. ${l.name}, ${l.points} points`}>
                        <Avatar name={l.name} src={l.photo} size={place === 1 ? 46 : 40} />
                        <span className="w-full truncate text-[12.5px] font-bold text-ink group-hover:text-brand">{l.name.split(' ')[0]}</span>
                        <span className="text-[11.5px] font-bold text-brand tabular-nums">
                          <CountUp value={l.points} />
                        </span>
                        <span
                          aria-hidden
                          className="grid w-full place-items-center rounded-t-[10px] rounded-b font-display text-lg font-extrabold text-on-gold"
                          style={STEP[place]}
                        >
                          {place}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            )}
            {rest.length > 0 && (
              <ol className={`flex flex-col gap-0.5 ${podium.length ? 'mt-3' : ''}`}>
                {rest.map((l) => (
                  <li key={l.id}>
                    <Link to={`/profile/${l.id}`} className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-[13px] hover:bg-page">
                      <span className="w-[18px] text-center font-bold text-muted">{leaders.indexOf(l) + 1}</span>
                      <Avatar name={l.name} src={l.photo} size={22} />
                      <span className="min-w-0 flex-1 truncate text-ink">{l.name}</span>
                      <span className="shrink-0 text-xs font-bold text-brand tabular-nums">
                        ⭐ <CountUp value={l.points} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm" aria-labelledby="trending">
          <h3 id="trending" className="mb-2.5 text-[11px] font-extrabold tracking-wider text-muted uppercase">
            Trending
          </h3>
          <div role="tablist" aria-label="Sort trending posts" className="mb-2 inline-flex gap-0.5 rounded-full bg-page p-[3px]">
            {TRENDING_MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                  mode === m ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {trending.length > 0 ? (
            <ul className="flex flex-col">
              {trending.map((p) => {
                const author = userById(p.authorId)
                const reactions = reactionTotal(p)
                return (
                  <li key={p.id}>
                    {/* Home pulls a #post-<id> target into the feed and scrolls to it. */}
                    <Link to={`/home#post-${p.id}`} className="-mx-2 flex gap-2.5 rounded-xl p-2 hover:bg-page">
                      <Avatar name={author?.name ?? '?'} src={author?.photo} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-ink">{author?.name ?? 'Member'}</span>
                        <span className="line-clamp-2 text-[13px] leading-snug text-muted">{p.content}</span>
                        <span className="mt-1 flex gap-2.5 text-xs text-muted">
                          <span>♥ {reactions}</span>
                          <span>💬 {p.comments.length}</span>
                          <span>{timeAgo(p.createdAt)}</span>
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="py-1 text-[13px] text-muted">Nothing trending yet.</p>
          )}
        </section>

        {nextEvents.length > 0 && (
          <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-sm" aria-labelledby="coming-up">
            <h3 id="coming-up" className="mb-2 flex items-center justify-between text-[11px] font-extrabold tracking-wider text-muted uppercase">
              Coming up
              <Link to="/events" className="text-xs font-semibold tracking-normal text-brand normal-case hover:underline">
                All events
              </Link>
            </h3>
            <div className="flex flex-col">
              {nextEvents.map((e) => {
                const d = new Date(e.startsAt)
                return (
                  <Link key={e.id} to="/events" className="flex items-center gap-2.5 rounded-lg py-1.5 hover:bg-page">
                    <span className="w-11 shrink-0 overflow-hidden rounded-[10px] border border-line text-center">
                      <span className="block bg-brand py-px text-[10px] font-extrabold tracking-wide text-white uppercase">
                        {d.toLocaleDateString('en-IN', { month: 'short' })}
                      </span>
                      <span className="block py-0.5 font-display text-[17px] font-extrabold text-ink">{d.getDate()}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">{e.title}</span>
                      <span className="block text-xs text-muted">
                        {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                        {e.rsvpedByMe && <span className="font-bold text-brand"> · You're going</span>}
                      </span>
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        <p className="px-1 text-[10px] text-gray-400">Root Connect · Alumni Network</p>
      </div>
    </aside>
  )
}
