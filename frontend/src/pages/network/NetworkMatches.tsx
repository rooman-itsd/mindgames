import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { MapPin, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { Avatar, Button, Card, Pill, SectionTitle } from '../../components/ui'
import { GrowCatchupSection } from '../../components/grow/GrowCatchupSection'
import { roleLine } from '../../lib/format'
import { DOMAINS } from '../../types'
import type { NetworkOutletContext } from './NetworkLayout'

// "People You May Know" — filtered only by the domain chips below. This used
// to also silently filter by the global navbar search text (shared app-wide
// state), which made the domain chips look broken whenever leftover text sat
// in the navbar search box. Domain is the only filter here now.
export function NetworkMatches() {
  const { users, suggestionIds, sendConnect, connectionState } = useApp()
  const { openQuickView } = useOutletContext<NetworkOutletContext>()
  const [domainFilter, setDomainFilter] = useState<string>('All')
  const [noteModal, setNoteModal] = useState<{ userId: string; name: string } | null>(null)
  const [note, setNote] = useState('')

  const handleSendWithNote = () => {
    const wordCount = note.split(/\s+/).filter(Boolean).length
    if (noteModal && wordCount >= 25) {
      sendConnect(noteModal.userId, note.trim())
      setNoteModal(null)
      setNote('')
    }
  }

  const get = (id: string) => users.find((u) => u.id === id)!

  const suggestions = useMemo(
    () =>
      suggestionIds
        .map(get)
        .filter(Boolean)
        .filter((u) => domainFilter === 'All' || u.domain === domainFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suggestionIds, users, domainFilter],
  )

  return (
    <section className="space-y-8">
      {/* Grow & Catch Up */}
      <div>
        <SectionTitle>Network Highlights</SectionTitle>
        <GrowCatchupSection />
      </div>

      {/* People You May Know */}
      <div>
        <SectionTitle>People You May Know</SectionTitle>
      <div className="mb-3 flex flex-wrap gap-2">
        <Pill active={domainFilter === 'All'} onClick={() => setDomainFilter('All')}>All</Pill>
        {DOMAINS.map((d) => (
          <Pill key={d} active={domainFilter === d} onClick={() => setDomainFilter(d)}>
            {d}
          </Pill>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {suggestions.map((u) => (
          <Card key={u.id} className="flex flex-col items-center p-5 text-center">
            <button onClick={() => openQuickView(u.id)}>
              <Avatar name={u.name} src={u.photo} size={64} />
            </button>
            <button
              onClick={() => openQuickView(u.id)}
              className="mt-3 font-semibold text-ink hover:underline"
            >
              {u.name}
            </button>
            {roleLine(u) && <p className="text-xs text-muted">{roleLine(u)}</p>}
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
              <MapPin size={12} /> {u.city} · Batch {u.batchYear}
            </p>
            <Button
              variant="social"
              aria-pressed={connectionState(u.id) === 'pending'}
              className="mt-3 w-full"
              disabled={connectionState(u.id) === 'pending'}
              onClick={() => {
                setNoteModal({ userId: u.id, name: u.name })
                setNote('')
              }}
            >
              {connectionState(u.id) === 'pending' ? 'Request sent' : 'Connect'}
            </Button>
          </Card>
        ))}
        {suggestions.length === 0 && (
          <p className="text-sm text-muted">No suggestions match your filters.</p>
        )}
      </div>
      </div>

      {/* Connection note modal */}
      {noteModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4" onClick={() => setNoteModal(null)}>
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">Add a note to your invitation</h2>
              <button
                onClick={() => setNoteModal(null)}
                className="text-muted hover:text-ink"
              >
                <X size={20} />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted">
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
        </div>
      )}
    </section>
  )
}
