import { Search } from 'lucide-react'

/**
 * The one search field every Mentorship tab uses — same look and place
 * (just above the lists it filters), so it's always where you expect it.
 * type="search" gives the browser's own clear (×) and Esc-to-clear.
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  className = '',
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
  /** Accessible name, e.g. "Search mentors". */
  label: string
  className?: string
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 shadow-sm focus-within:border-brand ${className}`}
    >
      <Search size={15} className="shrink-0 text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="w-full border-0 bg-transparent p-0 text-sm text-ink shadow-none outline-none placeholder:text-muted focus:shadow-none"
      />
    </label>
  )
}
