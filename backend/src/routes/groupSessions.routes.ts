import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../db/pool.js'
import { requireAuth } from '../auth/middleware.js'
import { ApiError, asyncHandler } from '../http.js'
import { HTTP_URL, HTTP_URL_MESSAGE } from '../validation.js'
import { pushNotification, pushNotificationToAll } from '../notify.js'
import { canHostGroupSessions } from '../subscription.js'
import { recordConfirmedGroupAttendance } from '../sessionStats.js'

export const groupSessionsRouter = Router()

interface GroupSessionRow {
  id: string
  mentor_id: string
  mentor_name: string
  mentor_photo: string | null
  topic: string
  description: string
  domain: string
  scheduled_at: Date
  duration_minutes: number
  capacity: number
  meeting_link: string | null
  pricing_mode: 'free' | 'paid'
  price_per_seat: number
  status: 'scheduled' | 'completed' | 'cancelled'
  visibility: 'public' | 'invite_only'
  attendee_count: number
  joined_by_me: boolean
  invited_by_me: boolean
  confirmed_by_me: boolean
  mentor_confirmed: boolean
}

// `viewerParam` is the `$N` placeholder the caller has reserved for the
// viewer's id in its own params array (not the id itself) — every call site
// binds it as a real parameter, same as the rest of this file's queries,
// rather than splicing the value into the SQL text.
const LIST_SELECT = (viewerParam: string) => `
  SELECT g.id, g.mentor_id, u.name AS mentor_name, u.photo AS mentor_photo,
         g.topic, g.description, g.domain, g.scheduled_at, g.duration_minutes,
         g.capacity, g.pricing_mode, g.price_per_seat, g.status, g.visibility, g.mentor_confirmed,
         -- Only the host and people who actually hold a seat get the joining
         -- link. It used to be selected flat, so GET / handed the link for
         -- every public session to any signed-in member — anyone could walk
         -- straight into the call without joining, which made capacity and
         -- the roster advisory rather than real. Everyone else reads NULL,
         -- which mapGroupSession turns into an absent field.
         CASE
           WHEN g.mentor_id = ${viewerParam}
             OR EXISTS (SELECT 1 FROM group_session_attendees a
                         WHERE a.session_id = g.id AND a.mentee_id = ${viewerParam})
           THEN g.meeting_link
         END AS meeting_link,
         (SELECT count(*)::int FROM group_session_attendees a WHERE a.session_id = g.id) AS attendee_count,
         EXISTS (SELECT 1 FROM group_session_attendees a WHERE a.session_id = g.id AND a.mentee_id = ${viewerParam}) AS joined_by_me,
         EXISTS (SELECT 1 FROM group_session_invites gi WHERE gi.session_id = g.id AND gi.user_id = ${viewerParam}) AS invited_by_me,
         -- Whether this viewer already confirmed attending — without it the
         -- "Confirm attendance" button could never go away.
         EXISTS (SELECT 1 FROM group_session_attendees a
                  WHERE a.session_id = g.id AND a.mentee_id = ${viewerParam} AND a.mentee_confirmed) AS confirmed_by_me
    FROM group_sessions g JOIN users u ON u.id = g.mentor_id`

function mapGroupSession(r: GroupSessionRow) {
  return {
    id: r.id,
    mentorId: r.mentor_id,
    mentorName: r.mentor_name,
    mentorPhoto: r.mentor_photo ?? undefined,
    topic: r.topic,
    description: r.description,
    domain: r.domain,
    scheduledAt: new Date(r.scheduled_at).toISOString(),
    durationMinutes: r.duration_minutes,
    capacity: r.capacity,
    attendeeCount: r.attendee_count,
    seatsLeft: Math.max(0, r.capacity - r.attendee_count),
    meetingLink: r.meeting_link ?? undefined,
    pricingMode: r.pricing_mode,
    pricePerSeat: r.price_per_seat,
    status: r.status,
    visibility: r.visibility,
    joinedByMe: r.joined_by_me,
    invitedByMe: r.invited_by_me,
    confirmedByMe: r.confirmed_by_me,
    mentorConfirmed: r.mentor_confirmed,
  }
}

