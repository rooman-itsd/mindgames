import assert from 'node:assert'
import {
  attendKind, attendingUnder, hostingUnder, istDateTime, nextHosted, byWhen, dayHeading, daysFromToday, itemsByDay, istInputParts, istInputToIso, istTime, pendingRequestMentorIds, defaultSelectedDay, freeSessionsLeft, groupCalendar, groupByDay, hostingRecord, istDayKey,
  labelMinutes, matchesHistory, matchesMentorSearch, matchesQuery, menteeCalendar, mentorCalendar, monthGrid, myMentors, nextSession, openByDomain,
  relativeDayLabel, sessionDayKey, shiftMonth, sortMentors, newestFirst, tileParts, joinTags, parseTags, MAX_TAGS,
} from './agenda'
import type { GroupSession, MentorshipSession } from '../types'

// Fri 9 Oct 2026, 10:00 IST
const NOW = Date.parse('2026-10-09T04:30:00.000Z')

// --- days, in IST -------------------------------------------------------------
assert.strictEqual(istDayKey('2026-10-09T19:00:00.000Z'), '2026-10-10', '00:30 IST is already the next day')
assert.strictEqual(istDayKey('nonsense'), null)
assert.strictEqual(sessionDayKey({ date: 'Fri, 26 Sep 2026' }), '2026-09-26', 'stored label')
assert.strictEqual(sessionDayKey({ date: 'Sat, 3 Oct 2026' }), '2026-10-03', 'single-digit day')
assert.strictEqual(sessionDayKey({ date: 'Sat, 26 Sept 2026' }), '2026-09-26', 'ICU "Sept"')
assert.strictEqual(sessionDayKey({ date: 'next Tuesday evening' }), null, 'free text is never guessed')
assert.strictEqual(sessionDayKey({ date: '2026-10-05' }), '2026-10-05', 'ISO label')
assert.strictEqual(sessionDayKey({ date: 'Mon, 15 Sep' }), null, 'no year is ambiguous — not guessed')
assert.strictEqual(sessionDayKey({ date: 'Fri, 26 Sep 2026', scheduledAt: '2026-10-14T13:30:00.000Z' }), '2026-10-14', 'real instant wins')
assert.strictEqual(labelMinutes('8:00 PM IST'), 20 * 60)
assert.strictEqual(labelMinutes('12:15 AM IST'), 15)
assert.strictEqual(labelMinutes('12:00 PM IST'), 12 * 60)
assert.strictEqual(labelMinutes(undefined), null)
assert.strictEqual(daysFromToday('2026-10-11', NOW), 2)
assert.strictEqual(daysFromToday('2026-10-09', NOW), 0)
assert.strictEqual(daysFromToday('2026-09-27', NOW), -12)
assert.strictEqual(relativeDayLabel(0), 'today')
assert.strictEqual(relativeDayLabel(1), 'tomorrow')
assert.strictEqual(relativeDayLabel(11), 'in 11 days')
assert.strictEqual(relativeDayLabel(-3), '3 days ago')
assert.strictEqual(dayHeading('2026-10-11'), 'Sun 11 Oct', 'the weekday the mockup got wrong')
assert.strictEqual(dayHeading('2026-10-14'), 'Wed 14 Oct')
assert.strictEqual(dayHeading('2026-09-23'), 'Wed 23 Sep', 'never "Sept", whatever the ICU data')

// --- month grid -----------------------------------------------------------------
const oct = monthGrid(2026, 9)
assert.deepStrictEqual(oct.slice(0, 4), [null, null, null, 1], '1 Oct 2026 is a Thursday')
assert.strictEqual(oct.filter((d) => d !== null).length, 31)
assert.strictEqual(monthGrid(2026, 1).filter((d) => d !== null).length, 28, 'Feb 2026')
assert.strictEqual(monthGrid(2026, 5)[0], 1, '1 Jun 2026 is a Monday — no blanks')
assert.deepStrictEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 })
assert.deepStrictEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 })

