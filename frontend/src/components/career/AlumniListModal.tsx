import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { GraduationCap, MessageSquare, Search, Sparkles, UserPlus, Users, Wrench, X } from 'lucide-react'
import { Avatar, Button } from '../ui'
import { useApp } from '../../store/AppStore'
import { ConnectNoteModal } from '../referral/ConnectNoteModal'
import type { AlumniHelper } from '../../types'

/**
 * The full list behind "People from Rooman who can help you".
 *
 * Actions follow the connection state rather than showing everything to
 * everyone: you cannot message someone you aren't connected to, so an
 * unconnected row offers Connect (which carries the required note) and a
 * connected one offers Message. Booking is offered only for mentors, because
 * only they can hold a session.
 */
export function AlumniListModal({
  people,
  title = 'People from Rooman who can help you',
  subtitle,
  onClose,
  onBook,
}: {
  people: AlumniHelper[]
  /** Defaults to the roadmap-wide heading; a stage-scoped open passes its
   *  own so "matched to your roadmap" doesn't imply a broader list than
   *  what's actually shown. */
  title?: string
  /** Defaults to "N matched to your roadmap" when omitted. */
  subtitle?: string
  onClose: () => void
  onBook: (person: AlumniHelper) => void
}) {
  const { connectionState, messageUser, notify } = useApp()
  const [q, setQ] = useState('')
  const [connectTo, setConnectTo] = useState<{ id: string; name: string } | null>(null)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return people
    return people.filter((p) =>
      [p.name, p.designation, p.company, p.reason, ...(p.expertise ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [people, q])

  async function openChat(person: AlumniHelper) {
    try {
      await messageUser(person.id)
      onClose()
    } catch {
      notify('Could not open that conversation.', 'error')
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div
          className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header stays put while the list scrolls under it. */}
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
                <Users size={20} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink">{title}</h2>
                <p className="text-sm text-muted">
                  {subtitle ??
                    `${people.length} ${people.length === 1 ? 'person' : 'people'} matched to your roadmap`}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-gray-100" aria-label="Close">
              <X size={20} />
            </button>
          </div>

          <div className="border-b border-line px-5 py-3">
            <div className="relative">
              <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, role, company or skill"
                className="w-full rounded-lg border border-line py-2 pr-3 pl-9 text-sm outline-none focus:border-brand"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-3">
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                {people.length === 0
                  ? 'No alumni matched to your roadmap yet.'
                  : `No one matches “${q}”.`}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((p) => (
                  <Row
                    key={p.id}
                    person={p}
                    state={connectionState(p.id)}
                    onConnect={() => setConnectTo({ id: p.id, name: p.name })}
                    onMessage={() => openChat(p)}
                    onBook={() => {
                      onBook(p)
                      onClose()
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-line px-5 py-3 text-center">
            <Link to="/network/matches" onClick={onClose} className="text-sm font-semibold text-brand hover:underline">
              Browse the whole network →
            </Link>
          </div>
        </div>
      </div>

      {connectTo && <ConnectNoteModal user={connectTo} onClose={() => setConnectTo(null)} />}
    </>,
    document.body,
  )
}

function Row({
  person,
  state,
  onConnect,
  onMessage,
  onBook,
}: {
  person: AlumniHelper
  state: 'none' | 'pending' | 'connected'
  onConnect: () => void
  onMessage: () => void
  onBook: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:bg-gray-50/70">
      <Avatar name={person.name} src={person.photo} size={44} to={`/profile/${person.id}`} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link to={`/profile/${person.id}`} className="truncate text-sm font-bold text-ink hover:underline">
            {person.name}
          </Link>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              person.isMentor ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}
          >
            {person.isMentor ? 'Mentor' : 'Alumni'}
          </span>
          {person.similarPath && (
            <span className="flex items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
              <Sparkles size={10} /> Similar path
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted">
          {[person.designation, person.company].filter(Boolean).join(' · ')}
        </p>
        {person.expertise.length > 0 && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-muted">
            <Wrench size={11} className="mt-0.5 shrink-0" />
            <span className="line-clamp-1">{person.expertise.join(', ')}</span>
          </p>
        )}
        {person.reason && (
          <p className="mt-1 flex items-start gap-1.5 text-[11px] text-muted">
            <GraduationCap size={11} className="mt-0.5 shrink-0" />
            <span className="line-clamp-1">Relevant to: {person.reason}</span>
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {state === 'connected' ? (
          <Button variant="outline" icon={<MessageSquare size={13} />} className="!px-2.5 !py-1.5 !text-xs" onClick={onMessage}>
            Message
          </Button>
        ) : state === 'pending' ? (
          <span className="rounded-full bg-gray-100 px-2.5 py-1.5 text-xs font-semibold text-muted">
            Request sent
          </span>
        ) : (
          <Button variant="outline" icon={<UserPlus size={13} />} className="!px-2.5 !py-1.5 !text-xs" onClick={onConnect}>
            Connect
          </Button>
        )}
        {person.isMentor && (
          <Button className="!px-2.5 !py-1.5 !text-xs" onClick={onBook}>
            Book session
          </Button>
        )}
      </div>
    </div>
  )
}