// Required everywhere a session is created or repeated: without a link nobody
// can get into the call. Web links only (shared rule in validation.ts), capped
// like the 1:1 meeting link.
const meetingLinkField = z.string().trim().min(1, 'Add a meeting link so attendees can join')
  .url(HTTP_URL_MESSAGE).regex(HTTP_URL, HTTP_URL_MESSAGE).max(500)

const createSchema = z.object({
  topic: z.string().trim().min(1).max(140),
  description: z.string().trim().max(1000).optional().default(''),
  // One or more domains/skills, stored comma-separated ("Cloud, AI/ML, Kubernetes").
  domain: z.string().trim().max(200).optional().default(''),
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  durationMinutes: z.number().int().min(15).max(480).optional().default(60),
  capacity: z.number().int().min(2).max(500).optional().default(10),
  meetingLink: meetingLinkField,
  pricingMode: z.enum(['free', 'paid']).optional().default('free'),
  pricePerSeat: z.number().int().min(0).max(1_000_000).optional().default(0),
  // 'public' (default) keeps today's behaviour — open to browse and join.
  // 'invite_only' requires at least one connection id in inviteeIds; anyone
  // else is validated server-side and silently dropped rather than trusted
  // from the client (see the handler).
  visibility: z.enum(['public', 'invite_only']).optional().default('public'),
  inviteeIds: z.array(z.string().trim().min(1)).max(500).optional().default([]),
})

// POST /api/group-sessions — a mentor schedules a session for many mentees
// at once. Gated on the plan's groupSessions flag, not just an active plan —
// mirrors the paid-events gate exactly.
groupSessionsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const isMentor = await query<{ is_mentor: boolean }>(`SELECT is_mentor FROM users WHERE id = $1`, [req.user!.sub])
    if (!isMentor.rows[0]?.is_mentor) throw new ApiError(403, 'Only approved mentors can host group sessions.')

    const allowed = await canHostGroupSessions(req.user!.sub)
    if (!allowed.allowed) throw new ApiError(402, allowed.reason ?? 'A plan is needed to host group sessions.')

    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const g = parsed.data
    const startsAt = new Date(g.scheduledAt)
    if (Number.isNaN(+startsAt)) throw new ApiError(400, 'A valid date/time is required')
    if (+startsAt < Date.now() - 60_000) throw new ApiError(400, 'The session must be in the future')

    // Invitees are never trusted as given — only ids that are actually an
    // accepted connection of this mentor are kept, same rule messages.routes.ts
    // uses to gate a DM. Anyone else in the list is silently dropped rather
    // than erroring the whole request over one stale id.
    let inviteeIds: string[] = []
    if (g.visibility === 'invite_only') {
      if (g.inviteeIds.length === 0) {
        throw new ApiError(400, 'Pick at least one connection to invite.')
      }
      const valid = await query<{ id: string }>(
        `SELECT u.id FROM users u
           JOIN connections c ON c.status = 'accepted'
            AND ((c.requester_id = $1 AND c.addressee_id = u.id) OR (c.requester_id = u.id AND c.addressee_id = $1))
         WHERE u.id = ANY($2)`,
        [req.user!.sub, g.inviteeIds],
      )
      inviteeIds = valid.rows.map((r) => r.id)
      if (inviteeIds.length === 0) {
        throw new ApiError(400, 'None of the people you picked are in your connections.')
      }
      if (g.capacity < inviteeIds.length) {
        throw new ApiError(400, `Capacity must be at least ${inviteeIds.length} to fit everyone invited.`)
      }
    }

    const isPaid = g.pricingMode === 'paid' && g.pricePerSeat > 0
    // The session and its invites are written together or not at all — an
    // invite-only session with nobody invited could never be joined.
    const sessionId = await withTransaction(async (client) => {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO group_sessions
           (mentor_id, topic, description, domain, scheduled_at, duration_minutes, capacity,
            meeting_link, pricing_mode, price_per_seat, visibility)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          req.user!.sub, g.topic, g.description, g.domain, startsAt, g.durationMinutes, g.capacity,
          g.meetingLink || null, isPaid ? 'paid' : 'free', isPaid ? g.pricePerSeat : 0, g.visibility,
        ],
      )
      if (g.visibility === 'invite_only') {
        await client.query(
          `INSERT INTO group_session_invites (session_id, user_id)
           SELECT $1, x FROM unnest($2::text[]) AS x`,
          [ins.rows[0].id, inviteeIds],
        )
      }
      return ins.rows[0].id
    })

    const mentor = await query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [req.user!.sub])

    if (g.visibility === 'invite_only') {
      // Notify only the people actually invited — never the whole network,
      // which is the entire point of choosing invite_only over public.
      for (const id of inviteeIds) {
        void pushNotification(
          id, 'mentorship',
          `${mentor.rows[0].name} invited you to a group session: "${g.topic}".`,
          req.user!.sub,
        )
      }
    } else {
      void pushNotificationToAll(
        'mentorship',
        `${mentor.rows[0].name} is hosting a group session: "${g.topic}" — ${g.capacity} seats available.`,
        req.user!.sub,
      )
    }

    const full = await query<GroupSessionRow>(`${LIST_SELECT('$2')} WHERE g.id = $1`, [sessionId, req.user!.sub])
    res.status(201).json(mapGroupSession(full.rows[0]))
  }),
)