// --- sessions -----------------------------------------------------------------
const s = (o: Partial<MentorshipSession>): MentorshipSession => ({
  id: o.id ?? Math.random().toString(36), mentorId: 'm1', menteeId: 'me', menteeName: 'Me', topic: 't',
  date: 'Sun, 11 Oct 2026', time: '11:00 AM IST', status: 'upcoming', ...o,
})
const sessions = [
  s({ id: 'a', status: 'upcoming', date: 'Tue, 20 Oct 2026', time: '8:00 PM IST' }),
  s({ id: 'b', status: 'upcoming' }),
  s({ id: 'c', status: 'requested', requestedBy: 'mentor', mentorId: 'm2', date: 'Fri, 16 Oct 2026' }),
  s({ id: 'd', status: 'past', date: 'Sun, 27 Sep 2026', mentorConfirmed: true, menteeConfirmed: false }),
  s({ id: 'e', status: 'past', date: 'Sat, 12 Sep 2026', mentorConfirmed: true, menteeConfirmed: true, rating: 5 }),
  s({ id: 'f', status: 'declined', date: 'Wed, 2 Sep 2026', mentorId: 'm3' }),
  s({ id: 'g', status: 'upcoming', date: 'free text', mentorId: 'm1' }),
  // I'm the mentor here
  s({ id: 'h', status: 'requested', mentorId: 'me', menteeId: 'x', menteeName: 'Ananya', date: 'Tue, 13 Oct 2026', time: '7:00 PM IST' }),
  s({ id: 'i', status: 'past', mentorId: 'me', menteeId: 'x', menteeName: 'Ananya', date: 'Sun, 4 Oct 2026', mentorConfirmed: true }),
]
assert.deepStrictEqual(byWhen(sessions.filter((x) => x.status === 'upcoming')).map((x) => x.id), ['b', 'a', 'g'], 'soonest first, undated last')
assert.deepStrictEqual(
  newestFirst([s({ id: 'old', date: 'Mon, 15 Sep' }), s({ id: 'x', date: 'Sat, 12 Sep 2026' }), s({ id: 'y', date: 'Sun, 27 Sep 2026' })]).map((x) => x.id),
  ['y', 'x', 'old'], 'newest first, year-less labels last — not on top',
)
assert.deepStrictEqual(tileParts('2026-09-23'), { month: 'Sep', day: 23 })
assert.deepStrictEqual(tileParts(null, 'Mon, 15 Sep'), { month: 'Sep', day: 15 }, 'year-less label still shows a tile')
assert.strictEqual(tileParts(null, 'next week'), null)
assert.deepStrictEqual(groupByDay([sessions[0], sessions[1]]).map((g) => g.dayKey), ['2026-10-11', '2026-10-20'])

const names = (id: string) => ({ m1: 'Arjun', m2: 'Kavya' } as Record<string, string>)[id]
const mentee = menteeCalendar(sessions, 'me', names)
assert.deepStrictEqual(mentee.map((i) => [i.dayKey, i.kind]), [
  ['2026-10-20', 'confirmed'], ['2026-10-11', 'confirmed'], ['2026-10-16', 'waiting'],
], 'only my upcoming/requested 1:1s, undatable ones skipped')
assert.ok(mentee[2].detail.includes('Kavya offered this'))
assert.deepStrictEqual(mentee[0].ref, { tab: 'sessions', id: 'a' }, 'items point at their tab + row')
assert.deepStrictEqual(mentorCalendar(sessions, 'me')[0].ref, { tab: 'space', id: 'h' })
const mentor = mentorCalendar(sessions, 'me')
assert.deepStrictEqual(mentor.map((i) => i.kind), ['waiting', 'toConfirm'])
assert.strictEqual(defaultSelectedDay(mentee, NOW), '2026-10-11', 'next busy day')
assert.strictEqual(defaultSelectedDay([], NOW), '2026-10-09', 'nothing booked → today')

assert.ok(matchesHistory(sessions[3], 'toConfirm'))
assert.ok(!matchesHistory(sessions[4], 'toConfirm'))
assert.ok(matchesHistory(sessions[3], 'toRate'))
assert.ok(!matchesHistory(sessions[4], 'toRate'), 'already rated')
assert.ok(!matchesHistory(sessions[5], 'toRate'), 'declined sessions are never "to rate"')
assert.ok(matchesHistory(sessions[5], 'declined'))

// a, b, d, e, g count; c was offered by the mentor, f was declined, h/i I mentor
assert.strictEqual(freeSessionsLeft(sessions, 'me', 3), 0)
assert.strictEqual(freeSessionsLeft(sessions, 'me', 8), 3)
assert.strictEqual(freeSessionsLeft([], 'me', 3), 3)
assert.deepStrictEqual(myMentors(sessions, 'me'), [{ mentorId: 'm1', count: 5 }, { mentorId: 'm2', count: 1 }], 'declined excluded')
assert.strictEqual(nextSession(sessions.filter((x) => x.menteeId === 'me'), NOW)?.id, 'b')

// --- mentors ------------------------------------------------------------------
const ms = [
  { id: 'p', sessionsConducted: 41, mentorRate: 1500 },
  { id: 'k', sessionsConducted: 19 },
  { id: 'r', sessionsConducted: 12, mentorRate: 800 },
]
const ratings = new Map([['p', { avg: 4.9, count: 32 }], ['r', { avg: 4.9, count: 40 }], ['k', { avg: 4.7, count: 15 }]])
assert.deepStrictEqual(sortMentors(ms, 'rating', ratings).map((m) => m.id), ['r', 'p', 'k'], 'tie broken by count')
assert.deepStrictEqual(sortMentors(ms, 'rate', ratings).map((m) => m.id), ['r', 'p', 'k'], 'rate on request last')
assert.deepStrictEqual(sortMentors(ms, 'sessions', ratings).map((m) => m.id), ['p', 'k', 'r'])

