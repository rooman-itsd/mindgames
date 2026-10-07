import { useEffect, useState } from 'react'
import { Bookmark, ChevronDown, ChevronRight, Funnel, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { DIFFICULTY_FILTERS, TYPE_FILTERS, isFiltering, toggleValue } from '../../lib/learningHub'
import type { BrowseFilters, SkillTag } from '../../types'

/** Skills shown before "Show more". */
const SKILLS_COLLAPSED = 5
/** How long typing in "Search skills…" pauses before it asks the server. */
const SKILL_SEARCH_DEBOUNCE_MS = 250

/**
 * "Filter by" — the panel that narrows All Resources by Skill / Topic, Resource
 * Type and Difficulty Level.
 *
 * The skill list is the network's most-used tags, read from a counter table
 * (never by counting shares); "Search skills…" asks the server for tags
 * starting with what was typed. A skill already ticked stays listed and ticked
 * even when a search would hide it, so it can always be unticked.
 */
export function FilterPanel({
  filters,
  onChange,
  refreshKey = 0,
}: {
  filters: BrowseFilters
  onChange: (next: BrowseFilters) => void
  /** Bumped after a share, so a newly used skill appears in the list. */
  refreshKey?: number
}) {
  const [popular, setPopular] = useState<SkillTag[]>([])
  const [skillQuery, setSkillQuery] = useState('')
  const [found, setFound] = useState<SkillTag[] | null>(null)
  const [expanded, setExpanded] = useState(false)
  // Labels for ticked tags, so they display as typed even when not listed.
  const [labels, setLabels] = useState<Record<string, string>>({})

  useEffect(() => {
    api.getLearningTags().then(setPopular, () => setPopular([]))
  }, [refreshKey])

  useEffect(() => {
    const text = skillQuery.trim()
    if (!text) {
      setFound(null)
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      api.getLearningTags(text, ctrl.signal).then(setFound, () => {})
    }, SKILL_SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [skillQuery])

  const source = found ?? popular
  const visible = found || expanded ? source : source.slice(0, SKILLS_COLLAPSED)
  // Ticked skills the current list doesn't show, kept at the top.
  const pinned = filters.tags
    .filter((t) => !visible.some((v) => v.tag === t))
    .map((t) => ({ tag: t, label: labels[t] ?? t, count: 0 }))

  const toggleTag = (s: SkillTag) => {
    setLabels((prev) => ({ ...prev, [s.tag]: s.label }))
    onChange({ ...filters, tags: toggleValue(filters.tags, s.tag) })
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Funnel size={15} /> Filter by
        </h2>
        {isFiltering({ ...filters, q: '' }) && (
          <button
            onClick={() => onChange({ ...filters, tags: [], types: [], difficulty: [] })}
            className="text-xs font-semibold text-brand hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <Group title="Skill / Topic">
        <label className="mb-2 flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 focus-within:border-brand/50">
          <Search size={13} className="shrink-0 text-muted" />
          <input
            value={skillQuery}
            onChange={(e) => setSkillQuery(e.target.value)}
            placeholder="Search skills..."
            aria-label="Search skills"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
        </label>
        {[...pinned, ...visible].map((s) => (
          <Check
            key={s.tag}
            label={s.label}
            count={s.count || undefined}
            checked={filters.tags.includes(s.tag)}
            onChange={() => toggleTag(s)}
          />
        ))}
        {found && found.length === 0 && <p className="text-[11px] text-muted">No skills match.</p>}
        {!found && popular.length === 0 && <p className="text-[11px] text-muted">No skills tagged yet.</p>}
        {!found && popular.length > SKILLS_COLLAPSED && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand"
          >
            {expanded ? 'Show less' : 'Show more'} <ChevronDown size={12} className={expanded ? 'rotate-180' : ''} />
          </button>
        )}
      </Group>

      <Group title="Resource Type">
        {TYPE_FILTERS.map((t) => (
          <Check
            key={t.value}
            label={t.label}
            checked={filters.types.includes(t.value)}
            onChange={() => onChange({ ...filters, types: toggleValue(filters.types, t.value) })}
          />
        ))}
      </Group>

      <Group title="Difficulty Level">
        {DIFFICULTY_FILTERS.map((d) => (
          <Check
            key={d.value}
            label={d.label}
            checked={filters.difficulty.includes(d.value)}
            onChange={() => onChange({ ...filters, difficulty: toggleValue(filters.difficulty, d.value) })}
          />
        ))}
      </Group>
    </section>
  )
}

/** "Saved Resources · N saved" — opens the member's saved list. */
export function SavedResourcesLink({ count, active, onClick }: { count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center gap-3 rounded-xl border bg-surface p-4 text-left shadow-sm ${
        active ? 'border-brand/50' : 'border-line hover:border-brand/30'
      }`}
    >
      <Bookmark size={16} className="shrink-0 text-ink" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">Saved Resources</span>
        <span className="block text-xs text-muted">{count} saved</span>
      </span>
      <ChevronRight size={16} className="text-muted" />
    </button>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-line pt-3">
      <h3 className="mb-2 text-xs font-bold text-ink">{title}</h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function Check({
  label,
  checked,
  onChange,
  count,
}: {
  label: string
  checked: boolean
  onChange: () => void
  count?: number
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-3.5 w-3.5 accent-brand" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className="text-[10px] text-muted">{count}</span>}
    </label>
  )
}
