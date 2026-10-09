/**
 * Pure date + grouping helpers for the Mentorship agenda layout: which day a
 * session falls on, how far away that is, what each tab's calendar shows, and
 * how lists are ordered and filtered. No React, no fetch.
 *
 * Everything is in IST. Session labels are written in IST (sessionLabels in
 * format.ts), so "which day is this on" must be answered in IST too —
 * otherwise a late-night session lands on the wrong day for anyone whose
 * device is set to another timezone.
 */
import type { GroupSession, MentorshipSession } from '../types'

const IST = 'Asia/Kolkata'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

// ---- Days -------------------------------------------------------------------

/** "2026-10-14": the IST calendar day an instant falls on. */
export function istDayKey(at: Date | number | string): string | null {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  // en-CA formats a date as YYYY-MM-DD.
  return d.toLocaleDateString('en-CA', { timeZone: IST })
}

export function dayKeyOf(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

/**
 * A 1:1 session's IST day. Prefers the real instant; older sessions only
 * carry the display label ("Fri, 26 Sep 2026"), so fall back to reading it.
 * Null when neither is usable — the session still lists, it just can't be
 * placed on the calendar.
 */
export function sessionDayKey(s: Pick<MentorshipSession, 'scheduledAt' | 'date'>): string | null {
  if (s.scheduledAt) {
    const k = istDayKey(s.scheduledAt)
    if (k) return k
  }
  const iso = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(s.date ?? '')
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/.exec(s.date ?? '')
  if (!m) return null
  const month = MONTHS.indexOf(m[2][0].toUpperCase() + m[2].slice(1, 3).toLowerCase())
  if (month < 0) return null
  return `${m[3]}-${pad(month + 1)}-${m[1].padStart(2, '0')}`
}

/** Minutes after midnight from a label like "8:00 PM IST"; null if unreadable. */
export function labelMinutes(time: string | undefined): number | null {
  const m = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(time ?? '')
  if (!m) return null
  const h = Number(m[1]) % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0)
  return h * 60 + Number(m[2])
}

/** Sortable "when" for a 1:1 session. Undated sessions sort last. */
function sessionSortKey(s: Pick<MentorshipSession, 'scheduledAt' | 'date' | 'time'>): string {
  const day = sessionDayKey(s)
  if (!day) return '~'
  const mins = s.scheduledAt
    ? labelMinutes(new Date(s.scheduledAt).toLocaleTimeString('en-US', { timeZone: IST, hour: 'numeric', minute: '2-digit' }))
    : labelMinutes(s.time)
  return `${day}T${pad(Math.floor((mins ?? 0) / 60))}:${pad((mins ?? 0) % 60)}`
}