const priya = { name: 'Priya Raghavan', domain: 'Cloud & DevOps', expertise: ['Kubernetes', 'AWS'], designation: 'Senior SRE', company: 'Razorpay' }
assert.ok(matchesMentorSearch(priya, ''), 'empty search matches everyone')
assert.ok(matchesMentorSearch(priya, 'aws'), 'skill')
assert.ok(matchesMentorSearch(priya, '  Cloud   RAZORPAY '), 'every word, any field, any case')
assert.ok(!matchesMentorSearch(priya, 'cloud swiggy'), 'all words must match')
assert.ok(matchesMentorSearch({ name: 'Kavya' }, 'kav'), 'missing fields are fine')
assert.ok(matchesQuery(['Kubernetes rollout strategies', 'Kalpit Das', undefined], 'kalpit rollout'), 'words across fields')
assert.ok(!matchesQuery(['Kubernetes rollout strategies', 'Kalpit Das'], 'kalpit terraform'))
assert.ok(matchesQuery([], '   '), 'blank search matches everything')

// --- group sessions -------------------------------------------------------------
const g = (o: Partial<GroupSession>): GroupSession => ({
  id: 'g', mentorId: 'host', mentorName: 'Priya', topic: 't', description: '', domain: 'Cloud', scheduledAt: '2026-10-14T12:30:00.000Z',
  durationMinutes: 60, capacity: 25, attendeeCount: 18, seatsLeft: 7, pricingMode: 'free', pricePerSeat: 0,
  status: 'scheduled', visibility: 'public', joinedByMe: false, invitedByMe: false, mentorConfirmed: false, ...o,
})
const mine = [
  g({ id: '1', mentorId: 'me' }),
  g({ id: '2', mentorId: 'me', status: 'cancelled' }),
  g({ id: '3', joinedByMe: true, scheduledAt: '2026-10-19T11:30:00.000Z' }),
  g({ id: '4', invitedByMe: true, visibility: 'invite_only' }),
]
const open = [g({ id: '3' }), g({ id: '5', domain: 'Security' }), g({ id: '6', domain: 'Security', seatsLeft: 0 })]
const cal = groupCalendar(mine, open, 'me')
assert.deepStrictEqual(cal.map((i) => [i.kind, i.dayKey]), [
  ['hosting', '2026-10-14'], ['joined', '2026-10-19'], ['joined', '2026-10-14'], ['open', '2026-10-14'], ['open', '2026-10-14'],
], 'cancelled hidden, a joined session is not also listed as open')
assert.ok(cal[0].detail.includes('6:00 PM'), 'group time shown in IST')
assert.ok(groupCalendar([g({ id: 'c', joinedByMe: true, status: 'completed', confirmedByMe: true })], [], 'me')[0].detail.endsWith('attended'), 'confirmed attendance reads "attended"')
assert.ok(groupCalendar([g({ id: 'c', joinedByMe: true, status: 'completed' })], [], 'me')[0].detail.endsWith('confirm attendance'))
const sameDay = itemsByDay([
  { dayKey: '2026-10-14', kind: 'joined', title: 'late', detail: '', mins: 20 * 60, ref: { tab: 'group', id: 'x' } },
  { dayKey: '2026-10-14', kind: 'confirmed', title: 'early', detail: '', mins: 9 * 60, ref: { tab: 'sessions', id: 'y' } },
]).get('2026-10-14')!.map((i) => i.title)
assert.deepStrictEqual(sameDay, ['early', 'late'], 'a day lists its items by time')
assert.deepStrictEqual(hostingRecord(mine.filter((x) => x.mentorId === 'me')), { hosted: 0, attendees: 0, avgFill: null }, 'upcoming + cancelled are not a record')
assert.deepStrictEqual(hostingRecord([...mine, g({ id: '7', mentorId: 'me', status: 'completed', attendeeCount: 20 })].filter((x) => x.mentorId === 'me')), { hosted: 1, attendees: 20, avgFill: 80 }, 'only completed sessions count')
assert.deepStrictEqual(hostingRecord([]), { hosted: 0, attendees: 0, avgFill: null })
assert.deepStrictEqual(openByDomain(open), [{ domain: 'Security', count: 2 }, { domain: 'Cloud', count: 1 }])
assert.deepStrictEqual(openByDomain(open, mine), [{ domain: 'Security', count: 2 }], 'sessions I host or joined are not "open" to me')

