import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../store/AppStore'
import { CreatePostBox } from '../components/feed/CreatePostBox'
import { HomeGreeting } from '../components/feed/HomeGreeting'
import { PostCard } from '../components/feed/PostCard'
import { matchesPostQuery } from '../lib/search'
import { EmptyState } from '../components/ui/EmptyState'
import { useLayout } from '../components/layout/LayoutContext'
import { SearchX, Sprout } from 'lucide-react'

/** Feed window: posts from your network published in the last 48 hours. */
const FEED_WINDOW_MS = 48 * 60 * 60 * 1000

/** `/home#post-<id>` → `<id>`. Any other hash is not a post deep link. */
function focusedPostId(hash: string): string | null {
  const match = /^#post-(.+)$/.exec(hash)
  return match ? match[1] : null
}

export function Home() {
  const { posts, users, query, connectionIds } = useApp()
  const { openComposer } = useLayout()

  // `key` changes on every navigation, including a repeat click on a link to
  // the hash we are already at — without it, clicking the same sidebar preview
  // card twice would leave `hash` untouched and silently do nothing.
  const { hash, key: locationKey } = useLocation()
  const focusId = focusedPostId(hash)

  const visible = useMemo(() => {
    type FeedPost = (typeof posts)[number]
    const byNewest = (a: FeedPost, b: FeedPost) =>
      +new Date(b.createdAt) - +new Date(a.createdAt)

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
    const cutoff = Date.now() - FEED_WINDOW_MS
    const recentFromNetwork = fromNetwork.filter((p) => +new Date(p.createdAt) >= cutoff)

    // Primary rule: your network's last 48 hours. Widen only when that would
    // leave the feed empty — a blank feed reads as broken, and new members with
    // no connections yet would otherwise never see anything.
    const body =
      recentFromNetwork.length > 0 ? recentFromNetwork : fromNetwork.length > 0 ? fromNetwork : rest

    const ordered = [...pinned, ...[...body].sort(byNewest)]

    // The right sidebar ranks over *every* post (Top/Hot/Rising, "For You"),
    // but the feed shows only the window above — so a preview card's
    // /home#post-<id> target was usually absent and the link did nothing.
    // Pull an explicitly linked post in so every preview card goes somewhere.
    if (focusId && !ordered.some((p) => p.id === focusId)) {
      const focused = posts.find((p) => p.id === focusId)
      if (focused) return [...ordered, focused]
    }

    return ordered
  }, [posts, users, query, connectionIds, focusId])

  // Scroll to a deep-linked post once it is actually rendered, and highlight it
  // briefly. Depends on `visible.length` rather than `posts.length` because the
  // element only exists after the focused post has made it into the feed.
  useEffect(() => {
    if (!hash || visible.length === 0) return
    const el = document.getElementById(hash.slice(1))
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-brand')
    const timer = setTimeout(() => el.classList.remove('ring-2', 'ring-brand'), 2500)
    return () => {
      clearTimeout(timer)
      el.classList.remove('ring-2', 'ring-brand')
    }
  }, [hash, locationKey, visible.length])

  return (
    <div className="flex flex-col gap-2">
      <HomeGreeting />
      <CreatePostBox />

      {visible.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}

      {visible.length === 0 &&
        (query.trim() ? (
          <EmptyState icon={<SearchX size={28} />} title={`No posts match “${query.trim()}”`} body="Try a different word, or clear the search to see the whole feed." />
        ) : (
          <EmptyState
            icon={<Sprout size={28} />}
            title="Your feed is quiet"
            body="Be the first to share: an update, a job opening, or a question for the network."
            action={{ label: 'Create a post', onClick: () => openComposer() }}
          />
        ))}
    </div>
  )
}
