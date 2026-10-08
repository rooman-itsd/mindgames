import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Briefcase,
  CalendarHeart,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  GraduationCap,
  HandHeart,
  Megaphone,
  MessageCircle,
  PartyPopper,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { useLayout } from '../layout/LayoutContext'
import { Avatar, AvatarStack } from '../ui'
import { ConnectNoteModal } from '../referral/ConnectNoteModal'
import { ReachOutModal } from '../referral/ReachOutModal'
import { heartBurst } from '../ui/celebrate'
import { roleLine } from '../../lib/format'
import { pickSpotlights, reactionTotal, spotlightKey, type Spotlight, type SpotlightKind } from '../../lib/spotlight'
import type { User } from '../../types'

/**
 * Home's big green Spotlight card: up to 3 picks a day from lib/spotlight.ts,
 * stepped through with ‹ › or the dots. Each pick ends in one action between
 * two alumni, and every action reuses an existing flow (react, chat, RSVP,
 * join, the mentor's profile) — no new backend calls.
 *
 * The card sits on a fixed dark-green gradient in both themes, so its colours
 * are literal rather than theme tokens, like the sign-in screens.
 */
const META: Record<SpotlightKind, { name: string; label: string; Icon: typeof Sparkles; kick: string; glow: string }> = {
  pinned: { name: 'Rooman announcement', label: 'Pinned by Rooman', Icon: Megaphone, kick: '#ffffff', glow: 'rgb(255 255 255 / 0.18)' },
  win: { name: 'Big win', label: "Today's spotlight · most celebrated", Icon: PartyPopper, kick: '#f8c95a', glow: 'rgb(242 168 29 / 0.38)' },
  job: { name: 'Hot job', label: 'Hiring in your network', Icon: Briefcase, kick: '#86efac', glow: 'rgb(34 197 94 / 0.35)' },
  help: { name: 'Someone needs a hand', label: 'A fellow alum is looking', Icon: HandHeart, kick: '#93c5fd', glow: 'rgb(59 130 246 / 0.38)' },
  event: { name: 'Event coming up', label: 'Coming up', Icon: CalendarHeart, kick: '#fda4af', glow: 'rgb(225 29 72 / 0.35)' },
  mentor: { name: 'Mentor available', label: 'Mentor with open slots', Icon: GraduationCap, kick: '#fcd34d', glow: 'rgb(242 168 29 / 0.3)' },
  community: { name: 'Community to join', label: 'Community picked for you', Icon: UsersRound, kick: '#67e8f9', glow: 'rgb(6 182 212 / 0.35)' },
  milestone: { name: 'Network milestone', label: 'Your batch this month', Icon: Sparkles, kick: '#5eead4', glow: 'rgb(20 184 166 / 0.35)' },
}

const CTA = 'btn-cta inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold'
const GHOST =
  'inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15'
const DONE = 'inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white'

/** First line of a post, trimmed to fit a headline. */
const headlineOf = (text: string) => {
  const first = text.trim().split('\n')[0]
  return first.length > 110 ? first.slice(0, 107).trimEnd() + '…' : first
}
const restOf = (text: string) => {
  const rest = text.trim().split('\n').slice(1).join(' ').trim()
  return rest.length > 170 ? rest.slice(0, 167).trimEnd() + '…' : rest
}

function Fact({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold">
      {children}
    </span>
  )
}

function Byline({ user, fallback }: { user?: User; fallback?: string }) {
  return (
    <div className="mt-3.5 flex items-center gap-2.5">
      <span className="rounded-full ring-2 ring-white/35">
        <Avatar name={user?.name ?? fallback ?? '?'} src={user?.photo} size={40} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{user?.name ?? fallback}</p>
        {user && roleLine(user) && <p className="truncate text-xs text-white/75">{roleLine(user)}</p>}
      </div>
    </div>
  )
}

