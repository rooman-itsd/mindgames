import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, X } from 'lucide-react'
import { api } from '../lib/api'
import { workable } from '../lib/learningHub'
import { LearningHero } from '../components/learning/LearningHero'
import { LearningGoalBanner } from '../components/learning/LearningGoalBanner'
import { BrowseView } from '../components/learning/BrowseView'
import { StageView } from '../components/learning/StageView'
import { AssignedView } from '../components/learning/AssignedView'
import { MySharesView } from '../components/learning/MySharesView'
import { SavedList } from '../components/learning/SavedList'
import { ContributePanel } from '../components/learning/ContributePanel'
import { FilterPanel, SavedResourcesLink } from '../components/learning/FilterPanel'
import { ShareForm } from '../components/learning/ShareForm'
import { AddResourceForm } from '../components/learning/AddResourceForm'
import type { BrowseFilters, ContributeStage, LearningOverview } from '../types'

type Tab = 'all' | 'stage' | 'assigned' | 'shared'
/** What the main panel shows: a tab, or the saved list opened from the sidebar. */
type View = Tab | 'saved'

const NO_FILTERS: BrowseFilters = { q: '', tags: [], types: [], difficulty: [] }

/**
 * Learning resources, a top-level screen at /learning-resources.
 *
 * Top level rather than under /career-guidance because it is its own sidebar
 * tab, sitting directly above Career Guidance. Nesting it would have made
 * React Router mark BOTH sidebar entries active at once — NavLink treats a
 * parent path as active for its children — so the path mirrors the nav.
 *
 * The page is the network teaching itself. Everything on it was put there by a
 * member, and every item names them and offers a way to reach them:
 *   All Resources     — everything shared across the network, filterable
 *   For your roadmap — what members who passed my stage recommend
 *   From my mentors — what a mentor gave me directly
 *   I've shared     — what I have given back
 * Saved Resources opens from the sidebar, beside the Filter-by panel.
 *
 * The search box and the filters both drive All Resources: using either one
 * switches to it, so there is a single place results appear.
 */