// GET /api/group-sessions — open sessions any member can browse and join,
// soonest first. Cancelled ones are never listed; completed ones drop off
// once they're in the past (still visible via /mine for the mentor).
// invite_only sessions never appear here regardless of who is asking — that
// is the one thing "invite only" has to actually mean.
groupSessionsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query<GroupSessionRow>(
      `${LIST_SELECT('$1')}
        WHERE g.status = 'scheduled' AND g.scheduled_at > now() AND g.visibility = 'public'
        ORDER BY g.scheduled_at`,
      [req.user!.sub],
    )
    res.json(rows.rows.map(mapGroupSession))
  }),
)

// GET /api/group-sessions/mine — sessions I host, have joined, or have been
// invited to (invite_only, not yet joined — that last case is how an invitee
// finds a session that deliberately isn't in the public list above).
groupSessionsRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query<GroupSessionRow>(
      `${LIST_SELECT('$1')}
        WHERE g.mentor_id = $1
           OR EXISTS (SELECT 1 FROM group_session_attendees a WHERE a.session_id = g.id AND a.mentee_id = $1)
           OR EXISTS (SELECT 1 FROM group_session_invites gi WHERE gi.session_id = g.id AND gi.user_id = $1)
        ORDER BY g.scheduled_at DESC`,
      [req.user!.sub],
    )
    res.json(rows.rows.map(mapGroupSession))
  }),
)

