import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plus, TrendingUp, Users, X } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { Button, Card, Pill, SectionTitle } from '../components/ui'
import { matchesCommunityQuery } from '../lib/search'
import { compact } from '../lib/format'
import type { Community, CommunityCategory } from '../types'
import { EmptyState } from '../components/ui/EmptyState'
import { Compass } from 'lucide-react'

const TABS: Array<{ key: string; label: string }> = [
  { key: 'All', label: 'All' },
  { key: 'Most Visited', label: 'Most Visited' },
  { key: 'Domain', label: 'Domain' },
  { key: 'City', label: 'City' },
  { key: 'Batch', label: 'Batch' },
]

export function ExploreCommunities() {
  const { communities, toggleJoin, query } = useApp()
  const location = useLocation()
  const [tab, setTab] = useState('All')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if ((location.state as { create?: boolean } | null)?.create) setShowCreate(true)
  }, [location.state])

  const filtered = useMemo(() => {
    let list = communities.filter((c) => matchesCommunityQuery(c, query))
    if (tab === 'Most Visited') list = [...list].sort((a, b) => b.memberCount - a.memberCount)
    else if (tab !== 'All') list = list.filter((c) => c.category === tab)
    return list
  }, [communities, query, tab])

  const trending = [...communities].sort((a, b) => b.memberCount - a.memberCount).slice(0, 3)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Communities</h1>
        <Button variant="cta" icon={<Plus size={16} />} onClick={() => setShowCreate(true)}>Start a Community</Button>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Pill key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>{t.label}</Pill>
        ))}
      </div>

      {/* Trending */}
      {tab === 'All' && !query && (
        <section>
          <SectionTitle>
            <span className="flex items-center gap-1.5"><TrendingUp size={18} className="text-brand" /> Trending Communities</span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {trending.map((c) => (
              <CommunityCard key={c.id} c={c} onToggle={() => toggleJoin(c.id)} compactCard />
            ))}
          </div>
        </section>
      )}

      {/* Recommended / all */}
      <section>
        <SectionTitle>{tab === 'All' ? 'Recommended for You' : `${tab} Communities`}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((c) => (
            <CommunityCard key={c.id} c={c} onToggle={() => toggleJoin(c.id)} />
          ))}
          {filtered.length === 0 && (
            <EmptyState
              className="sm:col-span-2 lg:col-span-3"
              icon={<Compass size={28} />}
              title="No communities match"
              body="Can't find your people? Start the community and invite them in."
              action={{ label: 'Start a community', onClick: () => setShowCreate(true) }}
            />
          )}
        </div>
      </section>

      {showCreate && <CreateCommunityModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CommunityCard({ c, onToggle, compactCard = false }: { c: Community; onToggle: () => void; compactCard?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className={`bg-gradient-to-r ${c.color} ${compactCard ? 'h-12' : 'h-16'}`} />
      <div className="p-4">
        <div className="-mt-8 mb-2 flex items-end justify-between">
          <span className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${c.color} text-lg font-black text-white ring-4 ring-surface`}>
            {c.name[0]}
          </span>
          <span className="rounded-full bg-page px-2 py-0.5 text-xs font-medium text-muted">{c.category}</span>
        </div>
        <Link to={`/community/${c.id}`} className="font-bold text-ink hover:underline">{c.name}</Link>
        <p className="flex items-center gap-1 text-xs text-muted">
          <Users size={12} /> {compact(c.memberCount)} members
        </p>
        {!compactCard && <p className="mt-2 line-clamp-2 text-sm text-muted">{c.description}</p>}
        {c.status === 'pending' ? (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-semibold text-amber-700">
            Awaiting admin approval
          </div>
        ) : c.status === 'rejected' ? (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-center text-xs font-semibold text-red-500">
            Declined by admin
          </div>
        ) : (
          <Button variant="social" aria-pressed={c.joined} className="mt-3 w-full" onClick={onToggle}>
            {c.joined ? 'Joined' : 'Join'}
          </Button>
        )}
      </div>
    </Card>
  )
}

function CreateCommunityModal({ onClose }: { onClose: () => void }) {
  const { createCommunity } = useApp()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<CommunityCategory>('Domain')
  const [tag, setTag] = useState('')

  function submit() {
    if (!name.trim()) return
    createCommunity({ name: name.trim(), description: description.trim() || 'A new Rooman alumni community.', category, tag: tag.trim() || name.trim() })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="animate-slidein w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Start a Community</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-gray-100"><X size={20} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Community name" className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What is this community about?" className="resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          <div className="grid grid-cols-2 gap-3">
            <select value={category} onChange={(e) => setCategory(e.target.value as CommunityCategory)} className="rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand">
              {(['Domain', 'City', 'Batch', 'General'] as CommunityCategory[]).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag (e.g. Cloud)" className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
          </div>
          <Button onClick={submit} disabled={!name.trim()}>Create Community</Button>
        </div>
      </div>
    </div>
  )
}
