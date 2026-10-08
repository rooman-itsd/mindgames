import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Megaphone, Newspaper, Plus } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Button, Card } from '../components/ui'
import { PostCard } from '../components/feed/PostCard'
import { NewsComposer } from '../components/feed/NewsComposer'
import { NEWS_TYPES } from '../types'
import { roomanStats } from '../data/mockData'

export function News() {
  const { posts, userById } = useApp()
  const [composing, setComposing] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  // Home's "Share a win" shortcut lands here with { compose: true }: open the
  // composer (it starts on Achievement), then drop the flag so a refresh or a
  // Back to this entry doesn't reopen it.
  useEffect(() => {
    if ((location.state as { compose?: boolean } | null)?.compose) {
      setComposing(true)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state, location.pathname, navigate])

  // News & Updates = official announcements (admin / Rooman authored) PLUS the
  // peer-to-peer formats members publish (Achievement, Project, Article, Meetup).
  const newsTypes = new Set<string>(NEWS_TYPES)
  const news = useMemo(
    () =>
      posts
        .filter(
          (p) => p.authorId === 'rooman' || userById(p.authorId)?.isAdmin || newsTypes.has(p.type),
        )
        .sort(
          (a, b) =>
            Number(b.pinned ?? false) - Number(a.pinned ?? false) ||
            +new Date(b.createdAt) - +new Date(a.createdAt),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posts, userById],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Newspaper size={24} className="text-brand" />
          <h1 className="text-2xl font-bold text-ink">News &amp; Updates</h1>
        </div>
        <Button onClick={() => setComposing(true)} icon={<Plus size={18} />}>
          Create news
        </Button>
      </div>

      {/* Rooman highlight banner */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 bg-gradient-to-r from-brand to-brand-hover px-5 py-4 text-white">
          <Megaphone size={22} />
          <div>
            <p className="font-bold">Rooman Technologies · {roomanStats.years} Years</p>
            <p className="text-sm text-brand-50">{roomanStats.alumni} alumni trained · {roomanStats.reach}</p>
          </div>
        </div>
      </Card>

      {news.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
      {news.length === 0 && (
        <div className="rounded-xl border border-line bg-surface py-12 text-center text-sm text-muted shadow-sm">
          No news yet — be the first to share an update.
        </div>
      )}

      {composing && <NewsComposer onClose={() => setComposing(false)} />}
    </div>
  )
}
