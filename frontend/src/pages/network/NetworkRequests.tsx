import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Briefcase, Check, GraduationCap, MessageCircle, Users, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { Avatar, Button, Card, SectionTitle } from '../../components/ui'
import { roleLine } from '../../lib/format'
import type { Post, User } from '../../types'
import type { NetworkOutletContext } from './NetworkLayout'
import { EmptyState } from '../../components/ui/EmptyState'

// Priority tags on an incoming request: quick signals for why it might be
// worth accepting. "Hiring" = the requester currently has an active job
// post; "Same Batch" = they graduated the same year as you.
function RequestTags({ requester, me, posts }: { requester: User; me: User; posts: Post[] }) {
  const isHiring = posts.some((p) => p.authorId === requester.id && p.type === 'Hiring' && p.active)
  const sameBatch = requester.batchYear === me.batchYear

  if (!isHiring && !sameBatch) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {sameBatch && (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
          <GraduationCap size={11} /> Same Batch
        </span>
      )}
      {isHiring && (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
          <Briefcase size={11} /> Hiring
        </span>
      )}
    </div>
  )
}

export function NetworkRequests() {
  const {
    users,
    currentUser,
    posts,
    pendingRequestIds,
    sentRequestIds,
    acceptRequest,
    ignoreRequest,
    cancelSentRequest,
    connectionNotes,
  } = useApp()
  const { openQuickView } = useOutletContext<NetworkOutletContext>()
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null)
  const get = (id: string) => users.find((u) => u.id === id)!
  const pending = pendingRequestIds.map(get).filter(Boolean)
  const sent = sentRequestIds.map(get).filter(Boolean)
  const selectedUser = selectedRequest ? get(selectedRequest) : null
  const selectedNote = selectedRequest ? connectionNotes[selectedRequest] : null

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionTitle>Connection Requests ({pending.length})</SectionTitle>
        {pending.length === 0 && (
          <EmptyState compact icon={<Check size={18} />} title="No requests waiting" body="When someone wants to connect, it'll show up here." />
        )}
        <div className="flex flex-col gap-3">
          {pending.map((u) => (
            <Card key={u.id} className="flex items-center gap-3 p-4">
              <button onClick={() => openQuickView(u.id)}>
                <Avatar name={u.name} src={u.photo} size={48} />
              </button>
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => openQuickView(u.id)}
                  className="font-semibold text-ink hover:underline"
                >
                  {u.name}
                </button>
                {roleLine(u) && <p className="truncate text-xs text-muted">{roleLine(u)}</p>}
                <RequestTags requester={u} me={currentUser} posts={posts} />
                {connectionNotes[u.id] && (
                  <button
                    onClick={() => setSelectedRequest(u.id)}
                    className="mt-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100"
                  >
                    <MessageCircle size={12} /> Read note
                  </button>
                )}
              </div>
              <Button onClick={() => acceptRequest(u.id)} className="!px-3 !py-1.5 text-xs">
                <Check size={15} /> Accept
              </Button>
              <button
                onClick={() => ignoreRequest(u.id)}
                className="rounded-full p-2 text-muted hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Sent Requests ({sent.length})</SectionTitle>
        {sent.length === 0 && (
          <EmptyState compact icon={<Users size={18} />} title="No requests out" body="Requests you send stay here until they're answered." />
        )}
        <div className="flex flex-col gap-3">
          {sent.map((u) => (
            <Card key={u.id} className="flex items-center gap-3 p-4">
              <button onClick={() => openQuickView(u.id)}>
                <Avatar name={u.name} src={u.photo} size={48} />
              </button>
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => openQuickView(u.id)}
                  className="font-semibold text-ink hover:underline"
                >
                  {u.name}
                </button>
                {roleLine(u) && <p className="truncate text-xs text-muted">{roleLine(u)}</p>}
              </div>
              <Button
                variant="ghost"
                className="!px-3 !py-1.5 text-xs !text-red-500 hover:!bg-red-50"
                onClick={() => cancelSentRequest(u.id)}
              >
                Cancel request
              </Button>
            </Card>
          ))}
        </div>
      </section>

      {/* Connection note modal */}
      {selectedUser && selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-lg">
            {/* Close button */}
            <button
              onClick={() => setSelectedRequest(null)}
              className="absolute right-4 top-4 text-muted hover:text-ink"
            >
              <X size={20} />
            </button>

            {/* Sender's profile summary */}
            <div className="mb-5 flex items-center gap-3">
              <Avatar name={selectedUser.name} src={selectedUser.photo} size={56} />
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-ink">{selectedUser.name}</h3>
                {roleLine(selectedUser) && (
                  <p className="truncate text-sm text-muted">{roleLine(selectedUser)}</p>
                )}
                <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <Users size={12} />
                  {selectedUser.connectionsCount} connections
                </p>
              </div>
            </div>

            {/* Note - highlighted */}
            <div className="mb-5 rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
              <p className="mb-2 text-xs font-semibold tracking-widest text-blue-600 uppercase">
                Connection Message
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                {selectedNote}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => {
                  acceptRequest(selectedUser.id)
                  setSelectedRequest(null)
                }}
                className="w-full"
              >
                <Check size={16} /> Accept Connection
              </Button>
              <button
                onClick={() => openQuickView(selectedUser.id)}
                className="rounded-full border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-page"
              >
                View Full Profile
              </button>
              <button
                onClick={() => {
                  ignoreRequest(selectedUser.id)
                  setSelectedRequest(null)
                }}
                className="rounded-full px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
              >
                Ignore Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
