// Sanity checks for the Home feed rule (lib/homeFeed.ts). Run with:
//   npm --prefix frontend run check
import assert from 'node:assert'
import type { Post, User } from '../types'
import { dealColumns, homeFeedPosts } from './homeFeed'

const HOUR = 60 * 60 * 1000
const NOW = Date.now()
const post = (id: string, authorId: string, hoursAgo: number, extra: Partial<Post> = {}): Post =>
  ({ id, authorId, type: 'Update', content: id, createdAt: new Date(NOW - hoursAgo * HOUR).toISOString(), likes: 0, comments: [], ...extra }) as Post
const users = [{ id: 'friend', name: 'Friend' }, { id: 'stranger', name: 'Stranger' }] as User[]
const ids = (ps: Post[]) => ps.map((p) => p.id)
const base = { users, query: '', connectionIds: ['friend'], focusId: null, now: NOW }

// Primary rule: my network's last 48 hours, newest first, pinned posts on top.
assert.deepEqual(
  ids(homeFeedPosts({ ...base, posts: [post('old-friend', 'friend', 72), post('new-friend', 'friend', 1), post('mid-friend', 'friend', 10), post('stranger', 'stranger', 1), post('pin', 'stranger', 200, { pinned: true })] })),
  ['pin', 'new-friend', 'mid-friend'],
)

// Nothing recent from my network → widen to my network at any age, then to everyone.
assert.deepEqual(ids(homeFeedPosts({ ...base, posts: [post('old-friend', 'friend', 72), post('stranger', 'stranger', 1)] })), ['old-friend'])
assert.deepEqual(ids(homeFeedPosts({ ...base, connectionIds: [], posts: [post('a', 'stranger', 5), post('b', 'stranger', 1)] })), ['b', 'a'])

// An active search searches every post, not just the window.
assert.deepEqual(ids(homeFeedPosts({ ...base, query: 'stranger', posts: [post('friend-post', 'friend', 1), post('stranger', 'stranger', 300)] })), ['stranger'])

// A deep-linked post outside the window is pulled in at the end.
assert.deepEqual(ids(homeFeedPosts({ ...base, focusId: 'far', posts: [post('near', 'friend', 1), post('far', 'stranger', 400)] })), ['near', 'far'])

// Two columns: a first deal alternates left/right, newest first.
const first = dealColumns(['a', 'b', 'c', 'd'], new Map())
assert.deepEqual([...first], [['a', 0], ['b', 1], ['c', 0], ['d', 1]])
// A new post on top moves no older post (a moved card loses its draft comment).
const second = dealColumns(['new', 'a', 'b', 'c', 'd'], first)
for (const id of ['a', 'b', 'c', 'd']) assert.equal(second.get(id), first.get(id))
assert.equal(second.get('new'), 0)
// A post that left the feed frees its slot: the next new one fills that column.
const third = dealColumns(['newer', 'new', 'a', 'c', 'd'], second)
assert.equal(third.has('b'), false)
assert.equal(third.get('newer'), 1)

console.log('homeFeed.check.ts — all assertions passed')
