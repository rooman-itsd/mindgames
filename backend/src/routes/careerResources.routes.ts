import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db/pool.js'
import { requireAuth } from '../auth/middleware.js'
import { ApiError, asyncHandler } from '../http.js'
import { pushNotification } from '../notify.js'
import { HTTP_URL, HTTP_URL_MESSAGE } from '../validation.js'
import { mapCareerResource, mapPublicCareerResource, type CareerResourceRow } from '../mappers.js'
import { afterAtParam, cursorRowSql, pageLimit } from '../learning.js'
import { RESOURCE_SELECT } from '../resourceQueries.js'

/**
 * Learning resources — the things a member is learning from on the way
 * through their roadmap.
 *
 * A resource is owned by whoever created it and can optionally name two
 * things, independently of each other:
 *
 *   - a roadmap stage, so the Resources page can group by stage
 *   - a mentorship session, which is how a mentor hands their mentee
 *     "read this before we meet" (only the mentor attaches; the mentee
 *     answers via POST /:id/submit when a submission is required)
 *
 * A mentor can also assign a resource straight to a member they have an
 * agreed session with, without tying it to any one session (assignedTo).
 *
 * Visibility: you see a resource if you own it, or if it was assigned to you
 * (assigned_to) — by session or directly. That rule lives here and not in
 * schema.sql because it depends on who is asking.
 */
export const careerResourcesRouter = Router()

const KINDS = ['article', 'video', 'course', 'book', 'doc', 'other'] as const
const STATUSES = ['saved', 'in_progress', 'done'] as const

// The ids the caller ($1) may see, newest first, one page at a time.
//
// Two halves glued with UNION ALL — "I own it" and "it was assigned to me" —
// each a walk of its own index (idx_career_resources_user,
// idx_career_resources_assigned). It used to be one WHERE with an OR across
// career_resources and mentorship_sessions, which no single index can answer:
// Postgres read every resource row to test it. Measured on a copy with 1M
// resources that was ~1.6s per page view; the indexed halves take ~1ms. The
// second half skips rows the caller owns, so nothing is listed twice.
//
// Paging is keyset: $2 is the id of the last row the client already has, and
// its exact (created_at, id) is looked up by primary key — or, if that row has
// since been deleted, $5 is where the client saw it (see cursorRowSql). Each
// half stops at $3 rows, so the merge reads at most 2 × $3 ids whatever the
// list's length.
//
// $4 = saved only, for the Learning page's "Saved Resources": just what the
// member kept for themselves. It drops the "assigned to me" half (mentors'
// items have their own tab there) and, from the member's own rows, anything
// they assigned to SOMEONE ELSE as a mentor — that is their outgoing work,
// not something they saved.
const VISIBLE_PAGE = `
  cursor_row AS (${cursorRowSql('career_resources', '$2', '$5')}),
  visible AS (
    (SELECT r.id FROM career_resources r
      WHERE r.user_id = $1
        AND (NOT $4::boolean OR r.assigned_to IS NULL)
        AND ($2::text IS NULL OR (r.created_at, r.id) < (SELECT created_at, id FROM cursor_row))
      ORDER BY r.created_at DESC, r.id DESC LIMIT $3)
    UNION ALL
    (SELECT r.id FROM career_resources r
      WHERE NOT $4::boolean AND r.assigned_to = $1 AND r.user_id <> $1
        AND ($2::text IS NULL OR (r.created_at, r.id) < (SELECT created_at, id FROM cursor_row))
      ORDER BY r.created_at DESC, r.id DESC LIMIT $3))`

const SELECT = RESOURCE_SELECT

/** Confirms the caller has mentored this member: an agreed (upcoming or past)
 *  session between them. The gate on assigning without a session — without it
 *  anyone could push resources and notifications into a stranger's list. One
 *  walk of idx_sessions_mentor_mentee. */
async function assertMentorOf(menteeId: string, me: string) {
  const r = await query(
    `SELECT 1 FROM mentorship_sessions
      WHERE mentor_id = $1 AND mentee_id = $2 AND status IN ('upcoming', 'past')
      LIMIT 1`,
    [me, menteeId],
  )
  if (!r.rowCount) throw new ApiError(404, 'You can only assign to members you have had a session with')
}

