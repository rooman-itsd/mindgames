import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Award,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  MapPin,
  MessageCircle,
  MessageSquarePlus,
  Send,
  Star,
  Ticket,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { api } from '../../lib/api'
import { Avatar, Button, Card, VerifiedBadge } from '../../components/ui'
import { PostCard } from '../../components/feed/PostCard'
import { EventPhaseBadge, useEventPhase } from './EventPhase'
import type { AppEvent, Comment, EventFeedbackEntry, Post } from '../../types'

export function EventCard({
  event: e,
  updates,
  onOpenQuickView,
}: {
  event: AppEvent
  updates: Post[]
  onOpenQuickView: (eventId: string) => void
}) {
  const { userById, currentUser, toggleRsvp, cancelEvent } = useApp()
  const creator = userById(e.creatorId)
  const isMine = e.creatorId === currentUser.id
  const canPostUpdate = isMine || currentUser.isAdmin
  const start = new Date(e.startsAt)
  const { phase, countdownLabel } = useEventPhase(e.startsAt)
  const isPast = phase === 'ended'
  const [showPostUpdate, setShowPostUpdate] = useState(false)
  const [showDiscussion, setShowDiscussion] = useState(false)
  const [showHostFeedback, setShowHostFeedback] = useState(false)

  return (
    <Card className="p-5">
      <div className="flex gap-4">
        {/* Date block */}
        <button
          onClick={() => onOpenQuickView(e.id)}
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand"
        >
          <span className="text-[11px] font-bold uppercase">
            {start.toLocaleDateString('en-IN', { month: 'short' })}
          </span>
          <span className="text-2xl leading-none font-extrabold">{start.getDate()}</span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => onOpenQuickView(e.id)} className="text-lg font-bold text-ink hover:underline">
              {e.title}
            </button>
            {e.status === 'pending' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                <Clock size={11} /> Pending approval
              </span>
            )}
            {e.status !== 'pending' && <EventPhaseBadge phase={phase} countdownLabel={countdownLabel} />}
            {e.feedbackCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
                <Star size={11} className="fill-yellow-500 text-yellow-500" /> {e.avgRating} ({e.feedbackCount})
              </span>
            )}
            {e.isPaid ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand">
                <Ticket size={11} /> ₹{(e.price ?? 0).toLocaleString('en-IN')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                Free
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span>
              {start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}
              {start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
            </span>
            {e.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} /> {e.location}
              </span>
            )}
            {e.meetingLink && (
              <a
                href={e.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
              >
                <Video size={13} /> Join link <ExternalLink size={11} />
              </a>
            )}
          </p>
          {e.description && <p className="mt-2 text-sm leading-relaxed text-ink">{e.description}</p>}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {e.attendeeIds.slice(0, 5).map((id) => {
                  const u = userById(id)
                  return (
                    <span key={id} className="rounded-full ring-2 ring-surface">
                      <Avatar name={u?.name ?? '?'} src={u?.photo} size={26} />
                    </span>
                  )
                })}
              </div>
              <span className="text-xs text-muted">
                <Users size={12} className="mr-0.5 inline" />
                {e.rsvpCount}{e.capacity ? ` / ${e.capacity}` : ''} going
                {e.waitlistCount > 0 && ` · ${e.waitlistCount} waitlisted`}
              </span>
              <span className="text-xs text-gray-400">
                · hosted by{' '}
                <Link
                  to={`/profile/${e.creatorId}`}
                  className="inline-flex items-center gap-1 font-medium text-muted hover:underline"
                >
                  {isMine ? 'you' : creator?.name}
                  <VerifiedBadge verified={creator?.emailVerified} size={12} />
                </Link>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="!px-3 !py-1.5 text-xs"
                title="Discuss this event"
                onClick={() => setShowDiscussion((v) => !v)}
              >
                <MessageCircle size={14} /> Discuss
              </Button>
              {canPostUpdate && (
                <Button
                  variant="ghost"
                  className="!px-3 !py-1.5 text-xs"
                  title="Post an update about this event"
                  onClick={() => setShowPostUpdate(true)}
                >
                  <MessageSquarePlus size={14} /> Post update
                </Button>
              )}
              {canPostUpdate && isPast && (
                <Button
                  variant="ghost"
                  className="!px-3 !py-1.5 text-xs"
                  title="See attendee ratings and comments"
                  onClick={() => setShowHostFeedback(true)}
                >
                  <Star size={14} /> View feedback
                </Button>
              )}
              {isPast && e.rsvpedByMe && (
                <Button
                  variant="ghost"
                  className="!px-3 !py-1.5 text-xs"
                  title="Download your certificate of attendance"
                  onClick={async () => {
                    try {
                      const blob = await api.downloadEventCertificate(e.id)
                      const url = URL.createObjectURL(blob)
                      window.open(url, '_blank')
                      setTimeout(() => URL.revokeObjectURL(url), 60_000)
                    } catch {
                      /* toast not critical here */
                    }
                  }}
                >
                  <Award size={14} /> Certificate
                </Button>
              )}
              {!isPast && (
                <>
                  <Button
                    variant="ghost"
                    className="!px-3 !py-1.5 text-xs"
                    title="Download .ics for your calendar"
                    onClick={async () => {
                      try {
                        const blob = await api.downloadEventIcs(e.id)
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = `${e.title.replace(/[^\w ]/g, '').trim() || 'event'}.ics`
                        a.click()
                        URL.revokeObjectURL(url)
                      } catch {
                        /* toast not critical here */
                      }
                    }}
                  >
                    <Calendar size={14} /> Add to calendar
                  </Button>
                  {isMine && (
                    <Button
                      variant="ghost"
                      className="!px-3 !py-1.5 text-xs !text-red-500 hover:!bg-red-50"
                      onClick={() => cancelEvent(e.id)}
                    >
                      <Trash2 size={14} /> Cancel event
                    </Button>
                  )}
                  {/* A host sees their own pending/rejected event, but the RSVP
                      write path refuses anything not approved, so showing the
                      button here offered an action that could only ever 400.
                      Defaults to 'approved' to match the NOT NULL column default. */}
                  {(e.status ?? 'approved') === 'approved' && (
                    <Button
                      variant="social"
                    aria-pressed={e.rsvpedByMe || e.waitlistedByMe}
                      className="!px-4 !py-1.5 text-sm"
                      onClick={() => toggleRsvp(e.id)}
                    >
                      {e.rsvpedByMe ? (
                        <>
                          <Check size={15} /> Going
                        </>
                      ) : e.waitlistedByMe ? (
                        'On waitlist'
                      ) : e.capacity != null && e.rsvpCount >= e.capacity ? (
                        'Join waitlist'
                      ) : (
                        'RSVP'
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {isPast && e.rsvpedByMe && !e.feedbackByMe && <EventFeedbackForm eventId={e.id} />}

          {showDiscussion && <EventDiscussion eventId={e.id} />}

          {updates.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
              <p className="text-xs font-semibold text-muted">Updates ({updates.length})</p>
              {updates.map((p) => (
                <PostCard key={p.id} post={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showPostUpdate && <PostEventUpdateModal event={e} onClose={() => setShowPostUpdate(false)} />}
      {showHostFeedback && <EventFeedbackModal event={e} onClose={() => setShowHostFeedback(false)} />}
    </Card>
  )
}

// Star rating + optional comment, submitted once after an ended event.
function EventFeedbackForm({ eventId }: { eventId: string }) {
  const { submitEventFeedback, notify } = useApp()
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!rating) return
    setSaving(true)
    try {
      await submitEventFeedback(eventId, rating, comment.trim())
      notify('Thanks for the feedback!', 'success')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not submit feedback.', 'error')
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-line bg-page p-3">
      <p className="text-xs font-semibold text-ink">How was this event?</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => setRating(n)}
            className="p-0.5"
            aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
          >
            <Star
              size={20}
              className={n <= (hovered || rating) ? 'fill-yellow-500 text-yellow-500' : 'text-gray-300'}
            />
          </button>
        ))}
      </div>
      <input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Anything you'd add? (optional)"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
      />
      <Button className="self-start !px-4 !py-1.5 text-xs" disabled={!rating || saving} onClick={submit}>
        {saving ? 'Submitting…' : 'Submit feedback'}
      </Button>
    </div>
  )
}

// Host/admin view of every attendee's rating + comment.
function EventFeedbackModal({ event: e, onClose }: { event: AppEvent; onClose: () => void }) {
  const [entries, setEntries] = useState<EventFeedbackEntry[] | null>(null)

  useEffect(() => {
    api.getEventFeedback(e.id).then(setEntries, () => setEntries([]))
  }, [e.id])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="animate-slidein my-auto w-full max-w-md rounded-2xl bg-surface shadow-2xl" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Star size={18} className="text-brand" />
            <h2 className="font-bold text-ink">Feedback — {e.title}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
          {entries === null && <p className="text-sm text-muted">Loading…</p>}
          {entries?.length === 0 && <p className="text-sm text-muted">No feedback submitted yet.</p>}
          {entries?.map((f) => (
            <div key={f.userId} className="flex gap-2">
              <Avatar name={f.name} src={f.photo} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{f.name}</p>
                  <span className="inline-flex items-center gap-0.5 text-xs text-yellow-600">
                    <Star size={11} className="fill-yellow-500 text-yellow-500" /> {f.rating}
                  </span>
                </div>
                {f.comment && <p className="text-sm text-ink">{f.comment}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Lightweight Q&A/discussion thread on the event itself (distinct from the
// event's linked feed posts and their comments). Collapsed to the latest 3
// comments by default — a long thread used to stretch the whole page since
// it rendered fully inline; now it's a "View N more" toggle into a bounded,
// independently-scrolling list instead.
const COLLAPSED_COMMENT_COUNT = 3

function EventDiscussion({ eventId }: { eventId: string }) {
  const { currentUser, userById } = useApp()
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  useEffect(() => {
    api.getEventComments(eventId).then(setComments, () => setComments([]))
  }, [eventId])

  async function submit() {
    if (!draft.trim()) return
    setPosting(true)
    try {
      const created = await api.addEventComment(eventId, draft.trim())
      setComments((list) => [...(list ?? []), created])
      setDraft('')
      setExpanded(true)
    } catch {
      /* toast not critical here */
    } finally {
      setPosting(false)
    }
  }

  const all = comments ?? []
  const hiddenCount = all.length - COLLAPSED_COMMENT_COUNT
  const shown = expanded || hiddenCount <= 0 ? all : all.slice(-COLLAPSED_COMMENT_COUNT)

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
      <div className="flex items-center gap-2">
        <Avatar name={currentUser.name} src={currentUser.photo} size={30} />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Ask a question or leave a note…"
          className="flex-1 rounded-full border border-line bg-page px-4 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          onClick={submit}
          disabled={posting || !draft.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full btn-primary text-white disabled:opacity-50"
        >
          <Send size={15} />
        </button>
      </div>
      {comments === null && <p className="text-xs text-muted">Loading discussion…</p>}
      {hiddenCount > 0 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="self-start text-xs font-semibold text-brand hover:underline"
        >
          View {hiddenCount} more comment{hiddenCount > 1 ? 's' : ''}
        </button>
      )}
      <div className={`flex flex-col gap-2 ${expanded ? 'max-h-72 overflow-y-auto pr-1' : ''}`}>
        {shown.map((c) => {
          const author = userById(c.authorId)
          return (
            <div key={c.id} className="flex gap-2">
              <Avatar name={author?.name ?? '?'} src={author?.photo} size={30} />
              <div className="rounded-2xl bg-page px-3 py-2">
                <p className="text-xs font-semibold text-ink">{author?.name ?? 'Member'}</p>
                <p className="text-sm text-ink">{c.text}</p>
              </div>
            </div>
          )
        })}
        {comments?.length === 0 && <p className="text-xs text-muted">No comments yet — be the first to ask something.</p>}
      </div>
      {expanded && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(false)}
          className="self-start text-xs font-semibold text-muted hover:underline"
        >
          Show less
        </button>
      )}
    </div>
  )
}

function PostEventUpdateModal({ event: e, onClose }: { event: AppEvent; onClose: () => void }) {
  const { createPost } = useApp()
  const [content, setContent] = useState('')

  function submit() {
    if (!content.trim()) return
    createPost({ type: 'Update', content, visibility: 'All Alumni', eventId: e.id })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="animate-slidein my-auto w-full max-w-md rounded-2xl bg-surface shadow-2xl" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <MessageSquarePlus size={18} className="text-brand" />
            <h2 className="font-bold text-ink">Post an update — {e.title}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <textarea
            autoFocus
            value={content}
            onChange={(ev) => setContent(ev.target.value)}
            rows={4}
            placeholder="Share a change of plan, the meeting link, a recap photo caption…"
            className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <p className="text-xs text-muted">
            This posts to the main feed and notifies everyone who RSVP'd to "{e.title}".
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!content.trim()} onClick={submit}>Post update</Button>
        </div>
      </div>
    </div>
  )
}
