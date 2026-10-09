import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { DOMAINS } from '../../types'
import { MAX_TAGS, joinTags, parseTags } from '../../lib/agenda'

/**
 * Pick one or more domains/skills for a group session: tap the standard
 * domains, or "Other" to type your own. Value is the stored text
 * ("Cloud, AI/ML, Kubernetes") so it drops into the existing `domain` field.
 */
export function DomainPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const tags = parseTags(value)
  const custom = tags.filter((t) => !DOMAINS.some((d) => d.toLowerCase() === t.toLowerCase()))
  const [typing, setTyping] = useState(custom.length > 0)
  const [draft, setDraft] = useState('')
  const full = tags.length >= MAX_TAGS
  const has = (t: string) => tags.some((x) => x.toLowerCase() === t.toLowerCase())

  const toggle = (t: string) => onChange(joinTags(has(t) ? tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...tags, t]))
  function addDraft() {
    // Commas let someone paste or type several at once.
    const parts = draft.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length) onChange(joinTags([...tags, ...parts]))
    setDraft('')
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {DOMAINS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            disabled={!has(d) && full}
            aria-pressed={has(d)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
              has(d) ? 'bg-brand text-white' : 'border border-line bg-surface text-muted hover:border-brand hover:text-brand'
            }`}
          >
            {d}
          </button>
        ))}
        {custom.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
            {t}
            <button type="button" onClick={() => toggle(t)} aria-label={`Remove ${t}`} className="rounded-full hover:bg-white/20">
              <X size={11} />
            </button>
          </span>
        ))}
        {!typing && (
          <button
            type="button"
            onClick={() => setTyping(true)}
            disabled={full}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand px-3 py-1 text-xs font-semibold text-brand hover:bg-brand-50 disabled:opacity-40"
          >
            <Plus size={11} /> Other
          </button>
        )}
      </div>
      {typing && (
        <div className="mt-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addDraft() }
            }}
            // Leaving the box keeps what was typed — clicking Save straight
            // after typing would otherwise drop it without a word.
            onBlur={() => { if (draft.trim()) addDraft() }}
            disabled={full}
            maxLength={30}
            placeholder={full ? `Up to ${MAX_TAGS} — remove one to add another` : 'Type a skill, e.g. Kubernetes, and press Enter'}
            aria-label="Add your own skill"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={addDraft}
            disabled={full || !draft.trim()}
            className="shrink-0 rounded-lg border border-brand px-3 text-xs font-semibold text-brand hover:bg-brand-50 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-muted">Pick as many as fit (up to {MAX_TAGS}). Helps the right people find it.</p>
    </div>
  )
}
