import { query } from './db/pool.js'
import { pushNotification } from './notify.js'
import { DESIGNATION_KEY_SQL, designationKey } from './learning.js'

/**
 * Asks alumni to fill the gaps on the Learning Resources page.
 *
 * The page only has content because alumni share what helped them, so
 * something has to tell them where they are needed. This finds topics members
 * are working on that nobody has shared for, and notifies alumni who are
 * already in that role.
 *
 * No AI: "who is in this role" is a string match on their designation, and
 * "where are members stuck" is a counter on the topic row. Running once an
 * hour and claiming topics in the database means several server instances can
 * run it without anyone being nudged twice.
 */

const TICK_MS = 60 * 60 * 1000
/** Topics handled per tick, so one run can never fan out without bound. */
const TOPICS_PER_TICK = 5
/** Alumni asked per topic. Few, so being asked stays meaningful. */
const ALUMNI_PER_TOPIC = 5
/** Candidates read per topic before choosing who to ask — a fixed bound, so
 *  the cost does not grow with how many members hold a popular title. */
const CANDIDATES = 50

/** A small stable hash, to rotate which candidates a topic asks. */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
/** A topic is nudged again only after this long. */
const NUDGE_EVERY = '7 days'
/** Below this many members waiting, a gap is not worth anyone's inbox. */
const MIN_MEMBERS = 2

let running = false

interface Gap {
  topic_key: string
  role_label: string
  stage_label: string
  member_count: number
}

async function tick() {
  if (running) return
  running = true
  try {
    // Claim the gaps: topics with members waiting, nothing shared, and not
    // nudged recently. Stamping nudged_at inside the same UPDATE is the claim,
    // so a second instance running at the same moment picks different rows.
    const gaps = await query<Gap>(
      `UPDATE learning_topics t
          SET nudged_at = now()
        WHERE t.topic_key IN (
                SELECT topic_key FROM learning_topics
                 WHERE member_count >= $1
                   AND (nudged_at IS NULL OR nudged_at < now() - $2::interval)
                   AND NOT EXISTS (
                         SELECT 1 FROM learning_share_topics st
                           JOIN learning_shares s ON s.id = st.share_id
                          WHERE st.topic_key = learning_topics.topic_key AND NOT s.hidden)
                 ORDER BY member_count DESC
                 LIMIT $3
                 FOR UPDATE SKIP LOCKED)
        RETURNING t.topic_key, t.role_label, t.stage_label, t.member_count`,
      [MIN_MEMBERS, NUDGE_EVERY, TOPICS_PER_TICK],
    )

    for (const gap of gaps.rows) {
      // Who can speak to this: members who already hold the target role,
      // mentors first (they opted into helping). Read straight off
      // idx_users_designation_key and capped at CANDIDATES, so this never
      // scans users however many hold a popular title. Members on the topic
      // themselves are dropped: they are the ones waiting for the answer.
      const pool = await query<{ id: string }>(
        `SELECT u.id
           FROM users u
          WHERE ${DESIGNATION_KEY_SQL} = $1
            AND NOT u.is_admin
            AND NOT EXISTS (SELECT 1 FROM learning_topic_members m
                             WHERE m.topic_key = $2 AND m.user_id = u.id)
          ORDER BY ${DESIGNATION_KEY_SQL}, u.is_mentor DESC, u.id
          LIMIT $3`,
        [designationKey(gap.role_label), gap.topic_key, CANDIDATES],
      )
      // Rotate through the pool by topic, so the same five people are not
      // asked about every stage of a popular role.
      const ids = pool.rows.map((r) => r.id)
      const start = ids.length ? hash(gap.topic_key) % ids.length : 0
      const chosen = [...ids.slice(start), ...ids.slice(0, start)].slice(0, ALUMNI_PER_TOPIC)

      const waiting = gap.member_count === 1 ? '1 member is' : `${gap.member_count} members are`
      for (const alumId of chosen) {
        void pushNotification(
          alumId,
          'mentorship',
          `${waiting} working on "${gap.stage_label}" — share what helped you get through it?`,
          undefined,
          { type: 'learning_topic', id: gap.topic_key },
        )
      }
    }
  } catch (err) {
    console.error('learning nudge failed:', err instanceof Error ? err.message : err)
  } finally {
    running = false
  }
}

/** Started once from server.ts, beside the other schedulers. */
export function startLearningNudgeScheduler() {
  setInterval(() => void tick(), TICK_MS)
  // Not at boot: a restart loop would otherwise nudge on every start.
  setTimeout(() => void tick(), 5 * 60_000)
}