export function CareerResourcesPage() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<LearningOverview | null>(null)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>('all')
  const [stepKey, setStepKey] = useState<string | null>(null)
  const [filters, setFilters] = useState<BrowseFilters>(NO_FILTERS)
  const [contribute, setContribute] = useState<ContributeStage[]>([])
  const [sharing, setSharing] = useState<{ topicKey?: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [reload, setReload] = useState(0)

  // Popped rather than replaced, so the browser's Back button doesn't appear
  // to do nothing — the same handler as ManageServicesPage, for the same
  // reason documented there.
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate('/career-guidance', { replace: true })
  }

  const loadOverview = useCallback(async () => {
    try {
      const o = await api.getLearningOverview()
      setOverview(o)
      // Start on the member's current stage — whichever load succeeds first
      // (the opening one, or "Try again" after it failed). A stage they have
      // already picked is kept, so a refresh after sharing doesn't move them.
      setStepKey((k) => k ?? o.currentStepKey ?? null)
      setFailed(false)
      return o
    } catch {
      setFailed(true)
      return null
    }
  }, [])

  const loadContribute = useCallback(async () => {
    try {
      setContribute((await api.getContributeStages()).stages)
    } catch {
      /* the page still works without the contribute strip */
    }
  }, [])

  useEffect(() => {
    void loadOverview()
    void loadContribute()
  }, [loadOverview, loadContribute])

  const stages = useMemo(() => workable(overview?.roadmap?.stages ?? []), [overview?.roadmap])

  /** Searching or filtering always lands in All Resources. */
  const changeFilters = (next: BrowseFilters) => {
    setFilters(next)
    setView('all')
  }

  const openShare = (topicKey?: string) => setSharing({ topicKey })
  const topicFor = (key: string) => contribute.find((c) => c.stepKey === key)?.topicKey

  /** Keeps the sidebar's "N saved" in step with saves and removals. */
  const bumpSaved = (delta: number) =>
    setOverview((o) => (o ? { ...o, counts: { ...o.counts, saved: Math.max(0, o.counts.saved + delta) } } : o))

  if (failed && !overview) {
    return (
      <div className="flex flex-col gap-4 pb-4">
        <LearningHero onBack={back} />
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Could not load your learning page.{' '}
          <button onClick={() => void loadOverview()} className="font-semibold underline">
            Try again
          </button>
        </p>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'all', label: 'All Resources' },
    { id: 'stage', label: 'For your roadmap' },
    { id: 'assigned', label: 'From my mentors', count: overview?.counts.assigned },
    { id: 'shared', label: "I've shared", count: overview?.counts.shared },
  ]

  return (
    <div className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <LearningHero onBack={back} />

        {/* The search box drives All Resources, together with the filters;
            Add resource sits beside it (any domain, attached files). */}
        <div className="flex items-stretch gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-sm focus-within:border-brand/50">
            <Search size={16} className="shrink-0 text-muted" />
            <input
              value={filters.q}
              onChange={(e) => changeFilters({ ...filters, q: e.target.value })}
              placeholder="Search resources, topics, or keywords..."
              aria-label="Search learning resources"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {filters.q && (
              <button
                onClick={() => setFilters({ ...filters, q: '' })}
                aria-label="Clear search"
                className="text-muted hover:text-ink"
              >
                <X size={14} />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add resource"
            className="btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold sm:px-4"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Add resource</span>
          </button>
        </div>

        {!overview ? (
          <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
            Loading your learning plan…
          </p>
        ) : (
          <>
            <LearningGoalBanner
              roadmap={overview.roadmap}
              currentStepKey={overview.currentStepKey}
              supportPreference={overview.supportPreference}
            />


            <div className="rounded-xl border border-line bg-surface shadow-sm">
              <nav
                className="flex gap-1 overflow-x-auto border-b border-line px-2"
                aria-label="Learning sections"
              >
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setView(t.id)}
                    aria-current={view === t.id ? 'page' : undefined}
                    className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                      view === t.id
                        ? 'border-brand text-brand'
                        : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    {t.label}
                    {!!t.count && (
                      <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 text-[10px] text-brand">
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </nav>

              <div className="p-4">
                {view === 'all' && (
                  <BrowseView
                    key={reload}
                    filters={filters}
                    onClearFilters={() => setFilters(NO_FILTERS)}
                    onSavedChange={bumpSaved}
                  />
                )}
                {view === 'stage' && (
                  <StageView
                    stages={stages}
                    stepKey={stepKey}
                    currentStepKey={overview.currentStepKey}
                    onSelect={setStepKey}
                    reloadKey={reload}
                    onShareHere={(key) => openShare(topicFor(key))}
                    onSavedChange={bumpSaved}
                  />
                )}
                {view === 'assigned' && <AssignedView />}
                {view === 'shared' && <MySharesView key={reload} onShare={() => openShare()} onSavedChange={bumpSaved} canShare />}
                {view === 'saved' && <SavedList onCountChange={bumpSaved} />}
              </div>
            </div>

            {/* The alum's half, after the lists: anyone can share for any
                stage of their roadmap. */}
            <ContributePanel stages={contribute} onShare={openShare} />
          </>
        )}
      </div>

      {/* This page's right column: the filters for All Resources, and the
          member's saved list. It takes the place of the app's general rail on
          this page only. */}
      <aside className="flex w-full shrink-0 flex-col gap-4 lg:sticky lg:top-20 lg:w-64">
        <FilterPanel filters={filters} onChange={changeFilters} refreshKey={reload} />
        <SavedResourcesLink
          count={overview?.counts.saved ?? 0}
          active={view === 'saved'}
          onClick={() => setView('saved')}
        />
      </aside>

      {/* Opens even with no roadmap: stages are optional, and only the
          member's own roadmap stages are offered. */}
      {adding && (
        <AddResourceForm
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false)
            void loadOverview()
            // Straight to "I've shared": All Resources leaves out the
            // viewer's own items, so it would look like nothing happened.
            setView('shared')
            setReload((n) => n + 1)
          }}
        />
      )}

      {sharing && (
        <ShareForm
          stages={contribute}
          // Only a stage the member opened the form from; otherwise empty.
          defaultTopicKey={sharing.topicKey}
          onClose={() => setSharing(null)}
          onShared={() => {
            setSharing(null)
            void loadOverview()
            void loadContribute()
            // Straight to "I've shared", like Add resource: All Resources
            // leaves out the viewer's own items, so it would look like
            // nothing happened.
            setView('shared')
            setReload((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}
