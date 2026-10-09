import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card } from '../ui'
import {
  dayHeading, dayKeyOf, defaultSelectedDay, istDayKey, itemsByDay, monthGrid, monthTitle, shiftMonth,
  type CalendarItem, type DotKind,
} from '../../lib/agenda'
import { Dot } from './AgendaParts'
import { DOT_CLASS } from './agendaDots'

const LEGEND: Record<DotKind, string> = {
  confirmed: 'confirmed',
  waiting: 'needs a reply',
  toConfirm: 'to confirm',
  hosting: 'hosting',
  joined: 'joined / invited',
  open: 'open to join',
  group: 'group',
}

/**
 * A month view for the Mentorship right sidebar. Each tab passes its own
 * items (its 1:1s, its mentoring, its groups); a dot marks a busy day, and
 * clicking a day lists what is on it underneath. The parent keys this by tab,
 * so switching tabs starts fresh on the right month and day.
 */
export function MentorshipCalendar({
  items,
  legend,
  scope,
}: {
  items: CalendarItem[]
  legend: DotKind[]
  /** "Your 1:1s", "Your mentoring"… — what this calendar is showing. */
  scope: string
}) {
  const now = Date.now()
  const today = istDayKey(now) ?? ''
  // Derived until the member picks: sessions arrive after the first render,
  // and the calendar should then open on the next busy day, not "today · nothing".
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked ?? defaultSelectedDay(items, now)
  const [ymPicked, setYmPicked] = useState<{ year: number; month: number } | null>(null)
  const ym = ymPicked ?? { year: Number(selected.slice(0, 4)), month: Number(selected.slice(5, 7)) - 1 }

  const byDay = useMemo(() => itemsByDay(items), [items])
  const comingUp = items.filter((i) => i.dayKey >= today).length
  const onDay = byDay.get(selected) ?? []

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink">{monthTitle(ym.year, ym.month)}</h3>
          <p className="text-[11px] text-muted">{scope} · {comingUp} coming up</p>
        </div>
        <div className="flex gap-1 text-muted">
          <button
            onClick={() => setYmPicked(shiftMonth(ym, -1))}
            className="grid size-7 place-items-center rounded-full hover:bg-gray-100 hover:text-ink"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setYmPicked(shiftMonth(ym, 1))}
            className="grid size-7 place-items-center rounded-full hover:bg-gray-100 hover:text-ink"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="pb-1 text-[10px] font-bold text-muted">{d}</span>
        ))}
        {monthGrid(ym.year, ym.month).map((day, i) => {
          if (day === null) return <span key={`b${i}`} />
          const key = dayKeyOf(ym.year, ym.month, day)
          const dayItems = byDay.get(key) ?? []
          const kinds = [...new Set(dayItems.map((x) => x.kind))].slice(0, 3)
          const isToday = key === today
          const isSel = key === selected
          return (
            <button
              key={key}
              onClick={() => setPicked(key)}
              aria-pressed={isSel}
              aria-label={`${dayHeading(key)}${dayItems.length ? `, ${dayItems.length} ${dayItems.length === 1 ? 'session' : 'sessions'}` : ''}`}
              className={`relative flex h-9 items-center justify-center rounded-lg text-xs transition-colors ${
                isToday
                  ? 'btn-primary font-bold'
                  : isSel
                    ? 'bg-brand-50 font-bold text-brand ring-1 ring-brand-200'
                    : key < today
                      ? 'text-gray-400 hover:bg-gray-50'
                      : 'font-medium text-ink hover:bg-gray-100'
              }`}
            >
              {day}
              <span className="absolute bottom-1 flex gap-0.5">
                {kinds.map((k) => (
                  <span key={k} className={`size-1 rounded-full ${isToday ? 'bg-white' : DOT_CLASS[k]}`} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
        {legend.map((k) => (
          <span key={k} className="flex items-center gap-1"><Dot kind={k} />{LEGEND[k]}</span>
        ))}
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <p className="text-[11px] font-bold tracking-wider text-muted uppercase">
          {dayHeading(selected)}{selected === today ? ' · today' : ''}
        </p>
        {onDay.length === 0 ? (
          <p className="mt-2 text-xs text-muted">Nothing on this day.</p>
        ) : (
          onDay.map((x, i) => (
            // Opens the tab it belongs to and points at its row.
            <Link
              key={i}
              replace
              to={`/mentorship?tab=${x.ref.tab}&focus=${encodeURIComponent(x.ref.id)}`}
              className="-mx-1.5 mt-1 flex items-start gap-2.5 rounded-lg px-1.5 py-1 hover:bg-page"
            >
              <Dot kind={x.kind} className="mt-1.5" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-ink">{x.title}</span>
                <span className="block text-[11px] text-muted">{x.detail}</span>
              </span>
            </Link>
          ))
        )}
      </div>
    </Card>
  )
}
