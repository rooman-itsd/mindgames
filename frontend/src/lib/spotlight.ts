/**
 * Home's Spotlight: what the big green card shows today. Pure — data in,
 * picks out, no React and no fetching — so spotlight.check.ts can test it.
 *
 * Every spotlight ends in one action between two alumni (congratulate, refer,
 * RSVP, book, join), which is what makes the card worth coming back to. There
 * is no StartupVarsity slot: a founder's win competes as a win like any other.
 */
import type { AppEvent, Community, Post, User } from '../types'
import { isBookableMentor } from './profileCompleteness'
import { sortPostsBySortMode } from './postSort'

export type Spotlight =
  | { kind: 'pinned'; post: Post }
  | { kind: 'win'; post: Post }
  | { kind: 'job'; post: Post; insiders: number }
  | { kind: 'help'; post: Post }
  | { kind: 'event'; event: AppEvent }
  | { kind: 'mentor'; mentor: User }
  | { kind: 'community'; community: Community; postsThisWeek: number; authorIds: string[] }
  | { kind: 'milestone'; batchYear: number; jobs: number; authorIds: string[] }

export type SpotlightKind = Spotlight['kind']

export interface SpotlightInput {
  posts: Post[]
  events: AppEvent[]
  users: User[]
  communities: Community[]
  me: User
  /** ms since epoch; passed in so the result is deterministic and testable. */
  now: number
}

const DAY = 24 * 60 * 60 * 1000
const MAX_PICKS = 3
/** Rotated by day, so the type that leads the card changes every day. */
const ROTATION: Exclude<SpotlightKind, 'pinned'>[] = ['win', 'job', 'help', 'event', 'mentor', 'community', 'milestone']

const ageMs = (p: Post, now: number) => now - +new Date(p.createdAt)
/** A post's reactions, all emoji together (likes on older posts). Shared by the
 *  Spotlight card and the sidebar's Trending list so the numbers agree. */
export const reactionTotal = (p: Post) => Object.values(p.reactions ?? {}).reduce((s, n) => s + n, 0) || p.likes || 0
const norm = (s?: string | null) => (s ?? '').trim().toLowerCase()

