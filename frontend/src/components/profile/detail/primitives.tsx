// Small form primitives shared by the rich-profile sections. Deliberately
// matched to the styling the two existing forms already use, so the appended
// sections look native next to the fields that were always there.

import { useState, type ReactNode } from 'react'
import { ChevronDown, Lock, Plus, Unlock, X } from 'lucide-react'

export const fieldCx =
  'w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand'
export const labelCx = 'mb-1 block text-sm font-medium text-ink'

/** A collapsible group. Everything new is optional, so nothing starts open
 *  except sections the caller wants to draw attention to. */
export function DetailSection({
  title,
  hint,
  count,
  defaultOpen = false,
  children,
}: {
  title: string
  hint?: string
  /** Shown as a badge — how many entries this section already holds. */
  count?: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">{title}</span>
          {!!count && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand">
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
          {hint && <p className="text-xs text-muted">{hint}</p>}
          {children}
        </div>
      )}
    </div>
  )
}

/** Marks a field that is stored but shown to nobody but the owner. */
export function PrivateHint({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1 text-xs text-muted">
      <Lock size={11} /> {children}
    </p>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className={labelCx}>{label}</label>
      <input
        className={fieldCx}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
}: {
  label: string
  value: string
  onChange: (v: T) => void
  options: readonly T[]
  placeholder?: string
}) {
  return (
    <div>
      <label className={labelCx}>{label}</label>
      <select className={fieldCx} value={value} onChange={(e) => onChange(e.target.value as T)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

export function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input
        type="checkbox"
        className="h-4 w-4 accent-brand"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

/**
 * A padlock switch. Used for the sensitive fields, where "locked" is the
 * meaningful default state and a plain checkbox reads as an opt-out.
 */
export function LockRow({
  label,
  locked,
  onChange,
}: {
  label: string
  locked: boolean
  /** Called with true when the member OPENS the lock (makes it public). */
  onChange: (open: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(locked)}
      aria-pressed={!locked}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
        locked
          ? 'border-line bg-page text-muted'
          : 'border-brand/30 bg-brand-50 text-ink'
      }`}
    >
      {locked ? <Lock size={13} className="shrink-0" /> : <Unlock size={13} className="shrink-0 text-brand" />}
      <span className="flex-1">{label}</span>
      <span className={locked ? 'text-muted' : 'font-bold text-brand'}>
        {locked ? 'Locked' : 'Visible'}
      </span>
    </button>
  )
}

/**
 * Chip list editor. Typing a comma or pressing Enter commits the entry, which
 * avoids the classic trap of comma-separated text inputs: a value the member
 * never sees parsed until after they save.
 */
export function TagField({
  label,
  values,
  onChange,
  placeholder,
  max = 20,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  max?: number
}) {
  const [draft, setDraft] = useState('')

  function commit(raw: string) {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    const next = [...values]
    for (const p of parts) {
      // Case-insensitive de-dupe: "React" and "react" are the same tag.
      if (next.length >= max) break
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p)
    }
    onChange(next)
    setDraft('')
  }

  return (
    <div>
      <label className={labelCx}>{label}</label>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-line p-2 focus-within:border-brand">
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 rounded-full bg-page px-2.5 py-1 text-xs font-medium text-ink"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`Remove ${v}`}
              className="text-muted hover:text-red-500"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={values.length === 0 ? placeholder : ''}
          onChange={(e) => {
            // A pasted "a, b, c" commits every entry at once.
            if (e.target.value.includes(',')) commit(e.target.value)
            else setDraft(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(draft)
            } else if (e.key === 'Backspace' && !draft && values.length) {
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={() => commit(draft)}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      </div>
      {values.length >= max && (
        <p className="mt-1 text-xs text-muted">That's the maximum of {max}.</p>
      )}
    </div>
  )
}

/**
 * Generic add/edit/remove list editor for the structured entries (experience,
 * education, projects…). One implementation for all five, because they differ
 * only in their fields and their summary line.
 */
export function EntryListEditor<T>({
  entries,
  onChange,
  blank,
  summary,
  fields,
  addLabel,
  max,
}: {
  entries: T[]
  onChange: (v: T[]) => void
  /** A fresh, empty entry. */
  blank: () => T
  /** One-line label for a collapsed entry. */
  summary: (entry: T) => string
  /** Renders the inputs for one entry. */
  fields: (entry: T, set: (patch: Partial<T>) => void) => ReactNode
  addLabel: string
  max: number
}) {
  // Which entry is expanded. A newly added one opens immediately.
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const update = (i: number, patch: Partial<T>) =>
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))

  const move = (i: number, delta: number) => {
    const j = i + delta
    if (j < 0 || j >= entries.length) return
    const next = [...entries]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
    setOpenIndex(j)
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, i) => {
        const open = openIndex === i
        return (
          <div key={i} className="rounded-lg border border-line bg-page/50">
            <div className="flex items-center gap-1 px-3 py-2">
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : i)}
                className="flex-1 truncate text-left text-sm font-medium text-ink"
              >
                {summary(entry) || <span className="text-muted">Untitled</span>}
              </button>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Move up"
                className="px-1 text-xs text-muted disabled:opacity-30 hover:text-ink"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === entries.length - 1}
                aria-label="Move down"
                className="px-1 text-xs text-muted disabled:opacity-30 hover:text-ink"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(entries.filter((_, idx) => idx !== i))
                  setOpenIndex(null)
                }}
                aria-label="Remove"
                className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-500"
              >
                <X size={14} />
              </button>
            </div>
            {open && (
              <div className="flex flex-col gap-2 border-t border-line bg-surface px-3 py-3">
                {fields(entry, (patch) => update(i, patch))}
              </div>
            )}
          </div>
        )
      })}

      {entries.length < max ? (
        <button
          type="button"
          onClick={() => {
            onChange([...entries, blank()])
            setOpenIndex(entries.length)
          }}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2 text-sm font-medium text-brand hover:bg-brand-50"
        >
          <Plus size={14} /> {addLabel}
        </button>
      ) : (
        <p className="text-xs text-muted">That's the maximum of {max} entries.</p>
      )}
    </div>
  )
}