/** Whole calendar days from today to `dayKey`, both counted in IST. */
export function daysFromToday(dayKey: string, now: number): number {
  const today = istDayKey(now) ?? dayKey
  return Math.round((Date.parse(`${dayKey}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}

export function relativeDayLabel(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 1 ? `in ${days} days` : `${-days} days ago`
}

/** "Wed 14 Oct" for a day key. */
export function dayHeading(dayKey: string): string {
  // Midday UTC is the same calendar date everywhere, so the weekday is right.
  const d = new Date(`${dayKey}T12:00:00Z`)
  return `${d.toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short' })} ${d.getUTCDate()} ${monthShort(dayKey)}`
}

/** "Sep" for a day key. Fixed names, not the browser's: newer ICU data says
 *  "Sept", while every stored label (sessionLabels) says "Sep". */
function monthShort(dayKey: string): string {
  return MONTHS[Number(dayKey.slice(5, 7)) - 1] ?? ''
}

// ---- Month grid -------------------------------------------------------------

/** Cells of a Monday-first month view: null for the blanks before the 1st. */
export function monthGrid(year: number, month: number): (number | null)[] {
  const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
}

export function monthTitle(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' })
}

/** Step a { year, month } by ±n months. */
export function shiftMonth(ym: { year: number; month: number }, n: number): { year: number; month: number } {
  const t = ym.year * 12 + ym.month + n
  return { year: Math.floor(t / 12), month: ((t % 12) + 12) % 12 }
}

// ---- What each tab's calendar shows ----------------------------------------

/** The dot colour family; the component maps each kind to a token. */
export type DotKind = 'confirmed' | 'waiting' | 'toConfirm' | 'hosting' | 'joined' | 'open' | 'group'

export interface CalendarItem {
  dayKey: string
  kind: DotKind
  title: string
  detail: string
  /** Minutes after midnight IST, for ordering a day's items by time. */
  mins: number
  /** Where the item lives on the page — clicking it opens that tab and row. */
  ref: { tab: AgendaTab; id: string }
}

export type AgendaTab = 'sessions' | 'space' | 'group'

/** Order calendar items by day, then by time of day. */
export function byDayThenTime(a: CalendarItem, b: CalendarItem): number {
  return a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : a.mins - b.mins
}

const keyMinutes = (key: string) => {
  const m = /T(\d{2}):(\d{2})$/.exec(key)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

const timeOnly = (t: string) => t.replace(/\s*IST$/, '')

/** My Sessions: the member's own bookings, as the mentee. */
export function menteeCalendar(
  sessions: MentorshipSession[],
  me: string,
  nameOf: (id: string) => string | undefined,
): CalendarItem[] {
  const out: CalendarItem[] = []
  for (const s of sessions) {
    if (s.menteeId !== me || (s.status !== 'upcoming' && s.status !== 'requested')) continue
    const dayKey = sessionDayKey(s)
    if (!dayKey) continue
    const mentor = nameOf(s.mentorId) ?? 'your mentor'
    const detail = s.status === 'upcoming'
      ? `with ${mentor}`
      : s.requestedBy === 'mentor' ? `${mentor} offered this` : `waiting on ${mentor}`
    out.push({ dayKey, kind: s.status === 'upcoming' ? 'confirmed' : 'waiting', title: s.topic, detail: `${timeOnly(s.time)} · ${detail}`, mins: keyMinutes(sessionSortKey(s)), ref: { tab: 'sessions', id: s.id } })
  }
  return out
}

/** Mentor Space: sessions this member is giving. */
export function mentorCalendar(sessions: MentorshipSession[], me: string): CalendarItem[] {
  const out: CalendarItem[] = []
  for (const s of sessions) {
    if (s.mentorId !== me) continue
    const toConfirm = s.status === 'past' && s.mentorConfirmed && !s.menteeConfirmed
    if (s.status !== 'upcoming' && s.status !== 'requested' && !toConfirm) continue
    const dayKey = sessionDayKey(s)
    if (!dayKey) continue
    const kind: DotKind = toConfirm ? 'toConfirm' : s.status === 'upcoming' ? 'confirmed' : 'waiting'
    const detail = toConfirm
      ? `Completed · ${s.menteeName} to confirm`
      : s.status === 'requested'
        ? `${timeOnly(s.time)} · ${s.requestedBy === 'mentor' ? `you offered ${s.menteeName}` : `${s.menteeName} asked`}`
        : `${timeOnly(s.time)} · ${s.menteeName}`
    out.push({ dayKey, kind, title: s.topic, detail, mins: keyMinutes(sessionSortKey(s)), ref: { tab: 'space', id: s.id } })
  }
  return out
}

/** "6:30 PM" — an instant's time of day in IST. The one formatter for group sessions. */
export function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' }).toUpperCase()
}

/** An instant as IST date + time strings, for date/time inputs ("2026-10-14", "18:30"). */
export function istInputParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false })
  return { date: istDayKey(d) ?? '', time: time === '24:00' ? '00:00' : time }
}

/** IST date + time inputs back to an instant (ISO). */
export function istInputToIso(date: string, time: string): string | null {
  const d = new Date(`${date}T${time}:00+05:30`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Group Sessions: hosting, joined/invited, and open ones still to join. */
export function groupCalendar(mine: GroupSession[], open: GroupSession[], me: string): CalendarItem[] {
  const out: CalendarItem[] = []
  const mineIds = new Set(mine.map((g) => g.id))
  for (const g of mine) {
    if (g.status === 'cancelled') continue
    const dayKey = istDayKey(g.scheduledAt)
    if (!dayKey) continue
    if (g.mentorId === me) {
      out.push({ dayKey, kind: 'hosting', title: g.topic, detail: `${istTime(g.scheduledAt)} · you host · ${g.attendeeCount}/${g.capacity} joined`, mins: labelMinutes(istTime(g.scheduledAt)) ?? 0, ref: { tab: 'group', id: g.id } })
    } else if (g.joinedByMe || (g.invitedByMe && g.status === 'scheduled')) {
      // An invite that lapsed (never accepted, now over) isn't on anyone's calendar.
      const status = g.status === 'completed' && g.joinedByMe
        ? (g.confirmedByMe ? 'attended' : 'confirm attendance')
        : g.joinedByMe ? `with ${g.mentorName}` : `${g.mentorName} invited you`
      out.push({ dayKey, kind: 'joined', title: g.topic, detail: `${istTime(g.scheduledAt)} · ${status}`, mins: labelMinutes(istTime(g.scheduledAt)) ?? 0, ref: { tab: 'group', id: g.id } })
    }
  }
  for (const g of open) {
    if (mineIds.has(g.id) || g.status !== 'scheduled') continue
    const dayKey = istDayKey(g.scheduledAt)
    if (!dayKey) continue
    out.push({ dayKey, kind: 'open', title: g.topic, detail: `${istTime(g.scheduledAt)} · ${g.seatsLeft === 0 ? 'full' : `${g.seatsLeft} seats left`}`, mins: labelMinutes(istTime(g.scheduledAt)) ?? 0, ref: { tab: 'group', id: g.id } })
  }
  return out
}

/** Find a Mentor: everything on the member's plate, groups as one colour. */
export function overviewCalendar(mentee: CalendarItem[], mentor: CalendarItem[], group: CalendarItem[]): CalendarItem[] {
  return [
    ...mentee,
    ...mentor.filter((i) => i.kind !== 'toConfirm'),
    ...group.filter((i) => i.kind !== 'open').map((i) => ({ ...i, kind: 'group' as const })),
  ]
}

export function itemsByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const by = new Map<string, CalendarItem[]>()
  for (const i of [...items].sort(byDayThenTime)) by.set(i.dayKey, [...(by.get(i.dayKey) ?? []), i])
  return by
}

/** The day a calendar opens on: today if anything is on it, else the next busy day. */
export function defaultSelectedDay(items: CalendarItem[], now: number): string {
  const today = istDayKey(now) ?? ''
  const upcoming = items.map((i) => i.dayKey).filter((k) => k >= today).sort()
  return upcoming[0] ?? today
}

// ---- Lists ------------------------------------------------------------------

/** Requests and confirmed sessions on one timeline, soonest first. */
export function byWhen<T extends Pick<MentorshipSession, 'scheduledAt' | 'date' | 'time'>>(list: T[]): T[] {
  // Plain code-point order, not localeCompare: locale collation ranks "~"
  // before digits, which would float undated sessions to the top.
  return [...list].sort((a, b) => {
    const ka = sessionSortKey(a), kb = sessionSortKey(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}

/** Past 1:1 sessions, most recent first; ones with no readable date go last. */
export function newestFirst<T extends Pick<MentorshipSession, 'scheduledAt' | 'date' | 'time'>>(list: T[]): T[] {
  const dated = byWhen(list).filter((s) => sessionDayKey(s))
  return [...dated.reverse(), ...list.filter((s) => !sessionDayKey(s))]
}

/**
 * Month + day for a date tile. Display only: an old label with no year
 * ("Mon, 15 Sep") still says which day it was, even though it can't be put
 * on a calendar or sorted against other years.
 */
export function tileParts(dayKey: string | null, label?: string): { month: string; day: number } | null {
  if (dayKey) return { month: monthShort(dayKey), day: Number(dayKey.slice(8, 10)) }
  const m = /(\d{1,2})\s+([A-Za-z]{3})/.exec(label ?? '')
  if (!m) return null
  const month = MONTHS.find((x) => x.toLowerCase() === m[2].toLowerCase())
  return month ? { month, day: Number(m[1]) } : null
}

/** Upcoming sessions grouped under their day, soonest first. Undated ones last. */
export function groupByDay<T extends Pick<MentorshipSession, 'scheduledAt' | 'date' | 'time'>>(list: T[]): { dayKey: string | null; items: T[] }[] {
  const groups: { dayKey: string | null; items: T[] }[] = []
  for (const s of byWhen(list)) {
    const dayKey = sessionDayKey(s)
    const last = groups[groups.length - 1]
    if (last && last.dayKey === dayKey) last.items.push(s)
    else groups.push({ dayKey, items: [s] })
  }
  return groups
}

export type HistoryFilter = 'all' | 'toConfirm' | 'toRate' | 'declined'

/** My Sessions → History chips. Mirrors the buttons the rows show. */
export function matchesHistory(s: MentorshipSession, f: HistoryFilter): boolean {
  const declined = s.status === 'declined'
  if (f === 'declined') return declined
  if (f === 'toConfirm') return !declined && !!s.mentorConfirmed && !s.menteeConfirmed
  if (f === 'toRate') return !declined && !s.rating
  return true
}

// ---- Find a Mentor ----------------------------------------------------------

export type MentorSort = 'rating' | 'sessions' | 'rate'

/** Every Mentorship search: each typed word must appear somewhere in the
 *  given fields, in any order and case ("cloud aws", "priya razorpay"). */
export function matchesQuery(fields: (string | undefined | null)[], text: string): boolean {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = fields.filter(Boolean).join(' ').toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** Find a Mentor search: name, domain, skills, title or company. */
export function matchesMentorSearch(
  m: { name: string; domain?: string; expertise?: string[]; designation?: string; company?: string },
  text: string,
): boolean {
  return matchesQuery([m.name, m.domain, ...(m.expertise ?? []), m.designation, m.company], text)
}

export function sortMentors<T extends { id: string; sessionsConducted?: number; mentorRate?: number }>(
  mentors: T[],
  sort: MentorSort,
  ratings: Map<string, { avg: number; count: number }>,
): T[] {
  const list = [...mentors]
  if (sort === 'sessions') return list.sort((a, b) => (b.sessionsConducted ?? 0) - (a.sessionsConducted ?? 0))
  // "Rate on request" mentors have no number to compare, so they go last.
  if (sort === 'rate') return list.sort((a, b) => (a.mentorRate || Infinity) - (b.mentorRate || Infinity))
  return list.sort((a, b) => {
    const ra = ratings.get(a.id), rb = ratings.get(b.id)
    return (rb?.avg ?? 0) - (ra?.avg ?? 0) || (rb?.count ?? 0) - (ra?.count ?? 0)
  })
}

// ---- Sidebar summaries ------------------------------------------------------

/**
 * Mentors this member already has a pending request with (as the mentee).
 * A slot a mentor offered doesn't count — that waits on the member, not the
 * mentor. One rule for the Book button, the ?book= guard and Book again.
 */
export function pendingRequestMentorIds(sessions: MentorshipSession[], me: string): Set<string> {
  return new Set(
    sessions
      .filter((s) => s.status === 'requested' && s.menteeId === me && s.requestedBy !== 'mentor')
      .map((s) => s.mentorId),
  )
}

/**
 * Mentee free-session allowance: the first `allowance` booked (non-declined)
 * sessions are free. Sessions a mentor offered are excluded — they were
 * given, not spent. Mirrors the same rule in mentorship.routes.ts.
 */
export function freeSessionsLeft(sessions: MentorshipSession[], me: string, allowance: number): number {
  const used = sessions.filter((s) => s.menteeId === me && s.status !== 'declined' && s.requestedBy !== 'mentor').length
  return Math.max(0, allowance - used)
}

/** Mentors this member has had a (non-declined) session with, most first. */
export function myMentors(sessions: MentorshipSession[], me: string): { mentorId: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const s of sessions) {
    if (s.menteeId !== me || s.status === 'declined') continue
    counts.set(s.mentorId, (counts.get(s.mentorId) ?? 0) + 1)
  }
  return [...counts].map(([mentorId, count]) => ({ mentorId, count })).sort((a, b) => b.count - a.count)
}

/** The soonest confirmed session from a list, today or later. */
export function nextSession<T extends MentorshipSession>(list: T[], now: number): T | undefined {
  const today = istDayKey(now) ?? ''
  return byWhen(list.filter((s) => s.status === 'upcoming')).find((s) => (sessionDayKey(s) ?? '~') >= today)
}

/** A hosting record from the member's own group sessions. */
export function hostingRecord(hosted: GroupSession[]): { hosted: number; attendees: number; avgFill: number | null } {
  const done = hosted.filter((g) => g.status !== 'cancelled')
  const attendees = done.reduce((n, g) => n + g.attendeeCount, 0)
  const seats = done.reduce((n, g) => n + g.capacity, 0)
  return { hosted: done.length, attendees, avgFill: seats ? Math.round((attendees / seats) * 100) : null }
}

// ---- Group session skills ------------------------------------------------------

/** How many domains/skills one group session can carry. */
export const MAX_TAGS = 6

/** "Cloud, AI/ML, Kubernetes" → ['Cloud', 'AI/ML', 'Kubernetes']. Older sessions hold one value. */
export function parseTags(domain: string | undefined): string[] {
  return joinTags((domain ?? '').split(',')).split(', ').filter(Boolean)
}

/** Clean a list of skills into the stored text: trimmed, no duplicates (any case), at most MAX_TAGS, each ≤ 30 chars. */
export function joinTags(tags: string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = raw.trim().replace(/\s+/g, ' ').slice(0, 30)
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push(t)
    if (out.length === MAX_TAGS) break
  }
  return out.join(', ')
}

/** Discover sessions per skill, for the sidebar's "Discover by topic". */
export function openByDomain(open: GroupSession[], mine: GroupSession[] = []): { domain: string; count: number }[] {
  // Same rule as the Discover sessions list: ones you host or already attend aren't "open" to you.
  const mineIds = new Set(mine.map((g) => g.id))
  const by = new Map<string, number>()
  for (const g of open) {
    if (g.status !== 'scheduled' || mineIds.has(g.id)) continue
    for (const tag of parseTags(g.domain)) by.set(tag, (by.get(tag) ?? 0) + 1)
  }
  return [...by].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
}