// --- group skills ---------------------------------------------------------------
assert.strictEqual(joinTags([' Cloud ', 'cloud', 'AI/ML', '', 'Kubernetes  basics']), 'Cloud, AI/ML, Kubernetes basics', 'trim, dedupe any case, squash spaces')
assert.deepStrictEqual(parseTags('Cloud, AI/ML,Kubernetes'), ['Cloud', 'AI/ML', 'Kubernetes'])
assert.deepStrictEqual(parseTags('Cybersecurity'), ['Cybersecurity'], 'older single-domain sessions still read')
assert.deepStrictEqual(parseTags(''), [])
assert.strictEqual(parseTags(joinTags(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])).length, MAX_TAGS, 'capped')
assert.deepStrictEqual(
  openByDomain([g({ id: 'm1', domain: 'Cloud, AI/ML' }), g({ id: 'm2', domain: 'AI/ML' })]),
  [{ domain: 'AI/ML', count: 2 }, { domain: 'Cloud', count: 1 }], 'each skill counted',
)

// --- IST inputs / time (review a) -----------------------------------------------------
assert.deepStrictEqual(istInputParts('2026-10-14T13:00:00.000Z'), { date: '2026-10-14', time: '18:30' })
assert.deepStrictEqual(istInputParts('2026-10-14T19:00:00.000Z'), { date: '2026-10-15', time: '00:30' }, 'past midnight IST')
assert.strictEqual(istInputToIso('2026-10-15', '00:30'), '2026-10-14T19:00:00.000Z', 'round-trips')
assert.strictEqual(istInputToIso('', ''), null)
assert.strictEqual(istTime('2026-10-14T13:00:00.000Z'), '6:30 PM')
// lapsed invite stays off the calendar
assert.strictEqual(groupCalendar([g({ id: 'l', invitedByMe: true, status: 'completed' })], [], 'me').length, 0, 'lapsed invite not on calendar')
// one pending rule
assert.deepStrictEqual([...pendingRequestMentorIds([...sessions, s({ id: 'r', status: 'requested', requestedBy: 'mentee', mentorId: 'm4' })], 'me')], ['m4'], 'own requests only — not the mentor offer from m2, nor requests where I mentor')

// --- group lists (review b) -------------------------------------------------------
assert.strictEqual(istDateTime('2026-09-26T13:00:00.000Z'), '26 Sep, 6:30 PM', 'never "Sept"')
assert.strictEqual(istDateTime('2026-10-14T19:00:00.000Z'), '15 Oct, 12:30 AM', 'IST day, not UTC day')
assert.strictEqual(attendKind(g({ joinedByMe: true })), 'upcoming')
assert.strictEqual(attendKind(g({ joinedByMe: true, status: 'completed' })), 'completed')
assert.strictEqual(attendKind(g({ invitedByMe: true })), 'invited')
assert.strictEqual(attendKind(g({ invitedByMe: true, status: 'completed' })), null, 'lapsed invite')
assert.strictEqual(attendKind(g({ joinedByMe: true, status: 'cancelled' })), 'cancelled')
const hosted = [
  g({ id: 'a', mentorId: 'me', scheduledAt: '2026-10-20T10:00:00.000Z' }),
  g({ id: 'b', mentorId: 'me', scheduledAt: '2026-10-12T10:00:00.000Z' }),
  g({ id: 'c', mentorId: 'me', status: 'completed', scheduledAt: '2026-09-01T10:00:00.000Z' }),
  g({ id: 'd', mentorId: 'me', status: 'completed', scheduledAt: '2026-10-01T10:00:00.000Z' }),
  g({ id: 'e', mentorId: 'me', status: 'cancelled', scheduledAt: '2026-10-05T10:00:00.000Z' }),
]
assert.deepStrictEqual(hostingUnder(hosted, 'scheduled').map((x) => x.id), ['b', 'a'], 'upcoming soonest first')
assert.deepStrictEqual(hostingUnder(hosted, 'completed').map((x) => x.id), ['d', 'c'], 'completed most recent first')
assert.deepStrictEqual(hostingUnder(hosted, 'all').map((x) => x.id), ['a', 'b', 'e', 'd', 'c'])
assert.deepStrictEqual(attendingUnder([g({ id: 'x', invitedByMe: true, status: 'completed' }), g({ id: 'y', invitedByMe: true })], 'invited').map((x) => x.id), ['y'])
assert.deepStrictEqual(attendingUnder([g({ id: 'x', invitedByMe: true, status: 'completed' })], 'all').map((x) => x.id), ['x'], 'lapsed only under All')
const NOW_TS = Date.parse('2026-10-12T05:00:00.000Z')
assert.strictEqual(nextHosted(hosted, 'me', NOW_TS)?.id, 'b')
assert.strictEqual(nextHosted(hosted, 'someone-else', NOW_TS), undefined)
assert.strictEqual(nextHosted(hosted, 'me', Date.parse('2026-10-25T00:00:00.000Z')), undefined, 'nothing left to host')

console.log('agenda.check.ts — all assertions passed')
