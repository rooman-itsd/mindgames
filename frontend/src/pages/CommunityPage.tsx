import { useMemo } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { useLayout } from '../components/layout/LayoutContext'
import { Button, Card } from '../components/ui'
import { PostCard } from '../components/feed/PostCard'
import { compact } from '../lib/format'

export function CommunityPage() {
  const { id } = useParams<{ id: string }>()
  const { communities, posts, toggleJoin } = useApp()
  const { openComposer } = useLayout()

  const community = communities.find((c) => c.id === id)
  const communityPosts = useMemo(() => posts.filter((p) => p.communityId === id), [posts, id])

  if (!community) return <Navigate to="/explore" replace />

  return (
    <div className="flex flex-col gap-4">
      {community.status === 'pending' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          ⏳ This community is awaiting admin approval. Only you can see it until it goes live.
        </div>
      )}
      {community.status === 'rejected' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          This community request was declined by the Rooman team.
        </div>
      )}
      {/* Banner */}
      <Card className="overflow-hidden">
        <div className={`h-24 bg-gradient-to-r ${community.color}`} />
        <div className="p-4">
          <div className="-mt-12 flex items-end gap-3">
            <span className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${community.color} text-3xl font-black text-white ring-4 ring-surface`}>
              {community.name[0]}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-ink">{community.name}</h1>
              <p className="flex items-center gap-1 text-sm text-muted">
                <Users size={14} /> {compact(community.memberCount)} members · {community.category}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="social" aria-pressed={community.joined} onClick={() => toggleJoin(community.id)}>
                {community.joined ? 'Joined' : 'Join'}
              </Button>
              {community.joined && (
                <Button variant="outline" onClick={() => openComposer({ communityId: community.id })}>Post</Button>
              )}
            </div>
          </div>
          <p className="mt-3 text-sm text-ink">{community.description}</p>
        </div>
      </Card>

      {/* Posts */}
      {communityPosts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
      {communityPosts.length === 0 && (
        <div className="rounded-xl border border-line bg-surface py-14 text-center text-sm text-muted shadow-sm">
          No posts in this community yet.{' '}
          {community.joined && (
            <button onClick={() => openComposer({ communityId: community.id })} className="font-semibold text-brand hover:underline">
              Be the first to post.
            </button>
          )}
        </div>
      )}
    </div>
  )
}
