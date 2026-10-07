import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Briefcase, Compass, MessageSquare, PenLine, Search, Settings, User as UserIcon } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { Avatar } from '../ui'
import { useLayout } from './LayoutContext'
import { NAV } from './navItems'

/** Anything can open the palette by dispatching this event (e.g. the navbar hint). */
export const OPEN_PALETTE_EVENT = 'rc:open-palette'

type Item = { id: string; group: 'Pages' | 'Actions' | 'People'; label: string; hint?: string; icon: ReactNode; run: () => void }

/**
 * Quick jump: press "/" (outside a text field) or Ctrl/Cmd+K anywhere in the
 * app. Lists pages, actions and matching members; arrows to move, Enter to
 * run, Escape to close (focus returns to where it was).
 */
export function CommandPalette() {
  const { users, currentUser } = useApp()
  const { openComposer, toggleChat } = useLayout()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const show = () => {
      returnFocus.current = document.activeElement as HTMLElement | null
      setQuery('')
      setSel(0)
      setOpen(true)
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        show()
      } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        show()
      }
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_PALETTE_EVENT, show)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_PALETTE_EVENT, show)
    }
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const close = () => {
    setOpen(false)
    returnFocus.current?.focus?.()
  }

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => navigate(to)
    const pages: Item[] = [
      ...NAV.map((n) => ({ id: n.to, group: 'Pages' as const, label: n.label, icon: <n.icon size={17} className={n.tone.icon} />, run: go(n.to) })),
      { id: '/profile', group: 'Pages', label: 'Your profile', icon: <UserIcon size={17} className="text-muted" />, run: go('/profile') },
      { id: '/notifications', group: 'Pages', label: 'Notifications', icon: <Bell size={17} className="text-muted" />, run: go('/notifications') },
      { id: '/settings', group: 'Pages', label: 'Settings', icon: <Settings size={17} className="text-muted" />, run: go('/settings') },
    ]
    const actions: Item[] = [
      { id: 'a:post', group: 'Actions', label: 'Create a post', hint: 'Share an update', icon: <PenLine size={17} className="text-brand" />, run: () => openComposer() },
      { id: 'a:job', group: 'Actions', label: 'Post a job', hint: 'Hiring post', icon: <Briefcase size={17} className="text-iris-600" />, run: () => openComposer({ type: 'Hiring' }) },
      { id: 'a:chat', group: 'Actions', label: 'Open messages', icon: <MessageSquare size={17} className="text-lagoon-600" />, run: () => toggleChat() },
      { id: 'a:community', group: 'Actions', label: 'Start a community', icon: <Compass size={17} className="text-clay-600" />, run: () => navigate('/explore', { state: { create: true } }) },
    ]
    const q = query.trim().toLowerCase()
    const match = (s: string) => !q || s.toLowerCase().includes(q)
    const people: Item[] = q
      ? users
          .filter((u) => u.id !== currentUser.id && (match(u.name) || match(u.company ?? '') || match(u.designation ?? '')))
          .slice(0, 6)
          .map((u) => ({
            id: `u:${u.id}`,
            group: 'People' as const,
            label: u.name,
            hint: [u.designation, u.company].filter(Boolean).join(' · '),
            icon: <Avatar name={u.name} src={u.photo} size={22} />,
            run: go(`/profile/${u.id}`),
          }))
      : []
    return [...pages.filter((i) => match(i.label)), ...actions.filter((i) => match(i.label)), ...people]
  }, [query, users, currentUser.id, navigate, openComposer, toggleChat])

  if (!open) return null

  const run = (i?: Item) => {
    if (!i) return
    setOpen(false)
    i.run()
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(items.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(items[sel])
    }
  }

  let lastGroup = ''
  return (
    <div className="fixed inset-0 z-[90] grid place-items-start justify-center bg-ink/30 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick jump"
        onMouseDown={(e) => e.stopPropagation()}
        className="animate-slidein w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={18} className="text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSel(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page, run an action, or find someone…"
            aria-label="Search pages, actions and people"
            className="w-full border-0 bg-transparent py-3.5 text-[15px] text-ink shadow-none outline-none placeholder:text-muted focus:shadow-none"
          />
          <kbd className="rounded border border-line px-1.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <ul role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches for “{query}”.</li>}
          {items.map((i, n) => {
            const header = i.group !== lastGroup ? i.group : null
            lastGroup = i.group
            return (
              <li key={i.id} role="presentation">
                {header && <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted">{header}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={n === sel}
                  onMouseEnter={() => setSel(n)}
                  onClick={() => run(i)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${n === sel ? 'bg-brand-50 text-brand' : 'text-ink'}`}
                >
                  <span className="grid w-6 shrink-0 place-items-center">{i.icon}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{i.label}</span>
                  {i.hint && <span className="hidden truncate text-xs text-muted sm:block">{i.hint}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
