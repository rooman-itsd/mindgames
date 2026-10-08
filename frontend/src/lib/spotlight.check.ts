// Sanity checks for the Home Spotlight picker. Run with:
//   npm --prefix frontend run check
import assert from 'node:assert'
import type { AppEvent, Community, Post, User } from '../types'
import { featuredPinned, pickSpotlights, spotlightKey, type SpotlightInput } from './spotlight'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()
const ahead = (days: number) => new Date(NOW + days * DAY).toISOString()

const user = (id: string, extra: Partial<User> = {}): User =>
  ({ id, name: id, company: '', batchYear: 2022, domain: 'Cloud', city: 'Bengaluru', isMentor: false, ...extra }) as User
const post = (id: string, authorId: string, type: Post['type'], extra: Partial<Post> = {}): Post =>
  ({ id, authorId, type, content: id, createdAt: ago(1), likes: 0, reactions: {}, comments: [], saved: false, ...extra }) as Post
const event = (id: string, extra: Partial<AppEvent> = {}): AppEvent =>
  ({ id, title: id, startsAt: ahead(3), rsvpCount: 10, capacity: 50, rsvpedByMe: false, status: 'approved', ...extra }) as AppEvent
const community = (id: string, extra: Partial<Community> = {}): Community =>
  ({ id, name: id, tag: 'General', memberCount: 100, joined: false, status: 'approved', ...extra }) as Community

const me = user('me', { batchYear: 2022, domain: 'Cloud' })
const base: SpotlightInput = { posts: [], events: [], users: [me], communities: [], me, now: NOW }
const kinds = (s: ReturnType<typeof pickSpotlights>) => s.map((x) => x.kind)

// Nothing to show → nothing.
assert.deepEqual(pickSpotlights(base), [])

// Never more than 3 picks, and a fresh pinned post always leads.
{
  const users = [me, user('a', { company: 'Zoho', batchYear: 2022 }), user('m', { isMentor: true, mentorVerified: true })]
  const posts = [
    post('pin', 'admin', 'Update', { pinned: true, createdAt: ago(1) }),
    post('w', 'a', 'Achievement', { likes: 5, reactions: { '🎉': 5 } }),
    post('j', 'a', 'Hiring', { company: 'Zoho' }),
    post('h', 'a', 'Open to Work'),
  ]
  const s = pickSpotlights({ ...base, users, posts, events: [event('e')], communities: [community('c')] })
  assert.equal(s.length, 3, 'capped at 3')
  assert.equal(s[0].kind, 'pinned', 'pinned leads')
  // Keys are unique, so the card can track picks across re-renders.
  assert.equal(new Set(s.map(spotlightKey)).size, s.length)
}

// A pinned post older than 3 days drops out.
assert.ok(!kinds(pickSpotlights({ ...base, posts: [post('old', 'admin', 'Update', { pinned: true, createdAt: ago(5) })] })).includes('pinned'))

// My own posts are never spotlighted; an un-reacted win isn't a "big" win.
{
  const s = pickSpotlights({
    ...base,
    users: [me, user('a')],
    posts: [post('mine', 'me', 'Achievement', { likes: 99, reactions: { '🎉': 99 } }), post('quiet', 'a', 'Achievement')],
  })
  assert.ok(!kinds(s).includes('win'))
}

// Hot job: closed jobs are skipped; "alumni there" excludes me, and the author only if they work there.
{
  const users = [
    me,
    user('author', { company: 'Zoho' }),
    user('z1', { company: 'Zoho' }),
    user('z2', { company: ' zoho ' }), // normalised
    user('recruiter', { company: 'HireCo' }),
  ]
  const meAtZoho = { ...me, company: 'Zoho' }
  const open = pickSpotlights({ ...base, me: meAtZoho, users: [meAtZoho, ...users.slice(1)], posts: [post('j', 'author', 'Hiring', { company: 'Zoho' })] })
  const job = open.find((x) => x.kind === 'job')
  assert.ok(job && job.kind === 'job' && job.insiders === 2, 'z1 + z2; not the author, not me')

  const byRecruiter = pickSpotlights({ ...base, users, posts: [post('j2', 'recruiter', 'Hiring', { company: 'Zoho' })] })
  const job2 = byRecruiter.find((x) => x.kind === 'job')
  assert.ok(job2 && job2.kind === 'job' && job2.insiders === 3, 'a recruiter elsewhere does not reduce the count')

  const closed = pickSpotlights({ ...base, users, posts: [post('j3', 'author', 'Hiring', { company: 'Zoho', active: false })] })
  assert.ok(!kinds(closed).includes('job'))
}

// Someone needs a hand: the ask with the fewest replies wins.
{
  const s = pickSpotlights({
    ...base,
    users: [me, user('a'), user('b')],
    posts: [
      post('busy', 'a', 'Open to Work', { comments: [{ id: '1' }, { id: '2' }] as Post['comments'] }),
      post('lonely', 'b', 'Open to Work'),
    ],
  })
  const help = s.find((x) => x.kind === 'help')
  assert.ok(help && help.kind === 'help' && help.post.id === 'lonely')
}

