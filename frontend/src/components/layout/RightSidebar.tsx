import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Briefcase, Calendar, Trophy, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { Avatar, Button, Card } from '../ui'
import { CountUp } from '../ui/CountUp'
import { roleLine, timeAgo } from '../../lib/format'
import { useLeaderboard } from '../../hooks/useLeaderboard'
import { useUpcomingEvents } from '../../hooks/useUpcomingEvents'

export function RightSidebar() {
  const { users, suggestionIds, sendConnect, connectionState, posts, sessions, userById } = useApp()
  const [noteModal, setNoteModal] = useState<{ userId: string; name: string } | null>(null)
  const [note, setNote] = useState('')

  const handleConnect = (userId: string) => {
    setNoteModal({ userId, name: users.find((u) => u.id === userId)?.name || 'Member' })
    setNote('')
  }

  const handleSendWithNote = () => {
    const wordCount = note.split(/\s+/).filter(Boolean).length
    if (noteModal && wordCount >= 25) {
      sendConnect(noteModal.userId, note.trim())
      setNoteModal(null)
      setNote('')
    }
  }

  const suggestions = suggestionIds
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean)
    .slice(0, 3) as NonNullable<ReturnType<typeof userById>>[]

  const openings = posts.filter((p) => p.type === 'Hiring' && p.active !== false).slice(0, 3)
  const leaders = useLeaderboard()
  // Approved-only: /api/events also returns the caller's own pending/rejected
  // events, which are host-only and must not surface here.
  const nextEvents = useUpcomingEvents(2)
  // Confirmed sessions first, then requests still awaiting the mentor.
  const upcoming = [
    ...sessions.filter((s) => s.status === 'upcoming'),
    ...sessions.filter((s) => s.status === 'requested'),
  ].slice(0, 3)

  return (
    <>
      <aside className="fixed bottom-0 right-[calc(var(--shell-gutter)+14px)] top-14 hidden w-[288px] overflow-y-auto py-3.5 xl:block">
        <div className="flex flex-col gap-4">
        {/* People you may know */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">People You May Know</h3>
            <Link to="/network" className="text-xs font-semibold text-brand hover:underline">
              See all
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {suggestions.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5">
                <Avatar name={u.name} src={u.photo} size={40} to={`/profile/${u.id}`} />
                <div className="min-w-0 flex-1">
                  <Link to={`/profile/${u.id}`} className="block truncate text-sm font-semibold text-ink hover:underline">
                    {u.name}
                  </Link>
                  {roleLine(u) && (
                    <p className="truncate text-xs text-muted">{roleLine(u)}</p>
                  )}
                </div>
                <Button
                  variant="social"
                    aria-pressed={connectionState(u.id) === 'pending'}
                  className="!px-3 !py-1 text-xs"
                  disabled={connectionState(u.id) === 'pending'}
                  onClick={() => handleConnect(u.id)}
                >
                  {connectionState(u.id) === 'pending' ? 'Sent' : 'Connect'}
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* Open opportunities */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <Briefcase size={16} className="text-brand" /> Open Opportunities
            </h3>
            <Link to="/jobs" className="text-xs font-semibold text-brand hover:underline">
              See all
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {openings.map((p) => {
              const a = userById(p.authorId)
              return (
                <Link key={p.id} to="/jobs" className="block rounded-lg border border-line p-3 hover:border-brand">
                  <p className="text-sm font-semibold text-ink">{p.role ?? 'Open role'}</p>
                  <p className="text-xs text-muted">
                    {p.company ?? a?.company} · {p.city ?? 'Remote'}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">Posted {timeAgo(p.createdAt)}</p>
                </Link>
              )
            })}
          </div>
        </Card>

        {/* Mentorship sessions */}
        {leaders.length > 0 && (
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">
              <Trophy size={16} className="text-brand" /> Top Contributors
            </h3>
            <div className="flex flex-col gap-2.5">
              {leaders.map((l, i) => (
                <Link key={l.id} to={`/profile/${l.id}`} className="flex items-center gap-2.5 rounded-lg px-1 py-0.5 hover:bg-page">
                  <span className={`w-5 text-center text-sm font-extrabold ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-700' : 'text-gray-300'}`}>
                    {i + 1}
                  </span>
                  <Avatar name={l.name} src={l.photo} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{l.name}</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-brand">⭐ <CountUp value={l.points} /></span>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {nextEvents.length > 0 && (
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">
              <Calendar size={16} className="text-brand" /> Upcoming Events
            </h3>
            <div className="flex flex-col gap-2">
              {nextEvents.map((e) => (
                <Link key={e.id} to="/events" className="rounded-lg border border-line p-3 hover:bg-page">
                  <p className="text-sm font-semibold text-ink">{e.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {new Date(e.startsAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}
                    {e.rsvpCount} going
                  </p>
                </Link>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">
            <Calendar size={16} className="text-brand" /> Upcoming Sessions
          </h3>
          <div className="flex flex-col gap-3">
            {upcoming.map((s) => {
              const m = userById(s.mentorId)
              const pending = s.status === 'requested'
              return (
                <div key={s.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">{s.topic}</p>
                    {pending && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        awaiting
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">with {m?.name}</p>
                  <p className="mt-1 text-[11px] font-medium text-brand">
                    {s.date} · {s.time}
                  </p>
                </div>
              )
            })}
            {upcoming.length === 0 && (
              <p className="text-xs text-muted">No upcoming sessions.</p>
            )}
          </div>
        </Card>

        <p className="px-2 text-[11px] leading-relaxed text-muted">
          Root Connect · Rooman Technologies Alumni Network · 25 years · 500,000+ alumni
        </p>
        </div>
      </aside>

      {noteModal && createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={() => setNoteModal(null)}>
        <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
          <div className="mb-5 flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-ink">Add a note to your invitation</h2>
            <button
              onClick={() => setNoteModal(null)}
              className="shrink-0 text-muted hover:text-ink"
            >
              <X size={20} />
            </button>
          </div>
          <p className="mb-5 text-sm leading-relaxed text-muted">
            Write a personal note (minimum 25 words). Root Connect members are more likely to accept connection requests that include a thoughtful message.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`Hi ${noteModal.name}, I'd love to connect with you because…`}
            maxLength={500}
            className="mb-2 w-full rounded-lg border border-line p-3 text-sm text-ink placeholder-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            rows={5}
          />
          <div className="mb-4 flex justify-between">
            <span className={`text-xs font-medium ${note.split(/\s+/).filter(Boolean).length < 25 ? 'text-red-500' : 'text-green-600'}`}>
              {note.split(/\s+/).filter(Boolean).length} / 25 words
            </span>
            <span className="text-xs text-muted">{note.length}/500</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setNoteModal(null)}
              className="flex-1 rounded-full border border-line px-4 py-2.5 font-medium text-ink transition-colors hover:bg-page"
            >
              Cancel
            </button>
            <button
              onClick={handleSendWithNote}
              disabled={note.split(/\s+/).filter(Boolean).length < 25}
              className="flex-1 rounded-full btn-primary px-4 py-2.5 font-medium text-white disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  )
}