// GET /api/group-sessions/:id/attendees — the mentor's roster, for
// completing the session and seeing who to expect.
groupSessionsRouter.get(
  '/:id/attendees',
  requireAuth,
  asyncHandler(async (req, res) => {
    const owns = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM group_sessions WHERE id = $1 AND mentor_id = $2`,
      [req.params.id, req.user!.sub],
    )
    if (!owns.rows[0].n) throw new ApiError(404, 'Group session not found (or you are not its host)')

    const rows = await query<{
      mentee_id: string; name: string; photo: string | null; designation: string; company: string
      joined_at: Date; mentee_confirmed: boolean
    }>(
      // designation/company travel with the roster: names repeat across an
      // alumni network, and the host needs to tell two of the same apart.
      `SELECT a.mentee_id, u.name, u.photo, u.designation, u.company, a.joined_at, a.mentee_confirmed
         FROM group_session_attendees a JOIN users u ON u.id = a.mentee_id
        WHERE a.session_id = $1 ORDER BY a.joined_at`,
      [req.params.id],
    )
    res.json(
      rows.rows.map((r) => ({
        id: r.mentee_id,
        name: r.name,
        photo: r.photo ?? undefined,
        designation: r.designation,
        company: r.company,
        joinedAt: r.joined_at.toISOString(),
        confirmed: r.mentee_confirmed,
      })),
    )
  }),
)

// POST /api/group-sessions/:id/join — reserve a seat. Capacity is enforced
// under a row lock, the same pattern event RSVP capacity already uses, so
// two members joining the last seat at once can't both succeed.
groupSessionsRouter.post(
  '/:id/join',
  requireAuth,
  asyncHandler(async (req, res) => {
    await withTransaction(async (client) => {
      const g = await client.query<{ mentor_id: string; capacity: number; status: string; topic: string; visibility: 'public' | 'invite_only' }>(
        `SELECT mentor_id, capacity, status, topic, visibility FROM group_sessions WHERE id = $1 FOR UPDATE`,
        [req.params.id],
      )
      if (!g.rowCount) throw new ApiError(404, 'Group session not found')
      const session = g.rows[0]
      if (session.mentor_id === req.user!.sub) throw new ApiError(400, 'You are hosting this session')
      if (session.status !== 'scheduled') throw new ApiError(400, 'This session is no longer open')

      if (session.visibility === 'invite_only') {
        const invited = await client.query(
          `SELECT 1 FROM group_session_invites WHERE session_id = $1 AND user_id = $2`,
          [req.params.id, req.user!.sub],
        )
        if (!invited.rowCount) throw new ApiError(403, 'This session is invite-only.')
      }

      const count = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM group_session_attendees WHERE session_id = $1`,
        [req.params.id],
      )
      if (count.rows[0].n >= session.capacity) throw new ApiError(409, 'This session is full')

      const dup = await client.query(
        `SELECT 1 FROM group_session_attendees WHERE session_id = $1 AND mentee_id = $2`,
        [req.params.id, req.user!.sub],
      )
      if (dup.rowCount) throw new ApiError(409, 'You already joined this session')

      await client.query(
        `INSERT INTO group_session_attendees (session_id, mentee_id) VALUES ($1, $2)`,
        [req.params.id, req.user!.sub],
      )

      const me = await client.query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [req.user!.sub])
      void pushNotification(
        session.mentor_id, 'mentorship',
        `${me.rows[0].name} joined your group session "${session.topic}".`, req.user!.sub,
      )
    })

    const full = await query<GroupSessionRow>(`${LIST_SELECT('$2')} WHERE g.id = $1`, [req.params.id, req.user!.sub])
    res.json(mapGroupSession(full.rows[0]))
  }),
)

// POST /api/group-sessions/:id/leave — give up a seat before it happens.
groupSessionsRouter.post(
  '/:id/leave',
  requireAuth,
  asyncHandler(async (req, res) => {
    // A completed session is a record, not a booking. Leaving one deleted the
    // attendee row outright, which took the mentee's own confirmation with it
    // and silently decremented the mentor's confirmed-attendee count — an
    // attendee could quietly rewrite someone else's history after the fact.
    // Only 'completed' is refused: leaving a cancelled session is pointless
    // but harmless, and blocking that too would take away an ability for no
    // reason.
    // Read the status and delete in ONE transaction with the session row
    // locked, the same pattern /join and /complete already use. Checking in a
    // separate statement leaves a gap: a leave arriving just as the host marks
    // the session completed passes the check against the old status and then
    // deletes attendance from a now-completed session — exactly the record
    // loss this guard exists to prevent. FOR UPDATE makes the two requests
    // queue instead of interleaving.
    await withTransaction(async (client) => {
      const g = await client.query<{ status: string }>(
        `SELECT status FROM group_sessions WHERE id = $1 FOR UPDATE`,
        [req.params.id],
      )
      if (!g.rowCount) throw new ApiError(404, 'Group session not found')
      if (g.rows[0].status === 'completed') {
        throw new ApiError(400, 'This session has already happened — it stays on your record.')
      }

      const del = await client.query(
        `DELETE FROM group_session_attendees WHERE session_id = $1 AND mentee_id = $2`,
        [req.params.id, req.user!.sub],
      )
      if (!del.rowCount) throw new ApiError(404, "You haven't joined this session")
    })
    const full = await query<GroupSessionRow>(`${LIST_SELECT('$2')} WHERE g.id = $1`, [req.params.id, req.user!.sub])
    res.json(full.rowCount ? mapGroupSession(full.rows[0]) : { id: req.params.id })
  }),
)

const completeSchema = z.object({
  durationMinutes: z.number().int().min(1).max(600).optional(),
  domain: z.string().trim().max(60).optional(),
})

