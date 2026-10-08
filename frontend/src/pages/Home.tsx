import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../store/AppStore'
import { CreatePostBox } from '../components/feed/CreatePostBox'
import { SpotlightCard } from '../components/feed/SpotlightCard'
import { PostCard } from '../components/feed/PostCard'
import { dealColumns, homeFeedPosts } from '../lib/homeFeed'
import { EmptyState } from '../components/ui/EmptyState'
import { useLayout } from '../components/layout/LayoutContext'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { SearchX, Sprout } from 'lucide-react'

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

  // Which posts, in what order: lib/homeFeed.ts (pure, so it is tested).
  const visible = useMemo(
    () => homeFeedPosts({ posts, users, query, connectionIds, focusId, now: Date.now() }),
    [posts, users, query, connectionIds, focusId],
  )

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

  // Two columns from md up. Posts are dealt left/right in feed order, so the
  // newest sit at the top of both columns (CSS columns would fill the left
  // column first and push newer posts halfway down the right one).
  const twoColumns = useMediaQuery('(min-width: 768px)')
  // While the Spotlight card features the pinned announcement, the feed leaves
  // it out so it doesn't appear twice, one card apart. The card reports the
  // one it shows (its picks freeze on interaction, so recomputing here could
  // hide a post the card isn't showing). Deep links still work: a
  // #post-<id> link pulls it back in (see `visible`).
  const [onCard, setOnCard] = useState<string | undefined>()
  const feed = useMemo(
    () => (onCard && focusId !== onCard ? visible.filter((p) => p.id !== onCard) : visible),
    [visible, onCard, focusId],
  )
  // A single post would sit in the left half with an empty right half, so two
  // columns only once there are at least two posts.
  const split = twoColumns && feed.length > 1
  // Each post keeps the column it was first dealt into (lib/homeFeed.ts
  // dealColumns), so a new post never moves the cards below it — a moved card
  // is rebuilt and loses a half-typed comment. A new search deals afresh.
  const placed = useRef({ query: '', columns: new Map<string, 0 | 1>() })
  const columns = useMemo(() => {
    if (!split) return [feed]
    const q = query.trim()
    const prev = placed.current.query === q ? placed.current.columns : new Map<string, 0 | 1>()
    const next = dealColumns(feed.map((p) => p.id), prev)
    placed.current = { query: q, columns: next }
    return [feed.filter((p) => next.get(p.id) === 0), feed.filter((p) => next.get(p.id) === 1)]
  }, [feed, split, query])

  return (
    <div className="flex flex-col gap-3">
      {/* One h1 per page, for screen readers and search engines; the composer
          and Spotlight already say what this page is visually. */}
      <h1 className="sr-only">Home feed</h1>
      <CreatePostBox />
      {/* Search results replace the feed, so the spotlight steps aside too. */}
      {!query.trim() && <SpotlightCard onPinnedShown={setOnCard} />}

      {feed.length > 0 && (
        <div className={split ? 'grid grid-cols-2 items-start gap-3' : 'flex flex-col gap-3'}>
          {columns.map((col, c) => (
            <div key={c} className="flex min-w-0 flex-col gap-3">
              {col.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          ))}
        </div>
      )}

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
