/**
 * Which posts the Home feed shows, and in what order. Pure, so it can be
 * tested (homeFeed.check.ts). Moved here unchanged from Home.tsx.
 */
import type { Post, User } from '../types'
import { matchesPostQuery } from './search'

/** Feed window: posts from your network published in the last 48 hours. */
export const FEED_WINDOW_MS = 48 * 60 * 60 * 1000

export function homeFeedPosts({
  posts,
  users,
  query,
  connectionIds,
  focusId,
  now,
}: {
  posts: Post[]
  users: User[]
  query: string
  connectionIds: string[]
  /** A `/home#post-<id>` deep link target, pulled in even if outside the window. */
  focusId: string | null
  now: number
}): Post[] {
  const byNewest = (a: Post, b: Post) => +new Date(b.createdAt) - +new Date(a.createdAt)

  const matching = posts.filter((p) => matchesPostQuery(p, users, query))

  // An active search searches the whole feed. Layering the network/48h rule
  // on top of the query dropped matching posts from outside your network with
  // no indication why, which just reads as search being broken.
  if (query.trim()) return [...matching].sort(byNewest)

  // Pinned Rooman announcements are official and always shown, regardless of
  // who posted them or how old they are.
  const pinned = matching.filter((p) => p.pinned).sort(byNewest)
  const rest = matching.filter((p) => !p.pinned)

  const fromNetwork = rest.filter((p) => connectionIds.includes(p.authorId))
  const cutoff = now - FEED_WINDOW_MS
  const recentFromNetwork = fromNetwork.filter((p) => +new Date(p.createdAt) >= cutoff)

  // Primary rule: your network's last 48 hours. Widen only when that would
  // leave the feed empty — a blank feed reads as broken, and new members with
  // no connections yet would otherwise never see anything.
  const body = recentFromNetwork.length > 0 ? recentFromNetwork : fromNetwork.length > 0 ? fromNetwork : rest

  const ordered = [...pinned, ...[...body].sort(byNewest)]

  // Sidebar preview cards link to /home#post-<id>, but the feed shows only the
  // window above — so the target was often absent and the link did nothing.
  // Pull an explicitly linked post in so every preview card goes somewhere.
  if (focusId && !ordered.some((p) => p.id === focusId)) {
    const focused = posts.find((p) => p.id === focusId)
    if (focused) return [...ordered, focused]
  }

  return ordered
}

/**
 * Which of the two feed columns each post sits in (0 left, 1 right). A post
 * placed before keeps its column; only posts new to the feed are placed, each
 * into the shorter column (left on a tie). Dealing by position instead (i % 2)
 * moved every older post to the other column whenever one new post arrived —
 * React then rebuilt each card and threw away a half-typed comment. On a first
 * deal this still alternates left/right, so the newest sit atop both columns.
 * Posts no longer in the feed are dropped, so their slots are freed.
 */
export function dealColumns(ids: string[], prev: ReadonlyMap<string, 0 | 1>): Map<string, 0 | 1> {
  const next = new Map<string, 0 | 1>()
  const count = [0, 0]
  for (const id of ids) {
    const c = prev.get(id)
    if (c !== undefined) {
      next.set(id, c)
      count[c]++
    }
  }
  for (const id of ids) {
    if (next.has(id)) continue
    const c = count[1] < count[0] ? 1 : 0
    next.set(id, c)
    count[c]++
  }
  return next
}
