import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Clock, MapPin, Sparkles, Ticket, Users, Video, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { Avatar, Button, VerifiedBadge } from '../../components/ui'
import { api } from '../../lib/api'
import { EventPhaseBadge, useEventPhase } from './EventPhase'
import type { EventAttendee, User } from '../../types'

// Why an attendee is worth noting: shared batch year, overlapping technical
// skills, or working at the same company as you.
function attendeeMatchReasons(attendee: User, me: User): string[] {
  const reasons: string[] = []
  if (attendee.batchYear === me.batchYear) reasons.push('Same batch')
  const sharedSkills = attendee.expertise.filter((s) => me.expertise.some((m) => m.toLowerCase() === s.toLowerCase()))
  if (sharedSkills.length > 0) reasons.push(`Shares ${sharedSkills.slice(0, 2).join(', ')}`)
  if (attendee.company && me.company && attendee.company.toLowerCase() === me.company.toLowerCase()) {
    reasons.push(`Also at ${attendee.company}`)
  }
  return reasons
}

// Slide-out preview of an event — full agenda, speaker bios, price, and the
// attendee list (with fellow-attendee matchmaking) — without leaving the tab.
export function EventQuickView({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const { events, userById, currentUser, toggleRsvp } = useApp()
  const event = events.find((e) => e.id === eventId)
  const [attendees, setAttendees] = useState<EventAttendee[] | null>(null)
  // Called unconditionally (before the early return below) to satisfy the
  // rules of hooks; '' yields phase 'ended', so no timer runs when there's no event.
  const { phase, countdownLabel } = useEventPhase(event?.startsAt ?? '')

  useEffect(() => {
    setAttendees(null)
    api.getEventAttendees(eventId).then(setAttendees, () => setAttendees([]))
  }, [eventId])

  const rankedAttendees = useMemo(() => {
    if (!attendees) return []
    return attendees
      .map((a) => {
        const full = userById(a.id)
        return { a, reasons: full ? attendeeMatchReasons(full, currentUser) : [] }
      })
      .sort((x, y) => y.reasons.length - x.reasons.length)
  }, [attendees, userById, currentUser])

  if (!event) return null
  const start = new Date(event.startsAt)
  const creator = userById(event.creatorId)
  const rsvpLabel = event.rsvpedByMe
    ? 'Going ✓'
    : event.waitlistedByMe
      ? 'On waitlist'
      : event.capacity != null && event.rsvpCount >= event.capacity
        ? 'Join waitlist'
        : 'RSVP'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="animate-slidein flex h-full w-[35vw] min-w-[360px] max-w-lg flex-col overflow-y-auto bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-bold text-ink">Event details</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 px-5 py-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold text-ink">{event.title}</h3>
              <EventPhaseBadge phase={phase} countdownLabel={countdownLabel} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <Calendar size={14} />
                {start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={14} /> {start.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
              </span>
            </p>
            {event.location && (
              <p className="mt-1 flex items-center gap-1 text-sm text-muted">
                <MapPin size={14} /> {event.location}
              </p>
            )}
            {event.meetingLink && (
              <a
                href={event.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
              >
                <Video size={14} /> Join link
              </a>
            )}
            <p className="mt-2 text-xs text-gray-400">
              hosted by{' '}
              <Link
                to={`/profile/${event.creatorId}`}
                onClick={onClose}
                className="inline-flex items-center gap-1 font-medium text-muted hover:underline"
              >
                {creator?.name}
                <VerifiedBadge verified={creator?.emailVerified} size={12} />
              </Link>
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-line bg-page px-3 py-2">
            <Ticket size={16} className="text-brand" />
            <span className="text-sm font-semibold text-ink">
              {event.isPaid ? `₹${(event.price ?? 0).toLocaleString('en-IN')} per attendee` : 'Free to attend'}
            </span>
          </div>

          {/* Same guard as EventCard: the creator is shown their own pending or
              rejected event, but the RSVP write path refuses anything not
              approved, so the button could only ever return a 400 here.
              Defaults to 'approved' to match the NOT NULL column default. */}
          {(event.status ?? 'approved') === 'approved' && (
            <Button variant="social" aria-pressed={event.rsvpedByMe || event.waitlistedByMe} onClick={() => toggleRsvp(event.id)}>
              {rsvpLabel}
            </Button>
          )}

          {event.description && (
            <div>
              <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">Agenda</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">{event.description}</p>
            </div>
          )}

          {event.speakers.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Speakers</p>
              <div className="flex flex-col gap-2">
                {event.speakers.map((s, i) => (
                  <div key={i} className="rounded-lg border border-line p-3">
                    <p className="text-sm font-semibold text-ink">{s.name}</p>
                    {s.bio && <p className="mt-0.5 text-xs text-muted">{s.bio}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold tracking-wide text-muted uppercase">
              {/* Count confirmed only, to match the card's "X going" (which excludes
                  the waitlist); waitlisted people are still listed below, labelled. */}
              <Users size={12} /> Attendees ({attendees ? attendees.filter((a) => !a.waitlisted).length : event.rsvpCount})
            </p>
            {attendees === null && <p className="text-sm text-muted">Loading…</p>}
            <div className="flex flex-col gap-3">
              {rankedAttendees.map(({ a, reasons }) => (
                <div key={a.id} className="flex items-center gap-2">
                  <Avatar name={a.name} src={a.photo} size={36} />
                  <div className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <Link
                        to={`/profile/${a.id}`}
                        onClick={onClose}
                        className="text-sm font-semibold text-ink hover:underline"
                      >
                        {a.name}
                      </Link>
                      {a.waitlisted && (
                        <span className="rounded-full bg-page px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                          Waitlisted
                        </span>
                      )}
                    </span>
                    <p className="truncate text-xs text-muted">{a.designation}</p>
                    {reasons.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {reasons.map((r) => (
                          <span
                            key={r}
                            className="inline-flex items-center gap-0.5 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand"
                          >
                            <Sparkles size={9} /> {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {attendees?.length === 0 && <p className="text-sm text-muted">No one's RSVP'd yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
