import { useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useApp } from '../../store/AppStore'
import { SectionTitle } from '../../components/ui'
import { EventCard } from './EventCard'
import { EventsEmptyState } from './EventsEmptyState'
import { EVENT_DURATION_MS } from './EventPhase'
import type { EventsOutletContext } from './EventsLayout'
import type { Post } from '../../types'

export function EventsMyRegistered() {
  const { events, posts } = useApp()
  const { openQuickView } = useOutletContext<EventsOutletContext>()
  const now = Date.now()

  const registered = useMemo(() => events.filter((e) => e.rsvpedByMe || e.waitlistedByMe), [events])
  const upcoming = useMemo(
    () =>
      registered
        .filter((e) => +new Date(e.startsAt) + EVENT_DURATION_MS >= now)
        .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
    [registered, now],
  )
  const past = useMemo(
    () =>
      registered
        .filter((e) => +new Date(e.startsAt) + EVENT_DURATION_MS < now)
        .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt)),
    [registered, now],
  )

  const updatesFor = (id: string): Post[] =>
    posts.filter((p) => p.eventId === id).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

  if (registered.length === 0) {
    return (
      <EventsEmptyState title="You haven't registered for any events yet">
        <p className="max-w-sm text-sm text-muted">
          RSVP to an upcoming event and it'll show up here for easy tracking.
        </p>
      </EventsEmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {upcoming.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionTitle>Upcoming ({upcoming.length})</SectionTitle>
          {upcoming.map((e) => (
            <EventCard key={e.id} event={e} updates={updatesFor(e.id)} onOpenQuickView={openQuickView} />
          ))}
        </section>
      )}
      {past.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionTitle>Past</SectionTitle>
          {past.map((e) => (
            <EventCard key={e.id} event={e} updates={updatesFor(e.id)} onOpenQuickView={openQuickView} />
          ))}
        </section>
      )}
    </div>
  )
}
