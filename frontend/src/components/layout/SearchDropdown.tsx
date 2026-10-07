import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, Briefcase, FileText, Hash, SearchX } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { matchesCommunityQuery, matchesPostQuery, matchesUserQuery } from '../../lib/search'
import { Avatar, PostTypeBadge } from '../ui'

type Tab = 'All' | 'People' | 'Posts' | 'Jobs' | 'Mentors' | 'Communities'
const TABS: Tab[] = ['All', 'People', 'Posts', 'Jobs', 'Mentors', 'Communities']

/** Categorised live results under the navbar search box. */
export function SearchDropdown({ onClose }: { onClose: () => void }) {
  const { query, setQuery, users, posts, communities, currentUser } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('All')

  const q = query.trim()

  const people = useMemo(
    () => users.filter((u) => !u.isAdmin && u.id !== currentUser.id && matchesUserQuery(u, q)),
    [users, currentUser.id, q],
  )
  const mentors = useMemo(() => people.filter((u) => u.isMentor), [people])
  const matchedPosts = useMemo(
    () => posts.filter((p) => matchesPostQuery(p, users, q)),
    [posts, users, q],
  )
  const jobs = useMemo(
    () => matchedPosts.filter((p) => p.type === 'Hiring' && p.active !== false),
    [matchedPosts],
  )
  const plainPosts = useMemo(
    () => matchedPosts.filter((p) => p.type !== 'Hiring'),
    [matchedPosts],
  )
  const matchedCommunities = useMemo(
    () => communities.filter((c) => c.status !== 'pending' && matchesCommunityQuery(c, q)),
    [communities, q],
  )

  // Jump to a result: close the panel and clear the search.
  function go(path: string) {
    onClose()
    setQuery('')
    navigate(path)
  }
  // "See all": keep the query so the target page arrives pre-filtered.
  function seeAll(path: string) {
    onClose()
    navigate(path)
  }

  const limit = tab === 'All' ? 3 : 8
  const empty =
    people.length + matchedPosts.length + matchedCommunities.length === 0

  return (
    <div className="absolute top-full right-0 left-0 z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl">
      {/* Category tabs */}
      <div className="sticky top-0 flex flex-wrap items-center gap-1 border-b border-line bg-surface px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              tab === t ? 'bg-brand text-white' : 'bg-gray-100 text-muted hover:bg-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {empty ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <SearchX size={28} className="text-gray-300" />
          <p className="text-sm text-muted">No results for “{q}”.</p>
        </div>
      ) : (
        <div className="pb-2">
          {(tab === 'All' || tab === 'People') && people.length > 0 && (
            <Section title="People" count={people.length} showAll={tab === 'All'} onSeeAll={() => seeAll('/network')}>
              {people.slice(0, limit).map((u) => (
                <Row key={u.id} onClick={() => go(`/profile/${u.id}`)}>
                  <Avatar name={u.name} src={u.photo} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{u.name}</p>
                    <p className="truncate text-xs text-muted">
                      {u.designation}{u.company ? ` · ${u.company}` : ''}{u.city ? ` · ${u.city}` : ''}
                    </p>
                  </div>
                </Row>
              ))}
            </Section>
          )}

          {(tab === 'All' || tab === 'Posts') && plainPosts.length > 0 && (
            <Section title="Posts" count={plainPosts.length} showAll={tab === 'All'} onSeeAll={() => seeAll('/home')}>
              {plainPosts.slice(0, limit).map((p) => {
                const author = users.find((u) => u.id === p.authorId)
                return (
                  <Row key={p.id} onClick={() => go(`/home#post-${p.id}`)}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-page text-muted">
                      <FileText size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{p.content}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        {author?.name} <PostTypeBadge type={p.type} />
                      </p>
                    </div>
                  </Row>
                )
              })}
            </Section>
          )}

          {(tab === 'All' || tab === 'Jobs') && jobs.length > 0 && (
            <Section title="Jobs" count={jobs.length} showAll={tab === 'All'} onSeeAll={() => seeAll('/jobs')}>
              {jobs.slice(0, limit).map((p) => (
                <Row key={p.id} onClick={() => seeAll('/jobs')}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-green-50 text-green-600">
                    <Briefcase size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{p.role ?? 'Open role'}</p>
                    <p className="truncate text-xs text-muted">
                      {p.company}{p.city ? ` · ${p.city}` : ''} · {p.applicantsCount ?? 0} applicant{(p.applicantsCount ?? 0) === 1 ? '' : 's'}
                    </p>
                  </div>
                </Row>
              ))}
            </Section>
          )}

          {(tab === 'All' || tab === 'Mentors') && mentors.length > 0 && (
            <Section title="Mentors" count={mentors.length} showAll={tab === 'All'} onSeeAll={() => seeAll('/mentorship')}>
              {mentors.slice(0, limit).map((u) => (
                <Row key={u.id} onClick={() => go(`/profile/${u.id}`)}>
                  <Avatar name={u.name} src={u.photo} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                      {u.name}
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                        <Award size={10} /> Mentor
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted">
                      {u.domain} · {u.sessionsConducted ?? 0} sessions conducted
                    </p>
                  </div>
                </Row>
              ))}
            </Section>
          )}

          {(tab === 'All' || tab === 'Communities') && matchedCommunities.length > 0 && (
            <Section title="Communities" count={matchedCommunities.length} showAll={tab === 'All'} onSeeAll={() => seeAll('/explore')}>
              {matchedCommunities.slice(0, limit).map((c) => (
                <Row key={c.id} onClick={() => go(`/community/${c.id}`)}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-purple-50 text-purple-600">
                    <Hash size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                    <p className="truncate text-xs text-muted">
                      {c.category} · {c.memberCount} member{c.memberCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </Row>
              ))}
            </Section>
          )}

          {/* Tab-specific empty states */}
          {tab === 'People' && people.length === 0 && <TabEmpty label="people" q={q} />}
          {tab === 'Posts' && plainPosts.length === 0 && <TabEmpty label="posts" q={q} />}
          {tab === 'Jobs' && jobs.length === 0 && <TabEmpty label="jobs" q={q} />}
          {tab === 'Mentors' && mentors.length === 0 && <TabEmpty label="mentors" q={q} />}
          {tab === 'Communities' && matchedCommunities.length === 0 && <TabEmpty label="communities" q={q} />}
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  count,
  showAll,
  onSeeAll,
  children,
}: {
  title: string
  count: number
  showAll: boolean
  onSeeAll: () => void
  children: ReactNode
}) {
  return (
    <div className="pt-2">
      <div className="flex items-center justify-between px-4 py-1">
        <p className="text-xs font-bold tracking-wide text-muted uppercase">{title}</p>
        {showAll && count > 3 && (
          <button onClick={onSeeAll} className="text-xs font-semibold text-brand hover:underline">
            See all {count}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function Row({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-page">
      {children}
    </button>
  )
}

function TabEmpty({ label, q }: { label: string; q: string }) {
  return <p className="px-4 py-8 text-center text-sm text-muted">No {label} match “{q}”.</p>
}
