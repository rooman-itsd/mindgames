import { useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { CalendarPlus } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { Button } from '../../components/ui'
import { EventCard } from './EventCard'
import { EventsEmptyState } from './EventsEmptyState'
import { EVENT_DURATION_MS } from './EventPhase'
import type { EventsOutletContext } from './EventsLayout'

export function EventsUpcoming() {
  const { events, posts } = useApp()
  const { openQuickView } = useOutletContext<EventsOutletContext>()
  const navigate = useNavigate()
  const now = Date.now()

  const upcoming = useMemo(
    () =>
      events
        .filter((e) => +new Date(e.startsAt) + EVENT_DURATION_MS >= now)
        .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
    [events, now],
  )

  return (
    <div className="flex flex-col gap-4">
      {upcoming.map((e) => (
        <EventCard
          key={e.id}
          event={e}
          updates={posts.filter((p) => p.eventId === e.id).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))}
          onOpenQuickView={openQuickView}
        />
      ))}
      {upcoming.length === 0 && (
        <EventsEmptyState title="No upcoming events yet">
          <p className="max-w-sm text-sm text-muted">
            Be the one who brings the network together — host a meetup, webinar or batch reunion.
          </p>
          <Button className="mt-1" onClick={() => navigate('../host')}>
            <CalendarPlus size={16} /> Host the first event
          </Button>
        </EventsEmptyState>
      )}
    </div>
  )
}