export function SpotlightCard({
  onPinnedShown,
}: {
  /** Told which pinned post the card features (or none), so Home's feed can
   *  leave out exactly that one — the card's picks freeze on interaction, so
   *  recomputing "the pinned post" elsewhere drifts from what is shown here. */
  onPinnedShown?: (postId: string | undefined) => void
} = {}) {
  const { posts, events, users, communities, currentUser, userById, react, toggleRsvp, toggleJoin, connectionState } = useApp()
  const { openChatWith } = useLayout()
  const navigate = useNavigate()

  // One moment per visit, so the picks don't drift while the member reads them.
  const [now] = useState(() => Date.now())
  const picks = useMemo(
    () => pickSpotlights({ posts, events, users, communities, me: currentUser, now }),
    [posts, events, users, communities, currentUser, now],
  )
  // Live until the member interacts, then frozen. Live first, so data that
  // arrives after the first render (a fresh page load) still fills the card;
  // frozen once they click, because acting on a pick (joining a community,
  // RSVPing) changes the data, and re-picking would swap the item out from
  // under their cursor instead of showing "Joined" / "You're going". Each pick
  // is still drawn with live data below.
  const [frozen, setFrozen] = useState<Spotlight[] | null>(null)
  const shown = frozen ?? picks
  const freeze = () => {
    if (!frozen) setFrozen(shown)
  }
  // Layout effect: Home re-renders before the browser paints, so the feed
  // never flashes the pinned post for a frame. Cleared when the card goes
  // (a search replaces it), so the feed shows the post again.
  const pinnedId = shown.find((s) => s.kind === 'pinned')?.post.id
  useLayoutEffect(() => {
    onPinnedShown?.(pinnedId)
    return () => onPinnedShown?.(undefined)
  }, [pinnedId, onPinnedShown])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  // Messaging needs a connection (the API refuses a thread otherwise), so
  // people actions go through the existing connect-with-a-note / referral flows.
  const [noteFor, setNoteFor] = useState<User | null>(null)
  const [referralFor, setReferralFor] = useState<User | null>(null)
  if (shown.length === 0) return null
  const idx = Math.max(0, shown.findIndex((p) => spotlightKey(p) === activeKey))
  const s = shown[idx]
  const meta = META[s.kind]
  const go = (step: number) => {
    freeze()
    setActiveKey(spotlightKey(shown[(idx + step + shown.length) % shown.length]))
  }

  /** One button for reaching a person: chat if connected, connect-with-a-note if not.
   *  A plain function (not a nested component) so React keeps the same button
   *  between renders and focus isn't lost after a click. */
  function reach({ user, connected, notConnected, onConnected, primary }: {
    user: User
    connected: string
    notConnected: string
    onConnected: () => void
    primary?: boolean
  }) {
    const state = connectionState(user.id)
    if (state === 'pending')
      return (
        <span className={primary ? DONE : GHOST}>
          <Check size={15} /> Request sent
        </span>
      )
    return (
      <button
        type="button"
        className={primary ? CTA : GHOST}
        onClick={() => {
          freeze()
          if (state === 'connected') onConnected()
          else setNoteFor(user)
        }}
      >
        {!primary && <MessageCircle size={15} />}
        {state === 'connected' ? connected : notConnected}
      </button>
    )
  }

  const body = renderBody(s)

  function renderBody(s: Spotlight): { headline: string; sub?: string; extra?: ReactNode; actions: ReactNode; stat?: ReactNode } {
    switch (s.kind) {
      case 'pinned':
      case 'win': {
        const post = posts.find((p) => p.id === s.post.id) ?? s.post
        const author = userById(post.authorId)
        const mine = post.myReaction === '🎉'
        const reactions = reactionTotal(post)
        return {
          headline: headlineOf(post.content),
          sub: restOf(post.content) || undefined,
          extra: <Byline user={author} fallback="Rooman" />,
          stat: (
            <span className="ml-auto flex gap-3 text-sm text-white/85">
              <span>♥ {reactions}</span>
              <span>💬 {post.comments.length}</span>
            </span>
          ),
          actions:
            s.kind === 'pinned' ? (
              <button type="button" className={CTA} onClick={() => navigate(`/home#post-${post.id}`)}>
                Read post <ArrowRight size={15} />
              </button>
            ) : (
              <>
                {mine ? (
                  <span className={DONE}>
                    <Check size={15} /> Congratulated
                  </span>
                ) : (
                  <button
                    type="button"
                    className={CTA}
                    onClick={(e) => {
                      freeze()
                      heartBurst(e.currentTarget, '🎉')
                      react(post.id, '🎉')
                    }}
                  >
                    🎉 Congratulate
                  </button>
                )}
                {author && (
                  reach({ user: author, connected: 'Send a note', notConnected: 'Connect & send a note', onConnected: () => openChatWith(author.id) })
                )}
              </>
            ),
        }
      }
      case 'job': {
        const post = posts.find((p) => p.id === s.post.id) ?? s.post
        const author = userById(post.authorId)
        const company = post.company ?? author?.company
        return {
          headline: post.role && company ? `${company} is hiring: ${post.role}` : headlineOf(post.content),
          sub: post.role ? headlineOf(post.content) : restOf(post.content) || undefined,
          extra: (
            <>
              <Byline user={author} />
              <div className="mt-3 flex flex-wrap gap-2">
                {s.insiders > 0 && <Fact>{s.insiders} {s.insiders === 1 ? 'alumnus works' : 'alumni work'} there</Fact>}
                {(post.applicantsCount ?? 0) > 0 && <Fact>{post.applicantsCount} applied</Fact>}
                {post.city && <Fact>{post.city}</Fact>}
              </div>
            </>
          ),
          actions: (
            <>
              {author && (
                reach({
                  primary: true,
                  user: author,
                  connected: 'Ask for a referral',
                  notConnected: 'Connect to ask for a referral',
                  onConnected: () => setReferralFor({ ...author, company: company ?? author.company }),
                })
              )}
              <button type="button" className={GHOST} onClick={() => navigate('/jobs')}>
                <Briefcase size={15} /> View jobs
              </button>
            </>
          ),
        }
      }
      case 'help': {
        const post = posts.find((p) => p.id === s.post.id) ?? s.post
        const author = userById(post.authorId)
        return {
          headline: author ? `${author.name} is looking for their next role` : headlineOf(post.content),
          sub: headlineOf(post.content),
          extra: (
            <>
              <Byline user={author} />
              <div className="mt-3 flex flex-wrap gap-2">
                {author?.domain && <Fact>{author.domain}</Fact>}
                {author?.city && <Fact>{author.city}</Fact>}
                <Fact>
                  {post.comments.length} {post.comments.length === 1 ? 'reply' : 'replies'} so far
                </Fact>
              </div>
            </>
          ),
          actions: author ? (
            <>
              {reach({ primary: true, user: author, connected: 'Refer them', notConnected: 'Connect & offer help', onConnected: () => openChatWith(author.id) })}
              <button type="button" className={GHOST} onClick={() => navigate(`/profile/${author.id}`)}>
                View profile
              </button>
            </>
          ) : null,
        }
      }
      case 'event': {
        const ev = events.find((e) => e.id === s.event.id) ?? s.event
        const when = new Date(ev.startsAt).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
        const fill = ev.capacity ? ev.rsvpCount / ev.capacity : 0
        return {
          headline: ev.title,
          sub: [when, ev.location].filter(Boolean).join(' · '),
          extra: ev.capacity ? (
            <div className="mt-3.5 max-w-sm">
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <i className="block h-full rounded-full bg-marigold-light" style={{ width: `${Math.min(100, fill * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-white/80">
                {ev.rsvpCount} of {ev.capacity} seats taken
              </p>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Fact>{ev.rsvpCount} going</Fact>
            </div>
          ),
          actions: (
            <>
              {ev.rsvpedByMe ? (
                <span className={DONE}>
                  <Check size={15} /> You're going
                </span>
              ) : ev.waitlistedByMe ? (
                <span className={DONE}>
                  <Check size={15} /> On the waitlist
                </span>
              ) : (
                <button
                  type="button"
                  className={CTA}
                  onClick={() => {
                    freeze()
                    toggleRsvp(ev.id)
                  }}
                >
                  RSVP
                </button>
              )}
              <button type="button" className={GHOST} onClick={() => navigate('/events')}>
                <CalendarHeart size={15} /> Details
              </button>
            </>
          ),
        }
      }
      case 'mentor': {
        const m = userById(s.mentor.id) ?? s.mentor
        const topics = (m.mentorTopics ?? []).slice(0, 3)
        return {
          headline: `${m.name.split(' ')[0]} is open to mentor`,
          sub: [topics.join(', '), m.sessionsConducted ? `${m.sessionsConducted} sessions with Rooman alumni so far` : '']
            .filter(Boolean)
            .join('. '),
          extra: (
            <>
              <Byline user={m} />
              {(topics.length > 0 || m.mentorAvailability) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {topics.map((t) => (
                    <Fact key={t}>{t}</Fact>
                  ))}
                  {m.mentorAvailability && <Fact>{m.mentorAvailability}</Fact>}
                </div>
              )}
            </>
          ),
          actions: (
            <>
              <button type="button" className={CTA} onClick={() => navigate(`/profile/${m.id}`)}>
                Book a session
              </button>
              {reach({ user: m, connected: 'Message', notConnected: 'Connect', onConnected: () => openChatWith(m.id) })}
            </>
          ),
        }
      }
      case 'community': {
        const c = communities.find((x) => x.id === s.community.id) ?? s.community
        const authors = s.authorIds.map((id) => userById(id)).filter((u): u is User => !!u)
        return {
          headline: c.name,
          sub: c.description,
          extra: (
            <>
              {authors.length > 0 && (
                <div className="mt-3.5 flex items-center gap-2.5 text-xs text-white/80">
                  <AvatarStack people={authors.map((u) => ({ id: u.id, name: u.name, photo: u.photo ?? undefined }))} size={28} max={5} />
                  <span>Posted here this week</span>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Fact>{c.memberCount.toLocaleString('en-IN')} members</Fact>
                {s.postsThisWeek > 0 && (
                  <Fact>
                    {s.postsThisWeek} {s.postsThisWeek === 1 ? 'post' : 'posts'} this week
                  </Fact>
                )}
                {c.tag && <Fact>#{c.tag}</Fact>}
              </div>
            </>
          ),
          actions: (
            <>
              {c.joined ? (
                <span className={DONE}>
                  <Check size={15} /> Joined
                </span>
              ) : (
                <button
                  type="button"
                  className={CTA}
                  onClick={() => {
                    freeze()
                    toggleJoin(c.id)
                  }}
                >
                  Join community
                </button>
              )}
              <button type="button" className={GHOST} onClick={() => navigate(`/community/${c.id}`)}>
                <Compass size={15} /> Open community
              </button>
            </>
          ),
        }
      }
      case 'milestone': {
        const authors = s.authorIds.map((id) => userById(id)).filter((u): u is User => !!u)
        return {
          headline: `Batch ${s.batchYear} shared ${s.jobs} jobs this month`,
          sub: 'Your batchmates are opening doors for each other.',
          extra:
            authors.length > 0 ? (
              <div className="mt-3.5 flex items-center gap-2.5 text-xs text-white/80">
                <AvatarStack people={authors.map((u) => ({ id: u.id, name: u.name, photo: u.photo ?? undefined }))} size={28} max={5} />
                <span>
                  {authors.length} {authors.length === 1 ? 'batchmate' : 'batchmates'} posted
                </span>
              </div>
            ) : undefined,
          actions: (
            <button type="button" className={CTA} onClick={() => navigate('/jobs')}>
              See the jobs <ArrowRight size={15} />
            </button>
          ),
        }
      }
    }
  }

  return (
    <>
    <section
      aria-roledescription="carousel"
      aria-label="Today's spotlight"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1)
        if (e.key === 'ArrowLeft') go(-1)
      }}
      className="relative overflow-hidden rounded-2xl p-5 text-white shadow-sm sm:p-6"
      style={{
        backgroundImage: `radial-gradient(70% 95% at 100% 0%, ${meta.glow}, transparent 62%), linear-gradient(135deg, var(--color-brand), var(--color-brand-800) 72%)`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-extrabold tracking-wider uppercase" style={{ color: meta.kick }}>
          <meta.Icon size={15} /> {meta.label}
        </span>
        {shown.length > 1 && (
          <div className="flex gap-1.5">
            <button type="button" onClick={() => go(-1)} aria-label="Previous spotlight" className="grid h-8 w-8 place-items-center rounded-full border border-white/30 bg-white/10 hover:bg-white/20">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next spotlight" className="grid h-8 w-8 place-items-center rounded-full border border-white/30 bg-white/10 hover:bg-white/20">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Keyed by the pick so each one fades in; aria-live announces the change. */}
      <div key={spotlightKey(s)} className="animate-fadein" aria-live="polite">
        <h2 className="mt-2.5 line-clamp-3 max-w-[26ch] font-display text-[26px] leading-tight font-extrabold text-balance sm:text-[29px]">{body.headline}</h2>
        {body.sub && <p className="mt-1.5 max-w-[60ch] text-[15px] text-white/85">{body.sub}</p>}
        {body.extra}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {body.actions}
          {body.stat}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/15 pt-2.5 text-xs text-white/70">
        <span>
          <b className="text-white">
            {idx + 1}/{shown.length}
          </b>{' '}
          · {meta.name}
        </span>
        {shown.length > 1 && (
          <span className="flex gap-1.5">
            {shown.map((p, n) => (
              <button
                key={spotlightKey(p)}
                type="button"
                aria-label={`Spotlight ${n + 1}: ${META[p.kind].name}`}
                aria-current={n === idx}
                onClick={() => {
                  freeze()
                  setActiveKey(spotlightKey(p))
                }}
                className={`h-[7px] rounded-full transition-all ${n === idx ? 'w-5 bg-marigold-light' : 'w-[7px] bg-white/35 hover:bg-white/60'}`}
              />
            ))}
          </span>
        )}
      </div>
    </section>
    {noteFor && <ConnectNoteModal user={{ id: noteFor.id, name: noteFor.name }} onClose={() => setNoteFor(null)} />}
    {referralFor && <ReachOutModal user={{ id: referralFor.id, name: referralFor.name, company: referralFor.company }} onClose={() => setReferralFor(null)} />}
    </>
  )
}