/** Confirms the caller is the mentor or the mentee of this session.
 *
 *  Without it anyone could attach a row to any session id and have it appear
 *  in two strangers' lists. The session link is what grants visibility, so
 *  writing one has to be gated as tightly as reading one. */
async function assertInSession(sessionId: string, me: string) {
  const r = await query(
    `SELECT 1 FROM mentorship_sessions WHERE id = $1 AND (mentor_id = $2 OR mentee_id = $2)`,
    [sessionId, me],
  )
  if (!r.rowCount) throw new ApiError(404, 'Session not found (or you are not part of it)')
}

/** A session that has finished (or been declined) — its resources are a
 *  record from then on. A resource with no session is never locked. */
function isSessionOver(status: string | null | undefined): boolean {
  return !!status && status !== 'requested' && status !== 'upcoming'
}

/** Whether a session's existing resources are frozen against edit/delete.
 *  Narrower than isSessionOver: only a completed ('past') session can hold a
 *  mentee's evidence worth protecting. A cancelled/declined one never reached
 *  /complete, so its prep stays removable — otherwise it is stuck for good.
 *  Keep in step with sessionLocked in mappers.ts. */
function isSessionLocked(status: string | null | undefined): boolean {
  return status === 'past'
}

/** Whether an assigned resource is frozen against edit/delete. Once the mentee
 *  has submitted against it, always — that is their evidence. Otherwise:
 *    - a completed session's resources from BEFORE it ended (prep, and the
 *      follow-up set at completion) are the record of that session: frozen;
 *    - resources a mentor added AFTER it ended stay editable, so a mistaken
 *      follow-up can be fixed or removed until the mentee answers it;
 *    - a direct assignment (no session) locks only on submission.
 *  Keep in step with sessionLocked in mappers.ts and the DELETE below. */
function isLocked(
  r: Pick<CareerResourceRow, 'session_id' | 'session_status' | 'assigned_to' | 'submission_url' | 'created_at' | 'session_ended_at'>,
): boolean {
  if (r.assigned_to && r.submission_url) return true
  if (!r.session_id || !isSessionLocked(r.session_status)) return false
  return !(r.session_ended_at && new Date(r.created_at) > new Date(r.session_ended_at))
}

/** isLocked as SQL, for the UPDATE and DELETE that must check and write in
 *  one step (r = career_resources). One fragment, so the two can never apply
 *  different rules. */
const LOCKED_SQL = `
  ((r.assigned_to IS NOT NULL AND r.submission_url IS NOT NULL)
   OR EXISTS (SELECT 1 FROM mentorship_sessions s
               WHERE s.id = r.session_id AND s.status = 'past'
                 AND (s.ended_at IS NULL OR r.created_at <= s.ended_at)))`

/** Attaching to a session is the mentor's job; the mentee's side is POST
 *  /:id/submit. Enforced here, not just by hiding the form in the UI, so a
 *  direct API call can't get around it. Returns the session's status, so the
 *  caller can tell prep (before / during) from a follow-up (after). */
async function assertMentorOfSession(sessionId: string, me: string): Promise<string> {
  const r = await query<{ status: string }>(
    `SELECT status FROM mentorship_sessions WHERE id = $1 AND mentor_id = $2`,
    [sessionId, me],
  )
  if (!r.rowCount) throw new ApiError(404, 'Session not found (or you are not its mentor)')
  // Before, during, or after a session that happened — a mentor can keep
  // handing that mentee things. Only a session that never happened (declined)
  // takes nothing.
  const status = r.rows[0].status
  if (isSessionOver(status) && status !== 'past') {
    throw new ApiError(400, 'This session did not go ahead — assign it directly to the member instead')
  }
  return status
}

/** Confirms the roadmap is the caller's own and really has that stage.
 *
 *  Mirrors the step-key check the roadmap step-status route already does: an
 *  unchecked key would quietly file a resource under a stage that does not
 *  exist, which the Resources page could then never show. */