export function pickSpotlights({ posts, events, users, communities, me, now }: SpotlightInput): Spotlight[] {
  const others = posts.filter((p) => p.authorId !== me.id)
  const best: Partial<Record<SpotlightKind, Spotlight>> = {}

  // Pinned Rooman announcement: always first, but only for its first 3 days.
  const pinned = featuredPinned(posts, now)
  if (pinned) best.pinned = { kind: 'pinned', post: pinned }

  // Big win: the hottest Achievement / Project of the last week (shared "Hot" rule).
  const wins = others.filter((p) => (p.type === 'Achievement' || p.type === 'Project') && ageMs(p, now) <= 7 * DAY && reactionTotal(p) > 0)
  if (wins.length) best.win = { kind: 'win', post: sortPostsBySortMode(wins, 'Hot')[0] }

  // Hot job: open Hiring posts from the last 2 weeks, by applicants + alumni already there.
  // One pass over the directory builds both lookups, instead of a scan per post.
  const byId = new Map(users.map((u) => [u.id, u]))
  const atCompany = new Map<string, number>()
  for (const u of users) {
    if (u.id === me.id) continue
    const c = norm(u.company)
    if (c) atCompany.set(c, (atCompany.get(c) ?? 0) + 1)
  }
  const jobs = others
    .filter((p) => p.type === 'Hiring' && p.active !== false && ageMs(p, now) <= 14 * DAY)
    .map((p) => {
      const company = norm(p.company)
      // "N alumni work there" means other people: drop the author only if they work there.
      const authorThere = norm(byId.get(p.authorId)?.company) === company ? 1 : 0
      const insiders = company ? Math.max(0, (atCompany.get(company) ?? 0) - authorThere) : 0
      return { p, insiders, score: (p.applicantsCount ?? 0) * 3 + insiders * 2 + reactionTotal(p) }
    })
    .sort((a, b) => b.score - a.score || ageMs(a.p, now) - ageMs(b.p, now))
  if (jobs.length) best.job = { kind: 'job', post: jobs[0].p, insiders: jobs[0].insiders }

  // Someone needs a hand: a recent Open to Work post that has had the fewest replies.
  const asks = others
    .filter((p) => p.type === 'Open to Work' && ageMs(p, now) <= 14 * DAY)
    .sort((a, b) => a.comments.length - b.comments.length || ageMs(a, now) - ageMs(b, now))
  if (asks.length) best.help = { kind: 'help', post: asks[0] }

  // Event filling up: approved, within 2 weeks; fuller and sooner first, ones you're not going to before ones you are.
  const upcoming = events
    .filter((e) => (e.status ?? 'approved') === 'approved')
    .map((e) => ({ e, until: +new Date(e.startsAt) - now }))
    .filter(({ until }) => until > 0 && until <= 14 * DAY)
    .map(({ e, until }) => {
      const fill = e.capacity ? e.rsvpCount / e.capacity : Math.min(1, e.rsvpCount / 50)
      return { e, score: fill * 10 + (14 * DAY - until) / DAY - (e.rsvpedByMe ? 20 : 0) }
    })
    .sort((a, b) => b.score - a.score)
  if (upcoming.length) best.event = { kind: 'event', event: upcoming[0].e }

  // Mentor available: verified mentors, topic overlap with what I asked help with first.
  const wanted = new Set((me.seekingMentorshipIn ?? []).map(norm))
  const mentors = users
    .filter((u) => u.id !== me.id && isBookableMentor(u))
    .map((u) => {
      const overlap = (u.mentorTopics ?? []).filter((t) => wanted.has(norm(t))).length
      return { u, score: overlap * 10 + (u.mentorAvailability ? 3 : 0) + Math.min(5, (u.sessionsConducted ?? 0) / 5) }
    })
    .sort((a, b) => b.score - a.score)
  if (mentors.length) best.mentor = { kind: 'mentor', mentor: mentors[0].u }

  // Community to join: approved, not joined; busy this week and matching my field / city / batch.
  const mine = new Set([norm(me.domain), norm(me.city), String(me.batchYear)])
  const weekPosts = posts.filter((p) => p.communityId && ageMs(p, now) <= 7 * DAY)
  const comms = communities
    .filter((c) => !c.joined && (c.status ?? 'approved') === 'approved')
    .map((c) => {
      const recent = weekPosts.filter((p) => p.communityId === c.id)
      const matches = mine.has(norm(c.tag))
      return { c, recent, score: recent.length * 3 + (matches ? 8 : 0) + Math.min(5, c.memberCount / 50) }
    })
    .sort((a, b) => b.score - a.score)
  if (comms.length) {
    const top = comms[0]
    best.community = {
      kind: 'community',
      community: top.c,
      postsThisWeek: top.recent.length,
      authorIds: [...new Set(top.recent.map((p) => p.authorId))],
    }
  }

  // Network milestone: my batch shared at least 3 jobs in the last 30 days.
  if (me.batchYear) {
    const batchJobs = posts.filter((p) => p.type === 'Hiring' && ageMs(p, now) <= 30 * DAY && byId.get(p.authorId)?.batchYear === me.batchYear)
    if (batchJobs.length >= 3) {
      best.milestone = { kind: 'milestone', batchYear: me.batchYear, jobs: batchJobs.length, authorIds: [...new Set(batchJobs.map((p) => p.authorId))] }
    }
  }

  // Order: pinned first; then today's rotation, with the types that fit me moved forward.
  const tags = new Set(me.profileTags ?? [])
  const leans = new Set<SpotlightKind>()
  if (tags.has('Open to Work')) leans.add('job')
  if (tags.has('Need mentorship') || wanted.size > 0) leans.add('mentor')
  if (tags.has('Willing to give referral') || tags.has('Hiring') || me.openToReferrals || (me.hiringFor?.length ?? 0) > 0) leans.add('help')

  const shift = Math.floor(now / DAY) % ROTATION.length
  const rotated = [...ROTATION.slice(shift), ...ROTATION.slice(0, shift)]
  const order: SpotlightKind[] = ['pinned', ...rotated.filter((k) => leans.has(k)), ...rotated.filter((k) => !leans.has(k))]

  return order.map((k) => best[k]).filter((s): s is Spotlight => !!s).slice(0, MAX_PICKS)
}

/**
 * The pinned announcement the Spotlight features (newest pinned post, first 3
 * days only). SpotlightCard reports the one it actually shows to Home, which
 * leaves it out of the feed so it doesn't appear twice, one card apart.
 */
export function featuredPinned(posts: Post[], now: number): Post | undefined {
  const pinned = posts.filter((p) => p.pinned && ageMs(p, now) <= 3 * DAY)
  return pinned.length ? sortPostsBySortMode(pinned, 'New')[0] : undefined
}

/** Stable identity for a pick, so the card can keep its place when counts change. */
export function spotlightKey(s: Spotlight): string {
  switch (s.kind) {
    case 'pinned':
    case 'win':
    case 'job':
    case 'help':
      return `${s.kind}:${s.post.id}`
    case 'event':
      return `event:${s.event.id}`
    case 'mentor':
      return `mentor:${s.mentor.id}`
    case 'community':
      return `community:${s.community.id}`
    case 'milestone':
      return `milestone:${s.batchYear}`
  }
}