// Events: past, too far out and unapproved are skipped; one I'm not going to beats one I am.
{
  const s = pickSpotlights({
    ...base,
    events: [
      event('past', { startsAt: ago(1) }),
      event('far', { startsAt: ahead(30) }),
      event('pending', { status: 'pending' }),
      event('going', { rsvpedByMe: true, rsvpCount: 49 }),
      event('open', { rsvpCount: 30 }),
    ],
  })
  const ev = s.find((x) => x.kind === 'event')
  assert.ok(ev && ev.kind === 'event' && ev.event.id === 'open')
}

// Mentor: only verified mentors; topic overlap with what I asked for wins.
{
  const asker = { ...me, seekingMentorshipIn: ['System design'] }
  const s = pickSpotlights({
    ...base,
    me: asker,
    users: [
      asker,
      user('unverified', { isMentor: true, mentorVerified: false, mentorTopics: ['System design'] }),
      user('busy', { isMentor: true, mentorVerified: true, mentorTopics: ['Sales'], sessionsConducted: 40 }),
      user('match', { isMentor: true, mentorVerified: true, mentorTopics: ['system design'] }),
    ],
  })
  const m = s.find((x) => x.kind === 'mentor')
  assert.ok(m && m.kind === 'mentor' && m.mentor.id === 'match')
}

// Community: joined and pending ones are skipped; one matching my field wins.
{
  const s = pickSpotlights({
    ...base,
    communities: [
      community('joined', { joined: true, tag: 'Cloud' }),
      community('pending', { status: 'pending', tag: 'Cloud' }),
      community('big', { memberCount: 200 }),
      community('cloud', { tag: 'Cloud' }),
    ],
    posts: [post('cp', 'a', 'Update', { communityId: 'cloud' })],
    users: [me, user('a')],
  })
  const c = s.find((x) => x.kind === 'community')
  assert.ok(c && c.kind === 'community' && c.community.id === 'cloud' && c.postsThisWeek === 1 && c.authorIds[0] === 'a')
}

// Milestone needs at least 3 jobs from my batch in the last 30 days.
{
  const users = [me, user('b1', { batchYear: 2022 }), user('b2', { batchYear: 2022 }), user('x', { batchYear: 2019 })]
  const two = [post('1', 'b1', 'Hiring', { active: false }), post('2', 'b2', 'Hiring', { active: false }), post('3', 'x', 'Hiring', { active: false })]
  assert.ok(!kinds(pickSpotlights({ ...base, users, posts: two })).includes('milestone'))
  const three = [...two, post('4', 'b1', 'Hiring', { active: false, createdAt: ago(10) })]
  const s = pickSpotlights({ ...base, users, posts: three })
  const ms = s.find((x) => x.kind === 'milestone')
  assert.ok(ms && ms.kind === 'milestone' && ms.jobs === 3 && ms.batchYear === 2022)
}

// Leans: an "Open to Work" member sees the job first, whatever today's rotation is.
{
  const seeker = { ...me, profileTags: ['Open to Work'] } as User
  const users = [seeker, user('a', { company: 'Zoho' })]
  const posts = [post('w', 'a', 'Achievement', { likes: 3, reactions: { '👍': 3 } }), post('j', 'a', 'Hiring', { company: 'Zoho' }), post('h', 'a', 'Open to Work')]
  for (let d = 0; d < 7; d++) {
    const s = pickSpotlights({ ...base, me: seeker, users, posts, now: NOW + d * DAY })
    assert.equal(s[0].kind, 'job', `job leads on day +${d}`)
  }
}

// Deterministic for the same moment; the leading type rotates across days.
{
  const users = [me, user('a', { company: 'Zoho' })]
  const posts = [post('w', 'a', 'Achievement', { likes: 3, reactions: { '👍': 3 } }), post('j', 'a', 'Hiring', { company: 'Zoho' }), post('h', 'a', 'Open to Work')]
  const input = { ...base, users, posts }
  assert.deepEqual(kinds(pickSpotlights(input)), kinds(pickSpotlights(input)))
  const leaders = new Set(Array.from({ length: 7 }, (_, d) => pickSpotlights({ ...input, now: NOW + d * DAY })[0].kind))
  assert.ok(leaders.size > 1, 'the lead type changes over a week')
}

// featuredPinned: the newest pinned post within 3 days, the card's pinned pick.
{
  const older = post('old', 'admin', 'Update', { pinned: true, createdAt: ago(2) })
  const newer = post('new', 'admin', 'Update', { pinned: true, createdAt: ago(1) })
  const stale = post('stale', 'admin', 'Update', { pinned: true, createdAt: ago(4) })
  assert.equal(featuredPinned([older, newer, stale], NOW)?.id, 'new')
  assert.equal(featuredPinned([stale], NOW), undefined)
  assert.equal(featuredPinned([post('x', 'a', 'Update')], NOW), undefined, 'unpinned posts are never featured')
  // The card and the feed agree: the pinned pick is exactly the featured post.
  const picked = pickSpotlights({ ...base, posts: [older, newer] })[0]
  assert.ok(picked.kind === 'pinned' && picked.post.id === featuredPinned([older, newer], NOW)?.id)
}

console.log('spotlight.check.ts — all assertions passed')