async function assertOwnStage(roadmapId: string, stepKey: string | undefined, me: string) {
  const r = await query<{ data: { stages?: { stepKey?: string }[] } | null }>(
    `SELECT data FROM career_roadmaps WHERE id = $1 AND user_id = $2`,
    [roadmapId, me],
  )
  if (!r.rowCount) throw new ApiError(404, 'Roadmap not found (or not yours)')
  if (stepKey === undefined) return
  const stages = r.rows[0].data?.stages ?? []
  if (!stages.some((s) => s.stepKey === stepKey)) {
    throw new ApiError(404, 'No such step in that roadmap')
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  url: z.string().trim().url().regex(HTTP_URL, HTTP_URL_MESSAGE).max(2000).optional(),
  note: z.string().trim().max(1000).optional(),
  kind: z.enum(KINDS).optional(),
  status: z.enum(STATUSES).optional(),
  roadmapId: z.string().optional(),
  stepKey: z.string().optional(),
  sessionId: z.string().optional(),
  // A mentor assigning straight to a member, with no session attached.
  assignedTo: z.string().min(1).optional(),
  isPublic: z.boolean().optional().default(false),
  // Allowed on a direct assignment (assignedTo). On session prep it is
  // accepted only so the request gets a clear refusal below: evidence tasks
  // for a session are created at completion, never as prep.
  requiresSubmission: z.boolean().optional().default(false),
})

// Spelled out rather than createSchema.partial(), for the reason documented on
// serviceUpdateSchema in career.routes.ts: .partial() keeps each field's
// .default(), so an absent field arrives as a value and overwrites the stored
// row instead of falling through to it.
const updateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  url: z.string().trim().url().regex(HTTP_URL, HTTP_URL_MESSAGE).max(2000).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  kind: z.enum(KINDS).optional(),
  status: z.enum(STATUSES).optional(),
  isPublic: z.boolean().optional(),
})

// GET /api/career-resources — what I can see, newest first, one page at a time.
//
// ?limit= (default 20, max 50) and ?after=<id of the last row you have> page
// through it (plus ?afterAt=<its createdAt>, so a deleted last row doesn't end
// the list); a page shorter than the limit is the last one. The response is
// still a plain array, so every existing reader keeps working unchanged.
//
// ?scope=saved lists only what the caller kept for themselves (see VISIBLE_PAGE).
//
// ?sessionId= narrows it to one session, which is what the session view uses.
// A session holds a handful of resources, so that view is not paged.
careerResourcesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const savedOnly = req.query.scope === 'saved'
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined

    // assertInSession has just proved the caller is this session's mentor or
    // mentee — exactly the people its resources are for — so every row in it
    // is theirs to see: one walk of idx_career_resources_session.
    if (sessionId) {
      await assertInSession(sessionId, me)
      const r = await query<CareerResourceRow>(
        `${SELECT} WHERE r.session_id = $1 ORDER BY r.created_at DESC, r.id DESC LIMIT 200`,
        [sessionId],
      )
      res.json(r.rows.map(mapCareerResource))
      return
    }

    const limit = pageLimit(req.query.limit)
    const after = typeof req.query.after === 'string' && req.query.after ? req.query.after : null
    const afterAt = after ? afterAtParam(req.query.afterAt) : null
    const r = await query<CareerResourceRow>(
      `WITH ${VISIBLE_PAGE}
       ${SELECT} WHERE r.id IN (SELECT id FROM visible)
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $3`,
      [me, after, limit, savedOnly, afterAt],
    )
    res.json(r.rows.map(mapCareerResource))
  }),
)

// GET /api/career-resources/summary — the numbers the list's headings show,
// counted in the database over everything the caller can see:
//   { count, done, byStage: { [stepKey]: { total, done } } }
// byStage counts only rows filed against the caller's ACTIVE roadmap, the same
// rule the page uses to group them. With the list paged, these totals can no
// longer come from the rows the client happens to have loaded. Mounted before
// the '/:id' routes so "summary" is never read as an id.
careerResourcesRouter.get(
  '/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query<{ step_key: string | null; total: number; done: number }>(
      `WITH v AS (
         -- What the member kept (not what they assigned to others as a mentor)
         -- plus what mentors gave them — the Learning page's two definitions,
         -- so the number on Career Guidance matches what that page lists.
         SELECT status, roadmap_id, step_key FROM career_resources
          WHERE user_id = $1 AND assigned_to IS NULL
         UNION ALL
         SELECT status, roadmap_id, step_key FROM career_resources
          WHERE assigned_to = $1 AND user_id <> $1),
       active AS (SELECT id FROM career_roadmaps WHERE user_id = $1 AND status = 'active')
       SELECT CASE WHEN v.roadmap_id = (SELECT id FROM active) THEN v.step_key END AS step_key,
              count(*)::int AS total,
              count(*) FILTER (WHERE v.status = 'done')::int AS done
         FROM v
        GROUP BY 1`,
      [req.user!.sub],
    )
    let count = 0
    let done = 0
    const byStage: Record<string, { total: number; done: number }> = {}
    for (const row of r.rows) {
      count += row.total
      done += row.done
      if (row.step_key) byStage[row.step_key] = { total: row.total, done: row.done }
    }
    res.json({ count, done, byStage })
  }),
)