// POST /api/group-sessions/:id/complete — mentor marks the session done.
// Same two-sided confirmation model as 1:1 sessions, just fanned out over
// every attendee instead of one mentee.
groupSessionsRouter.post(
  '/:id/complete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = completeSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)

    // FOR UPDATE, same as /join: without it, a double-click or a retried
    // request can both read status = 'scheduled' before either UPDATE
    // commits, both mark it completed, and both increment
    // sessions_conducted — inflating the mentor's stat and double-notifying
    // every attendee.
    const topic = await withTransaction(async (client) => {
      const g = await client.query<{ mentor_id: string; status: string; topic: string }>(
        `SELECT mentor_id, status, topic FROM group_sessions WHERE id = $1 FOR UPDATE`,
        [req.params.id],
      )
      if (!g.rowCount || g.rows[0].mentor_id !== req.user!.sub) {
        throw new ApiError(404, 'Group session not found (or you are not its host)')
      }
      if (g.rows[0].status !== 'scheduled') throw new ApiError(400, `Session is already ${g.rows[0].status}`)

      await client.query(
        `UPDATE group_sessions SET status = 'completed', mentor_confirmed = TRUE,
                duration_minutes = COALESCE($2, duration_minutes),
                domain = CASE WHEN domain = '' AND $3 <> '' THEN $3 ELSE domain END
          WHERE id = $1`,
        [req.params.id, parsed.data.durationMinutes ?? null, parsed.data.domain ?? ''],
      )
      await client.query(
        `UPDATE users SET sessions_conducted = COALESCE(sessions_conducted, 0) + 1 WHERE id = $1`,
        [req.user!.sub],
      )
      return g.rows[0].topic
    })

    const attendees = await query<{ mentee_id: string }>(
      `SELECT mentee_id FROM group_session_attendees WHERE session_id = $1`,
      [req.params.id],
    )
    for (const a of attendees.rows) {
      void pushNotification(
        a.mentee_id, 'mentorship',
        `"${topic}" is marked completed — confirm it to add it to your learning record. 🎓`,
        req.user!.sub,
      )
    }

    const full = await query<GroupSessionRow>(`${LIST_SELECT('$2')} WHERE g.id = $1`, [req.params.id, req.user!.sub])
    res.json(mapGroupSession(full.rows[0]))
  }),
)

// POST /api/group-sessions/:id/confirm — an attendee confirms they were
// there. Only once both this and the mentor's completion exist does the
// seat count toward either profile's stats/badges.
groupSessionsRouter.post(
  '/:id/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const g = await query<{ status: string }>(`SELECT status FROM group_sessions WHERE id = $1`, [req.params.id])
    if (!g.rowCount) throw new ApiError(404, 'Group session not found')
    if (g.rows[0].status !== 'completed') {
      throw new ApiError(400, 'You can confirm once the mentor has marked the session completed')
    }
    const upd = await query(
      `UPDATE group_session_attendees SET mentee_confirmed = TRUE, confirmed_at = COALESCE(confirmed_at, now())
        WHERE session_id = $1 AND mentee_id = $2`,
      [req.params.id, req.user!.sub],
    )
    if (!upd.rowCount) throw new ApiError(404, "You didn't attend this session")
    await recordConfirmedGroupAttendance(req.params.id, req.user!.sub)

    const full = await query<GroupSessionRow>(`${LIST_SELECT('$2')} WHERE g.id = $1`, [req.params.id, req.user!.sub])
    res.json(mapGroupSession(full.rows[0]))
  }),
)

// POST /api/group-sessions/:id/cancel — mentor cancels before it happens.
groupSessionsRouter.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const g = await query<{ mentor_id: string; topic: string; status: string }>(
      `SELECT mentor_id, topic, status FROM group_sessions WHERE id = $1`,
      [req.params.id],
    )
    if (!g.rowCount || g.rows[0].mentor_id !== req.user!.sub) {
      throw new ApiError(404, 'Group session not found (or you are not its host)')
    }
    if (g.rows[0].status !== 'scheduled') throw new ApiError(400, `Session is already ${g.rows[0].status}`)

    await query(`UPDATE group_sessions SET status = 'cancelled' WHERE id = $1`, [req.params.id])
    const attendees = await query<{ mentee_id: string }>(
      `SELECT mentee_id FROM group_session_attendees WHERE session_id = $1`,
      [req.params.id],
    )
    for (const a of attendees.rows) {
      void pushNotification(
        a.mentee_id, 'mentorship',
        `"${g.rows[0].topic}" was cancelled by the host.`, req.user!.sub,
      )
    }
    res.json({ ok: true })
  }),
)

