import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { MapPin, MessageSquare, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { useLayout } from '../../components/layout/LayoutContext'
import { Avatar, Button, Card, SectionTitle } from '../../components/ui'
import { roleLine } from '../../lib/format'
import { isBookableMentor } from '../../lib/profileCompleteness'
import type { NetworkOutletContext } from './NetworkLayout'
import { EmptyState } from '../../components/ui/EmptyState'
import { GraduationCap } from 'lucide-react'

// Mentors across your connections and suggestions — for finding/connecting
// with mentors on the network. Distinct from /mentorship, which is about
// booking sessions with mentors you've already connected with.
export function NetworkMentors() {
  const { users, currentUser, sendConnect, connectionState } = useApp()
  const { openChatWith } = useLayout()
  const { openQuickView } = useOutletContext<NetworkOutletContext>()
  const [noteModal, setNoteModal] = useState<{ userId: string; name: string } | null>(null)
  const [note, setNote] = useState('')

  // Listed only if they qualify to mentor AND have said what they cover or
  // when they're free — see isBookableMentor. Members who ticked the box but
  // haven't filled either are told so by the meter on their own profile.
  const mentors = users.filter(
    (u) => u.id !== currentUser.id && u.id !== 'rooman' && isBookableMentor(u),
  )

  return (
    <section>
      <SectionTitle>Mentors ({mentors.length})</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {mentors.map((u) => {
          const state = connectionState(u.id)
          return (
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
              {state === 'connected' ? (
                <Button variant="subtle" className="mt-3 w-full" onClick={() => openChatWith(u.id)}>
                  <MessageSquare size={15} /> Message
                </Button>
              ) : (
                <Button
                  variant="social"
                aria-pressed={state === 'pending'}
                  className="mt-3 w-full"
                  disabled={state === 'pending'}
                  onClick={() => {
                    setNoteModal({ userId: u.id, name: u.name })
                    setNote('')
                  }}
                >
                  {state === 'pending' ? 'Request sent' : 'Connect'}
                </Button>
              )}
            </Card>
          )
        })}
        {mentors.length === 0 && (
          <EmptyState
            className="sm:col-span-2"
            icon={<GraduationCap size={28} />}
            title="Be the first mentor here"
            body="Members are looking for guidance. Share what you know, earn, and build a rated track record."
            action={{ label: 'Become a mentor', to: '/profile#mentor-verification' }}
          />
        )}
      </div>

      {/* Connection note modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-lg">
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
              placeholder={`Hi ${noteModal.name.split(' ')[0]}, I'd love to connect with you because…`}
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
                onClick={() => {
                  const wordCount = note.split(/\s+/).filter(Boolean).length
                  if (noteModal && wordCount >= 25) {
                    sendConnect(noteModal.userId, note.trim())
                    setNoteModal(null)
                    setNote('')
                  }
                }}
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