// GET /api/career-resources/assigned-by-me?menteeId= — what I, as a mentor,
// assigned straight to this member (no session), with whatever they sent back.
//
// The mentor's side of a direct assignment. Session resources already have
// theirs (the session's Resources view); without this, a mentor who asked for
// proof of work had nowhere to see it, edit what they assigned, or remove it.
// Only the caller's own rows (user_id = me), so it needs no other check. One
// walk of idx_career_resources_assigned over that member's incoming rows,
// capped. Mounted before the '/:id' routes so "assigned-by-me" is never an id.
careerResourcesRouter.get(
  '/assigned-by-me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const menteeId = typeof req.query.menteeId === 'string' ? req.query.menteeId : ''
    if (!menteeId) throw new ApiError(400, 'Which member?')
    const r = await query<CareerResourceRow>(
      `${SELECT} WHERE r.assigned_to = $1 AND r.user_id = $2 AND r.session_id IS NULL
        ORDER BY r.created_at DESC, r.id DESC LIMIT 50`,
      [menteeId, req.user!.sub],
    )
    res.json(r.rows.map(mapCareerResource))
  }),
)

// How many public resources a profile shows at most. A profile is a showcase,
// not an archive, and the cap keeps one prolific member's page from returning
// an unbounded list.
const PUBLIC_RESOURCES_LIMIT = 50

// GET /api/career-resources/of/:userId — the PUBLIC resources on someone
// else's profile. Deliberately separate from GET / (which is "my own
// dashboard": mine plus anything shared with me in a session) — mixing the
// two would mean a stranger's public recommendation showing up unannounced
// in your own resource list. Mounted before the '/:id' routes below, so
// Express does not try to match "of" as an id.
careerResourcesRouter.get(
  '/of/:userId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query<CareerResourceRow>(
      `${SELECT} WHERE r.user_id = $1 AND r.is_public ORDER BY r.created_at DESC LIMIT $2`,
      [req.params.userId, PUBLIC_RESOURCES_LIMIT],
    )
    res.json(r.rows.map(mapPublicCareerResource))
  }),
)