// Same limits as creating one, but every field is REQUIRED — no defaults — so
// an edit that leaves a field out is rejected instead of silently resetting it.
// Pricing and visibility are deliberately not editable: people may already
// have joined (or paid) on those terms.
const editSchema = z.object({
  topic: z.string().trim().min(1).max(140),
  description: z.string().trim().max(1000),
  domain: z.string().trim().max(200),
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  durationMinutes: z.number().int().min(15).max(480),
  capacity: z.number().int().min(2).max(500),
  meetingLink: meetingLinkField,
})

// POST /api/group-sessions/:id/edit — the host fixes the details of a
// scheduled session (topic, time, length, capacity, link). Before this, a
// typo or a time change meant cancelling and starting over.
groupSessionsRouter.post(
  '/:id/edit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = editSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const d = parsed.data
    const startsAt = new Date(d.scheduledAt)
    if (Number.isNaN(+startsAt)) throw new ApiError(400, 'A valid date/time is required')

    const recipients = await withTransaction(async (client) => {
      // Locked like /join, so a join can't land between the capacity check
      // and the update and leave more attendees than seats.
      const g = await client.query<{
        mentor_id: string; status: string; topic: string; description: string; domain: string
        scheduled_at: Date; duration_minutes: number; capacity: number; meeting_link: string | null; visibility: string
      }>(
        `SELECT mentor_id, status, topic, description, domain, scheduled_at, duration_minutes, capacity, meeting_link, visibility
           FROM group_sessions WHERE id = $1 FOR UPDATE`,
        [req.params.id],
      )
      if (!g.rowCount || g.rows[0].mentor_id !== req.user!.sub) {
        throw new ApiError(404, 'Group session not found (or you are not its host)')
      }
      const cur = g.rows[0]
      if (cur.status !== 'scheduled') throw new ApiError(400, `Session is already ${cur.status}`)
      // Only a NEW time must be in the future: a session already under way (or
      // one created before links were required) must stay editable — e.g. to
      // add the meeting link it's missing.
      const timeChanged = Math.abs(+startsAt - +new Date(cur.scheduled_at)) >= 60_000
      if (timeChanged && +startsAt < Date.now() - 60_000) throw new ApiError(400, 'The session must be in the future')
      // Seats already spoken for: everyone who joined, plus — on an invite-only
      // session — everyone still invited (creating one sized capacity to fit
      // them; shrinking below that would lock invitees out of accepting).
      const taken = (await client.query<{ n: number }>(
        cur.visibility === 'invite_only'
          ? `SELECT count(*)::int AS n FROM (
               SELECT mentee_id AS u FROM group_session_attendees WHERE session_id = $1
               UNION
               SELECT user_id FROM group_session_invites WHERE session_id = $1) seats`
          : `SELECT count(*)::int AS n FROM group_session_attendees WHERE session_id = $1`,
        [req.params.id],
      )).rows[0].n
      if (d.capacity < taken) {
        throw new ApiError(400, cur.visibility === 'invite_only'
          ? `${taken} people are joined or invited — capacity can't be lower than that`
          : `${taken} ${taken === 1 ? 'person has' : 'people have'} already joined — capacity can't be lower than that`)
      }
      const changed = timeChanged || d.topic !== cur.topic || d.description !== cur.description || d.domain !== cur.domain
        || d.durationMinutes !== cur.duration_minutes || d.capacity !== cur.capacity || d.meetingLink !== (cur.meeting_link ?? '')
      if (!changed) return []

      await client.query(
        `UPDATE group_sessions
            SET topic = $2, description = $3, domain = $4, scheduled_at = $5,
                duration_minutes = $6, capacity = $7, meeting_link = $8
          WHERE id = $1`,
        [req.params.id, d.topic, d.description, d.domain, timeChanged ? startsAt.toISOString() : cur.scheduled_at,
          d.durationMinutes, d.capacity, d.meetingLink],
      )
      // Everyone it affects: who joined, and who was invited but hasn't answered.
      const people = await client.query<{ user_id: string }>(
        `SELECT mentee_id AS user_id FROM group_session_attendees WHERE session_id = $1
          UNION
         SELECT user_id FROM group_session_invites WHERE session_id = $1`,
        [req.params.id],
      )
      return people.rows.map((p) => p.user_id)
    })

    for (const userId of recipients) {
      void pushNotification(
        userId, 'mentorship',
        `"${d.topic}" was updated by the host — check Group Sessions for the latest time and link.`, req.user!.sub,
      )
    }
    res.json({ ok: true, notified: recipients.length })
  }),
)

const repeatSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  meetingLink: meetingLinkField,
})

// POST /api/group-sessions/:id/repeat — run a past group session again with
// the same people, without retyping topic/description/pricing or rebuilding
// the invite list by hand. The new session is always invite_only, invited to
// exactly who actually attended the source session (not who was merely
// invited, and not a public re-broadcast) — that is "the same group",
// concretely. Attendees are invited, not auto-added: capacity, payment and
// the join flow all still apply the same way they would to any other
// invite_only session.
groupSessionsRouter.post(
  '/:id/repeat',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = repeatSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const startsAt = new Date(parsed.data.scheduledAt)
    if (Number.isNaN(+startsAt)) throw new ApiError(400, 'A valid date/time is required')
    if (+startsAt < Date.now() - 60_000) throw new ApiError(400, 'The session must be in the future')

    const src = await query<{
      topic: string; description: string; domain: string; duration_minutes: number
      capacity: number; pricing_mode: 'free' | 'paid'; price_per_seat: number; status: string
    }>(
      `SELECT topic, description, domain, duration_minutes, capacity, pricing_mode, price_per_seat, status
         FROM group_sessions WHERE id = $1 AND mentor_id = $2`,
      [req.params.id, req.user!.sub],
    )
    if (!src.rowCount) throw new ApiError(404, 'Group session not found (or you are not its host)')
    if (src.rows[0].status === 'scheduled') {
      throw new ApiError(400, "That session hasn't happened yet — complete or cancel it first.")
    }

    const attendees = await query<{ mentee_id: string }>(
      `SELECT mentee_id FROM group_session_attendees WHERE session_id = $1`,
      [req.params.id],
    )
    if (!attendees.rowCount) throw new ApiError(400, 'That session had no attendees to invite again.')

    const allowed = await canHostGroupSessions(req.user!.sub)
    if (!allowed.allowed) throw new ApiError(402, allowed.reason ?? 'A plan is needed to host group sessions.')

    const s = src.rows[0]
    const capacity = Math.max(s.capacity, attendees.rowCount)
    // The new session and its invites are written together or not at all.
    const newId = await withTransaction(async (client) => {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO group_sessions
           (mentor_id, topic, description, domain, scheduled_at, duration_minutes, capacity,
            meeting_link, pricing_mode, price_per_seat, visibility)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'invite_only') RETURNING id`,
        [
          req.user!.sub, s.topic, s.description, s.domain, startsAt, s.duration_minutes,
          capacity, parsed.data.meetingLink || null,
          s.pricing_mode, s.price_per_seat,
        ],
      )
      await client.query(
        `INSERT INTO group_session_invites (session_id, user_id)
         SELECT $1, mentee_id FROM group_session_attendees WHERE session_id = $2`,
        [ins.rows[0].id, req.params.id],
      )
      return ins.rows[0].id
    })

    const mentor = await query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [req.user!.sub])
    for (const a of attendees.rows) {
      void pushNotification(
        a.mentee_id, 'mentorship',
        `${mentor.rows[0].name} scheduled a repeat session with your group: "${s.topic}".`,
        req.user!.sub,
      )
    }

    const full = await query<GroupSessionRow>(`${LIST_SELECT('$2')} WHERE g.id = $1`, [newId, req.user!.sub])
    res.status(201).json(mapGroupSession(full.rows[0]))
  }),
)
