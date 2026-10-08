import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { DOMAINS } from '../../types'

/**
 * Add resource's Domain field. A dropdown of tick boxes (several allowed);
 * ticking "Others" opens a text box right beside it — Enter adds what is typed
 * as a domain, clears the box, and more can be added the same way. Every pick,
 * ticked or typed, shows as a chip with × in the field itself.
 */
export function DomainSelect({
  picked,
  onPicked,
  custom,
  onCustom,
  max,
}: {
  /** Ticked domains from the app's list. */
  picked: string[]
  onPicked: (next: string[]) => void
  /** Domains typed under "Others". */
  custom: string[]
  onCustom: (next: string[]) => void
  /** Most domains on one resource (the server's limit). */
  max: number
}) {
  const [open, setOpen] = useState(false)
  const [othersOn, setOthersOn] = useState(false)
  const [draft, setDraft] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const listId = useId()
  const total = picked.length + custom.length
  const full = total >= max

  // Closes on a click outside, or Escape (which then does not close the form).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const toggle = (d: string) => onPicked(picked.includes(d) ? picked.filter((x) => x !== d) : [...picked, d])

  const addTyped = () => {
    const d = draft.trim().replace(/\s+/g, ' ').slice(0, 40)
    if (!d || full) return
    const taken = [...picked, ...custom].some((x) => x.toLowerCase() === d.toLowerCase())
    if (!taken) onCustom([...custom, d])
    setDraft('')
  }

  return (
    <div ref={box} className="relative">
      {/* The field: chips for every pick, and the toggle. */}
      <div className="flex min-h-[40px] w-full items-center gap-1.5 rounded-lg border border-line bg-surface py-1 pr-1 pl-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {total === 0 && (
            <button type="button" onClick={() => setOpen(true)} className="px-1 py-1 text-left text-sm text-muted">
              Choose domains
            </button>
          )}
          {picked.map((d) => (
            <Chip key={d} label={d} onRemove={() => toggle(d)} />
          ))}
          {custom.map((d) => (
            <Chip key={`c-${d}`} label={d} onRemove={() => onCustom(custom.filter((x) => x !== d))} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={listId}
          aria-label={open ? 'Close domain list' : 'Open domain list'}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted hover:bg-page"
        >
          <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div id={listId} className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg">
          {DOMAINS.map((d) => {
            const on = picked.includes(d)
            return (
              <label
                key={d}
                className={`flex items-center gap-2.5 px-3 py-2 text-sm text-ink ${!on && full ? 'opacity-50' : 'cursor-pointer hover:bg-page'}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!on && full}
                  onChange={() => toggle(d)}
                  className="h-4 w-4 shrink-0 accent-[var(--color-brand)]"
                />
                {d}
              </label>
            )
          })}
          {/* "Others": the text box sits on the same row, right beside it. */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-ink">
            <label className="flex shrink-0 cursor-pointer items-center gap-2.5 py-0.5">
              <input
                type="checkbox"
                checked={othersOn}
                onChange={(e) => setOthersOn(e.target.checked)}
                className="h-4 w-4 shrink-0 accent-[var(--color-brand)]"
              />
              Others
            </label>
            {othersOn && (
              <input
                autoFocus
                value={draft}
                disabled={full}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter adds the domain — it must never submit the form.
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTyped()
                  }
                }}
                placeholder={full ? `Up to ${max} domains` : 'Type, then Enter'}
                aria-label="Type another domain and press Enter"
                maxLength={40}
                className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm"
              />
            )}
          </div>
          {full && <p className="px-3 pt-1 pb-1.5 text-[11px] text-muted">That's the most ({max}). Remove one to add another.</p>}
        </div>
      )}
    </div>
  )
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-0.5 rounded-full bg-brand-50 py-0.5 pr-0.5 pl-2.5 text-xs font-medium text-brand">
      <span className="truncate">{label}</span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-brand/10">
        <X size={12} />
      </button>
    </span>
  )
}