// POST /api/career-resources — save a resource, optionally against a stage
// and/or a session.
careerResourcesRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const d = parsed.data
    const me = req.user!.sub

    // A stage key only means something inside a roadmap, so one without the
    // other is a request that cannot be stored coherently.
    if (d.stepKey && !d.roadmapId) throw new ApiError(400, 'A stage needs its roadmap')
    if (d.sessionId && d.assignedTo) {
      throw new ApiError(400, 'Assign through a session or directly — not both')
    }
    // Both kinds of assignment hand the row to someone else, so the owner's
    // own roadmap stage means nothing to the recipient.
    if ((d.sessionId || d.assignedTo) && d.roadmapId) {
      throw new ApiError(400, 'An assigned resource can’t be filed under your own roadmap stage')
    }
    if (d.roadmapId) await assertOwnStage(d.roadmapId, d.stepKey, me)
    if (d.assignedTo === me) throw new ApiError(400, 'You can’t assign a resource to yourself')

    // A resource handed to someone has to point at something they can open —
    // a title alone gives them nothing to read or act on. Personal saves can
    // still be a bare note.
    if ((d.sessionId || d.assignedTo) && !d.url) {
      throw new ApiError(400, 'Add a link — an assigned resource needs something to open')
    }

    // Who receives it. For session prep that is the session's mentee; for a
    // direct assignment, the member named — and only once a session between
    // the two of them has been agreed.
    let recipient: string | null = null
    let sessionTopic: string | null = null
    let followUp = false
    if (d.sessionId) {
      const status = await assertMentorOfSession(d.sessionId, me)
      // After the session it is a follow-up, which may ask for proof of work.
      // Before or during it is prep: read it, nothing to hand back.
      followUp = status === 'past'
      if (d.requiresSubmission && !followUp) {
        throw new ApiError(400, 'Prep resources don’t take evidence — ask for proof in a follow-up after the session')
      }
      const s = await query<{ mentee_id: string; topic: string }>(
        `SELECT mentee_id, topic FROM mentorship_sessions WHERE id = $1`,
        [d.sessionId],
      )
      recipient = s.rows[0].mentee_id
      sessionTopic = s.rows[0].topic
    } else if (d.assignedTo) {
      await assertMentorOf(d.assignedTo, me)
      recipient = d.assignedTo
    } else if (d.requiresSubmission) {
      throw new ApiError(400, 'Only a resource assigned to someone can ask for a submission')
    }

    const ins = await query<{ id: string }>(
      `INSERT INTO career_resources
         (user_id, title, url, note, kind, status, roadmap_id, step_key, session_id, is_public,
          requires_submission, assigned_to)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'article'), COALESCE($6, 'saved'), $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        me, d.title, d.url ?? null, d.note ?? null, d.kind ?? null, d.status ?? null,
        d.roadmapId ?? null, d.stepKey ?? null, d.sessionId ?? null, d.isPublic,
        // Evidence only on a direct assignment or a post-session follow-up
        // (session prep is refused above).
        (!!d.assignedTo || followUp) && d.requiresSubmission,
        recipient,
      ],
    )

    // An assignment is the one case where someone else gains a row they did
    // not create, so it is the one case worth a notification.
    if (recipient) {
      const who = await query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [me])
      const name = who.rows[0].name
      if (d.sessionId) {
        void pushNotification(
          recipient,
          'mentorship',
          followUp
            ? `${name} added a follow-up from your session "${sessionTopic}": "${d.title}".`
            : `${name} shared "${d.title}" for your session "${sessionTopic}".`,
          me,
          { type: 'session', id: d.sessionId },
        )
      } else {
        void pushNotification(
          recipient,
          'mentorship',
          `${name} assigned you "${d.title}".`,
          me,
          { type: 'resource', id: ins.rows[0].id },
        )
      }
    }

    const full = await query<CareerResourceRow>(`${SELECT} WHERE r.id = $1`, [ins.rows[0].id])
    res.status(201).json(mapCareerResource(full.rows[0]))
  }),
)

// PATCH /api/career-resources/:id — edit my own resource. The stage and
// session links are deliberately not editable: re-pointing a shared row would
// move it between people's lists without either of them acting.
careerResourcesRouter.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const d = parsed.data

    const cur = await query<CareerResourceRow>(
      `SELECT r.*, s.status AS session_status, s.ended_at AS session_ended_at
         FROM career_resources r LEFT JOIN mentorship_sessions s ON s.id = r.session_id
        WHERE r.id = $1 AND r.user_id = $2`,
      [req.params.id, req.user!.sub],
    )
    if (!cur.rowCount) throw new ApiError(404, 'Resource not found (or not yours)')
    const c = cur.rows[0]

    const changesContent = d.title !== undefined || d.url !== undefined || d.note !== undefined || d.kind !== undefined
    const assigned = !!(c.session_id || c.assigned_to)
    if (assigned) {
      // Something handed to a mentee has to stay openable.
      if (d.url === null) throw new ApiError(400, 'An assigned resource needs a link — change it instead of removing it')
      // Once the session is over — or, for a direct assignment, once the
      // mentee has submitted — what was assigned is a record. The owner can
      // still tick it done or make it public — their own bookkeeping — but not
      // rewrite it.
      if (changesContent && isLocked(c)) {
        throw new ApiError(409, 'This has been completed — what was assigned can no longer be changed')
      }
    }

    // The lock is checked again inside the UPDATE ($8): the mentee can submit,
    // or the session finish, between the read above and this write, and the
    // check and the write must be one step or that window rewrites a record.
    // Same rule as isLocked and the DELETE below.
    const upd = await query(
      `UPDATE career_resources r
          SET title = $2, url = $3, note = $4, kind = $5, status = $6, is_public = $7, updated_at = now()
        WHERE r.id = $1
          AND (NOT $8::boolean OR NOT ${LOCKED_SQL})`,
      [
        req.params.id,
        d.title ?? c.title,
        d.url === undefined ? c.url : d.url,
        d.note === undefined ? c.note : d.note,
        d.kind ?? c.kind,
        d.status ?? c.status,
        d.isPublic ?? c.is_public,
        assigned && changesContent,
      ],
    )
    if (!upd.rowCount) throw new ApiError(409, 'This has been completed — what was assigned can no longer be changed')
    const full = await query<CareerResourceRow>(`${SELECT} WHERE r.id = $1`, [req.params.id])
    res.json(mapCareerResource(full.rows[0]))
  }),
)

const submitSchema = z.object({
  url: z.string().trim().url().regex(HTTP_URL, HTTP_URL_MESSAGE).max(2000),
})

// POST /api/career-resources/:id/submit — the MENTEE it was assigned to proves
// they did it, by pasting a link (a doc, a repo, a deployed site).
// Deliberately not the owner: the mentor who assigned it is the one who set
// requires_submission, and the mentee is who has to answer it. "The mentee" is
// assigned_to — set for session follow-ups and direct assignments alike.
careerResourcesRouter.post(
  '/:id/submit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = submitSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const me = req.user!.sub

    const cur = await query<{ requires_submission: boolean; title: string; user_id: string; session_id: string | null }>(
      `SELECT r.requires_submission, r.title, r.user_id, r.session_id
         FROM career_resources r
        WHERE r.id = $1 AND r.assigned_to = $2`,
      [req.params.id, me],
    )
    if (!cur.rowCount) throw new ApiError(404, 'Resource not found (or not assigned to you)')
    if (!cur.rows[0].requires_submission) throw new ApiError(400, 'This resource does not ask for a submission')

    await query(
      `UPDATE career_resources SET submission_url = $2, submission_at = now(), updated_at = now() WHERE id = $1`,
      [req.params.id, parsed.data.url],
    )
    const who = await query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [me])
    void pushNotification(
      cur.rows[0].user_id,
      'mentorship',
      `${who.rows[0].name} submitted "${cur.rows[0].title}".`,
      me,
      // The session when there is one (a 'session' target is resolved as a
      // session id wherever it is opened); a direct assignment points at the
      // resource itself, as the mentor's own 'assignment' — it opens Mentor
      // Space, where they can see what was sent back.
      cur.rows[0].session_id
        ? { type: 'session', id: cur.rows[0].session_id }
        : { type: 'assignment', id: req.params.id },
    )

    const full = await query<CareerResourceRow>(`${SELECT} WHERE r.id = $1`, [req.params.id])
    res.json(mapCareerResource(full.rows[0]))
  }),
)

// DELETE /api/career-resources/:id — only the owner. Someone a resource was
// shared with stops seeing it by leaving the session, not by deleting another
// member's row.
careerResourcesRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    // The lock check, the delete and the share counter are one statement:
    // the session can't finish between checking and deleting, and a saved
    // share's "Saved by N" moves in the same instant its row goes —
    // two statements could leave the counter wrong if the second failed.
    // A finished session's resources, and a direct assignment the mentee has
    // already answered, are a record: deleting would erase the evidence.
    const r = await query<{ id: string }>(
      `WITH del AS (
         DELETE FROM career_resources r
          WHERE r.id = $1 AND r.user_id = $2 AND NOT ${LOCKED_SQL}
          RETURNING r.id, r.share_id),
       unsaved AS (
         UPDATE learning_shares s SET saved_count = GREATEST(s.saved_count - 1, 0)
           FROM del WHERE s.id = del.share_id
         RETURNING s.id)
       SELECT id FROM del`,
      [req.params.id, req.user!.sub],
    )
    if (!r.rowCount) {
      const mine = await query(`SELECT 1 FROM career_resources WHERE id = $1 AND user_id = $2`, [
        req.params.id,
        req.user!.sub,
      ])
      if (!mine.rowCount) throw new ApiError(404, 'Resource not found (or not yours)')
      throw new ApiError(409, 'This has been completed — what was assigned can no longer be removed')
    }
    res.status(204).end()
  }),
)
