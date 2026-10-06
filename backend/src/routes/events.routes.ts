import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../db/pool.js'
import { requireAdmin, requireAuth } from '../auth/middleware.js'
import { canHostPaidEvents } from '../subscription.js'
import { ApiError, asyncHandler } from '../http.js'
import { pushNotification, pushNotificationToAll } from '../notify.js'
import { sendEmail } from '../email.js'
import { mapComment, type CommentRow } from '../mappers.js'

export const eventsRouter = Router()

/** How long an event is assumed to run. Events carry a start time but no end
 *  time, so both sides assume an hour — keep in step with EVENT_DURATION_MS
 *  in frontend/src/pages/events/EventPhase.tsx, which decides when the UI
 *  flips an event from "Live now" to "Ended". */
const EVENT_DURATION_MS = 60 * 60 * 1000

interface Speaker {
  name: string
  bio: string
}

interface EventRow {
  id: string
  creator_id: string
  title: string
  description: string
  location: string
  meeting_link: string | null
  starts_at: Date
  status: 'pending' | 'approved' | 'rejected'
  is_paid: boolean
  price: number
  capacity: number | null
  speakers: Speaker[]
  rsvp_count: number
  waitlist_count: number
  rsvped_by_me: boolean
  waitlisted_by_me: boolean
  avg_rating: string | number | null
  feedback_count: number
  feedback_by_me: boolean
  attendee_ids: string[]
}

const EVENT_SELECT = `
  SELECT e.id, e.creator_id, e.title, e.description, e.location, e.meeting_link, e.starts_at,
         e.status, e.is_paid, e.price, e.capacity, e.speakers,
         (SELECT count(*)::int FROM event_rsvps r WHERE r.event_id = e.id AND NOT r.waitlisted) AS rsvp_count,
         (SELECT count(*)::int FROM event_rsvps r WHERE r.event_id = e.id AND r.waitlisted) AS waitlist_count,
         EXISTS (SELECT 1 FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = $1 AND NOT r.waitlisted) AS rsvped_by_me,
         EXISTS (SELECT 1 FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = $1 AND r.waitlisted) AS waitlisted_by_me,
         (SELECT round(avg(f.rating), 1) FROM event_feedback f WHERE f.event_id = e.id) AS avg_rating,
         (SELECT count(*)::int FROM event_feedback f WHERE f.event_id = e.id) AS feedback_count,
         EXISTS (SELECT 1 FROM event_feedback f WHERE f.event_id = e.id AND f.user_id = $1) AS feedback_by_me,
         COALESCE((
           SELECT array_agg(r.user_id ORDER BY r.created_at) FROM (
             SELECT user_id, created_at FROM event_rsvps WHERE event_id = e.id AND NOT waitlisted
             ORDER BY created_at LIMIT 6
           ) r
         ), '{}') AS attendee_ids
  FROM events e`

function mapEvent(r: EventRow) {
  return {
    id: r.id,
    creatorId: r.creator_id,
    title: r.title,
    description: r.description,
    location: r.location,
    meetingLink: r.meeting_link ?? undefined,
    startsAt: new Date(r.starts_at).toISOString(),
    status: r.status,
    isPaid: r.is_paid,
    price: r.price,
    capacity: r.capacity ?? undefined,
    speakers: r.speakers ?? [],
    rsvpCount: r.rsvp_count,
    waitlistCount: r.waitlist_count,
    rsvpedByMe: r.rsvped_by_me,
    waitlistedByMe: r.waitlisted_by_me,
    avgRating: r.avg_rating != null ? Number(r.avg_rating) : undefined,
    feedbackCount: r.feedback_count,
    feedbackByMe: r.feedback_by_me,
    attendeeIds: r.attendee_ids ?? [],
  }
}

// GET /api/events — approved events for everyone, plus the caller's own
// pending/rejected ones (so hosts can track a submission). Soonest upcoming
// first, past ones trail.
eventsRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query<EventRow>(
      `${EVENT_SELECT}
       WHERE e.status = 'approved' OR e.creator_id = $1
       ORDER BY (e.starts_at < now()), e.starts_at`,
      [req.user!.sub],
    )
    res.json(result.rows.map(mapEvent))
  }),
)

// GET /api/events/pending — admin review queue with host names.
eventsRouter.get(
  '/pending',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await query<EventRow & { creator_name: string }>(
      `${EVENT_SELECT.replace('FROM events e', ', u.name AS creator_name FROM events e LEFT JOIN users u ON u.id = e.creator_id')}
       WHERE e.status = 'pending' ORDER BY e.created_at`,
      [req.user!.sub],
    )
    res.json(result.rows.map((r) => ({ ...mapEvent(r), creatorName: r.creator_name ?? 'Unknown' })))
  }),
)

const createSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(140),
  description: z.string().trim().max(2000).default(''),
  location: z.string().trim().max(200).default(''),
  meetingLink: z.string().trim().url().optional().or(z.literal('')),
  startsAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  isPaid: z.boolean().default(false),
  price: z.number().int().min(0).max(1_000_000).default(0),
  // Max confirmed RSVPs; omit/undefined = unlimited. Extra RSVPs waitlist.
  capacity: z.number().int().min(1).max(100_000).optional(),
  // Shown in the event's quick-view drawer.
  speakers: z
    .array(z.object({ name: z.string().trim().min(1).max(120), bio: z.string().trim().max(500).default('') }))
    .max(10)
    .default([]),
})

// POST /api/events — request an event. Members' events await admin acceptance
// ('pending') and stay private until then; admin-created ones go live at once.
// The creator auto-RSVPs. The whole-network heads-up fires only once approved.
eventsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const e = parsed.data
    const startsAt = new Date(e.startsAt)
    if (Number.isNaN(+startsAt)) throw new ApiError(400, 'valid start date/time is required')
    if (+startsAt < Date.now() - 60_000) throw new ApiError(400, 'The event must be in the future')
    // A paid event needs a positive price; a free one is always ₹0.
    const isPaid = e.isPaid && e.price > 0
    const price = isPaid ? e.price : 0

    const me = req.user!.sub
    // Charging for an event is monetising through the platform, so it needs
    // a plan — the same rule as accepting a paid mentorship session. Free
    // community events stay open to every member, which is why this checks
    // isPaid rather than gating event creation outright.
    // 402 so the client can open the plans instead of showing an error.
    if (isPaid && !req.user!.isAdmin) {
      const allowed = await canHostPaidEvents(me)
      if (!allowed.allowed) throw new ApiError(402, allowed.reason ?? 'A plan is needed to charge for an event.')
    }
    const status = req.user!.isAdmin ? 'approved' : 'pending'
    const inserted = await query<{ id: string }>(
      `INSERT INTO events (creator_id, title, description, location, meeting_link, starts_at, status, is_paid, price, capacity, speakers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        me, e.title, e.description, e.location, e.meetingLink || null, startsAt, status, isPaid, price,
        e.capacity ?? null, JSON.stringify(e.speakers),
      ],
    )
    await query(`INSERT INTO event_rsvps (event_id, user_id) VALUES ($1, $2)`, [inserted.rows[0].id, me])

    const creator = await query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [me])
    if (status === 'approved') {
      const when = startsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      void pushNotificationToAll(
        'event',
        `${creator.rows[0].name} is hosting "${e.title}" on ${when} — RSVP on the Events page.`,
        me,
        { type: 'event', id: inserted.rows[0].id },
      )
    } else {
      // Ask the admins to review a member-created event.
      const admins = await query<{ id: string }>(`SELECT id FROM users WHERE is_admin`)
      for (const a of admins.rows) {
        void pushNotification(
          a.id,
          'event',
          `${creator.rows[0].name} submitted an event for review: "${e.title}".`,
          me,
          { type: 'event', id: inserted.rows[0].id },
        )
      }
    }

    const full = await query<EventRow>(`${EVENT_SELECT} WHERE e.id = $2`, [me, inserted.rows[0].id])
    res.status(201).json(mapEvent(full.rows[0]))
  }),
)

// POST /api/events/:id/approve — admin accepts a pending event. The whole
// network is notified (the heads-up that was held back at submission time).
eventsRouter.post(
  '/:id/approve',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const upd = await query<{ creator_id: string; title: string; starts_at: Date }>(
      `UPDATE events SET status = 'approved' WHERE id = $1 AND status = 'pending'
       RETURNING creator_id, title, starts_at`,
      [req.params.id],
    )
    if (!upd.rowCount) throw new ApiError(404, 'No pending event with this id')
    const { creator_id, title, starts_at } = upd.rows[0]
    const creator = await query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [creator_id])
    const when = new Date(starts_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    void pushNotificationToAll(
      'event',
      `${creator.rows[0]?.name ?? 'A member'} is hosting "${title}" on ${when} — RSVP on the Events page.`,
      creator_id,
      { type: 'event', id: req.params.id },
    )
    void pushNotification(creator_id, 'event', `Your event "${title}" was approved and is now live! 🎉`, req.user!.sub, { type: 'event', id: req.params.id })
    res.json({ ok: true })
  }),
)

// POST /api/events/:id/reject — admin declines a pending event.
eventsRouter.post(
  '/:id/reject',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const upd = await query<{ creator_id: string; title: string }>(
      `UPDATE events SET status = 'rejected' WHERE id = $1 AND status = 'pending'
       RETURNING creator_id, title`,
      [req.params.id],
    )
    if (!upd.rowCount) throw new ApiError(404, 'No pending event with this id')
    const { creator_id, title } = upd.rows[0]
    void pushNotification(
      creator_id,
      'event',
      `Your event "${title}" was declined. Reach out to the Rooman team for details.`,
      req.user!.sub,
      { type: 'event', id: req.params.id },
    )
    res.json({ ok: true })
  }),
)

// POST /api/events/:id/rsvp — I'm going (idempotent). Once capacity is full,
// new RSVPs land on the waitlist instead. DELETE — changed my mind.
eventsRouter.post(
  '/:id/rsvp',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    // Lock the event row for the whole check+insert so two concurrent RSVPs
    // near capacity can't both read the same "confirmed count" and both slip
    // in as confirmed — the second transaction blocks until the first commits.
    const joined = await withTransaction(async (client) => {
      const ev = await client.query<{
        creator_id: string; title: string; capacity: number | null
        status: string; starts_at: Date
      }>(
        `SELECT creator_id, title, capacity, status, starts_at FROM events WHERE id = $1 FOR UPDATE`,
        [req.params.id],
      )
      if (!ev.rowCount) throw new ApiError(404, 'Event not found')

      // The listing hides anything not approved; the write path has to agree,
      // or a shared id lets someone RSVP to an event still awaiting review
      // (or already rejected) and sit on a roster that should not exist.
      if (ev.rows[0].status !== 'approved') {
        throw new ApiError(400, 'This event is not open for RSVPs yet.')
      }
      // Signing up after the fact would be self-issued proof of attending
      // something you did not: the attendance certificate is generated from
      // this row alone, so an RSVP added once the event is over would mint a
      // valid certificate for someone who was never there.
      if (Date.now() >= +new Date(ev.rows[0].starts_at) + EVENT_DURATION_MS) {
        throw new ApiError(400, 'This event has already ended.')
      }

      const already = await client.query(`SELECT 1 FROM event_rsvps WHERE event_id = $1 AND user_id = $2`, [
        req.params.id,
        me,
      ])
      if (already.rowCount) return null

      const { capacity, creator_id, title } = ev.rows[0]
      let waitlisted = false
      if (capacity != null) {
        const confirmed = await client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM event_rsvps WHERE event_id = $1 AND NOT waitlisted`,
          [req.params.id],
        )
        waitlisted = confirmed.rows[0].count >= capacity
      }
      await client.query(`INSERT INTO event_rsvps (event_id, user_id, waitlisted) VALUES ($1, $2, $3)`, [
        req.params.id,
        me,
        waitlisted,
      ])
      return { creator_id, title, waitlisted }
    })

    if (joined && joined.creator_id !== me) {
      const who = await query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [me])
      void pushNotification(
        joined.creator_id,
        'event',
        joined.waitlisted
          ? `${who.rows[0].name} joined the waitlist for your event "${joined.title}".`
          : `${who.rows[0].name} is attending your event "${joined.title}".`,
        me,
        { type: 'event', id: req.params.id },
      )
    }
    const full = await query<EventRow>(`${EVENT_SELECT} WHERE e.id = $2`, [me, req.params.id])
    res.json(mapEvent(full.rows[0]))
  }),
)

eventsRouter.delete(
  '/:id/rsvp',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    // Same per-event lock as the RSVP route — without it, two people cancelling
    // at once can both pick the same longest-waiting waitlister and both
    // "promote" them, double-notifying while under-promoting everyone else.
    const promoted = await withTransaction(async (client) => {
      const evLock = await client.query(`SELECT id FROM events WHERE id = $1 FOR UPDATE`, [req.params.id])
      if (!evLock.rowCount) throw new ApiError(404, 'Event not found')

      const del = await client.query<{ waitlisted: boolean }>(
        `DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2 RETURNING waitlisted`,
        [req.params.id, me],
      )
      if (!del.rowCount || del.rows[0].waitlisted) return null

      // A confirmed spot freed up — promote whoever has waited longest.
      const promo = await client.query<{ user_id: string; title: string }>(
        `UPDATE event_rsvps SET waitlisted = FALSE
         WHERE event_id = $1 AND user_id = (
           SELECT user_id FROM event_rsvps WHERE event_id = $1 AND waitlisted ORDER BY created_at LIMIT 1
         )
         RETURNING user_id, (SELECT title FROM events WHERE id = $1) AS title`,
        [req.params.id],
      )
      return promo.rowCount ? promo.rows[0] : null
    })

    if (promoted) {
      void pushNotification(
        promoted.user_id,
        'event',
        `A spot opened up — you're off the waitlist and confirmed for "${promoted.title}"!`,
        undefined,
        { type: 'event', id: req.params.id },
      )
    }
    const full = await query<EventRow>(`${EVENT_SELECT} WHERE e.id = $2`, [me, req.params.id])
    if (!full.rowCount) throw new ApiError(404, 'Event not found')
    res.json(mapEvent(full.rows[0]))
  }),
)

// DELETE /api/events/:id — cancel. Creator or admin only; attendees are told.
eventsRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ev = await query<{ creator_id: string; title: string }>(
      `SELECT creator_id, title FROM events WHERE id = $1`,
      [req.params.id],
    )
    if (!ev.rowCount) throw new ApiError(404, 'Event not found')
    if (ev.rows[0].creator_id !== req.user!.sub && !req.user!.isAdmin) {
      throw new ApiError(403, 'Only the host can cancel this event')
    }
    const attendees = await query<{ user_id: string }>(
      `SELECT user_id FROM event_rsvps WHERE event_id = $1 AND user_id <> $2`,
      [req.params.id, req.user!.sub],
    )
    await query(`DELETE FROM events WHERE id = $1`, [req.params.id])
    for (const a of attendees.rows) {
      void pushNotification(a.user_id, 'event', `The event "${ev.rows[0].title}" was cancelled.`, req.user!.sub, { type: 'event', id: req.params.id })
    }
    res.json({ ok: true })
  }),
)

// GET /api/events/:id/comments — the event's discussion thread.
eventsRouter.get(
  '/:id/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query<CommentRow>(
      `SELECT id, author_id, text, created_at FROM event_comments WHERE event_id = $1 ORDER BY created_at`,
      [req.params.id],
    )
    res.json(result.rows.map(mapComment))
  }),
)

const eventCommentSchema = z.object({ text: z.string().trim().min(1, 'comment text is required').max(2000) })

// POST /api/events/:id/comments — ask a question or leave a note on the event.
eventsRouter.post(
  '/:id/comments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ev = await query<{ creator_id: string; title: string }>(
      `SELECT creator_id, title FROM events WHERE id = $1`,
      [req.params.id],
    )
    if (!ev.rowCount) throw new ApiError(404, 'Event not found')
    const parsed = eventCommentSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)

    const result = await query<CommentRow>(
      `INSERT INTO event_comments (event_id, author_id, text) VALUES ($1, $2, $3)
       RETURNING id, author_id, text, created_at`,
      [req.params.id, req.user!.sub, parsed.data.text],
    )
    if (ev.rows[0].creator_id !== req.user!.sub) {
      const who = await query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [req.user!.sub])
      void pushNotification(
        ev.rows[0].creator_id,
        'event',
        `${who.rows[0].name} commented on your event "${ev.rows[0].title}".`,
        req.user!.sub,
        { type: 'event', id: req.params.id },
      )
    }
    res.status(201).json(mapComment(result.rows[0]))
  }),
)

const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).default(''),
})

// POST /api/events/:id/feedback — rate the event (upsert). Confirmed
// attendees only, and only once the event has started.
eventsRouter.post(
  '/:id/feedback',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const ev = await query<{ starts_at: Date }>(`SELECT starts_at FROM events WHERE id = $1`, [req.params.id])
    if (!ev.rowCount) throw new ApiError(404, 'Event not found')
    if (+new Date(ev.rows[0].starts_at) > Date.now()) {
      throw new ApiError(400, 'You can only leave feedback once the event has started.')
    }
    const attended = await query(
      `SELECT 1 FROM event_rsvps WHERE event_id = $1 AND user_id = $2 AND NOT waitlisted`,
      [req.params.id, me],
    )
    if (!attended.rowCount) throw new ApiError(403, 'Only confirmed attendees can leave feedback')

    const parsed = feedbackSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)

    await query(
      `INSERT INTO event_feedback (event_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id, user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = now()`,
      [req.params.id, me, parsed.data.rating, parsed.data.comment],
    )
    const full = await query<EventRow>(`${EVENT_SELECT} WHERE e.id = $2`, [me, req.params.id])
    res.json(mapEvent(full.rows[0]))
  }),
)

// GET /api/events/:id/feedback — full ratings + comments. Host/admin only.
eventsRouter.get(
  '/:id/feedback',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ev = await query<{ creator_id: string }>(`SELECT creator_id FROM events WHERE id = $1`, [req.params.id])
    if (!ev.rowCount) throw new ApiError(404, 'Event not found')
    if (ev.rows[0].creator_id !== req.user!.sub && !req.user!.isAdmin) {
      throw new ApiError(403, 'Only the host or an admin can view feedback')
    }
    const result = await query<{
      user_id: string
      name: string
      photo: string | null
      rating: number
      comment: string
      created_at: Date
    }>(
      `SELECT f.user_id, u.name, u.photo, f.rating, f.comment, f.created_at
       FROM event_feedback f JOIN users u ON u.id = f.user_id
       WHERE f.event_id = $1 ORDER BY f.created_at DESC`,
      [req.params.id],
    )
    res.json(
      result.rows.map((r) => ({
        userId: r.user_id,
        name: r.name,
        photo: r.photo ?? undefined,
        rating: r.rating,
        comment: r.comment,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    )
  }),
)

// GET /api/events/:id/certificate — a printable certificate of attendance.
// Confirmed attendees only, and only after the event has taken place.
eventsRouter.get(
  '/:id/certificate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const ev = await query<{ title: string; starts_at: Date }>(
      `SELECT title, starts_at FROM events WHERE id = $1`,
      [req.params.id],
    )
    if (!ev.rowCount) throw new ApiError(404, 'Event not found')
    if (+new Date(ev.rows[0].starts_at) > Date.now()) {
      throw new ApiError(400, 'The certificate is available once the event has taken place.')
    }
    const attended = await query(
      `SELECT 1 FROM event_rsvps WHERE event_id = $1 AND user_id = $2 AND NOT waitlisted`,
      [req.params.id, me],
    )
    if (!attended.rowCount) throw new ApiError(403, 'Only confirmed attendees can download a certificate')

    const who = await query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [me])
    const { title, starts_at } = ev.rows[0]
    const when = new Date(starts_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    const certId = `RC-${req.params.id.slice(0, 8)}-${me.slice(0, 6)}`.toUpperCase()
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Certificate — ${esc(title)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; background: #f6f7f8; margin: 0; padding: 40px; }
  .cert { max-width: 820px; margin: 0 auto; background: #fff; border: 10px solid #0f5a47; border-radius: 8px; padding: 60px 70px; text-align: center; }
  .brand { color: #0f5a47; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; font-size: 14px; }
  h1 { font-size: 34px; margin: 18px 0 6px; color: #1c1c1c; }
  .sub { color: #878a8c; font-size: 14px; margin-bottom: 36px; }
  .name { font-size: 30px; font-weight: bold; color: #1c1c1c; margin: 18px 0; border-bottom: 2px solid #edeff1; display: inline-block; padding-bottom: 8px; }
  .body-text { font-size: 16px; color: #5c6063; line-height: 1.7; max-width: 560px; margin: 0 auto 30px; }
  .event-title { font-weight: bold; color: #1c1c1c; }
  .meta { display: flex; justify-content: space-between; margin-top: 50px; font-size: 12px; color: #a5a8ab; }
  .print-hint { text-align: center; color: #878a8c; font-size: 13px; margin-bottom: 20px; }
  @media print { body { background: #fff; padding: 0; } .cert { border-width: 6px; } .print-hint { display: none; } }
</style>
</head>
<body>
  <p class="print-hint">Use your browser's Print (Ctrl/Cmd+P) → Save as PDF to keep a copy.</p>
  <div class="cert">
    <div class="brand">Root Connect — Rooman Alumni Network</div>
    <h1>Certificate of Attendance</h1>
    <p class="sub">This is to certify that</p>
    <div class="name">${esc(who.rows[0].name)}</div>
    <p class="body-text">attended <span class="event-title">${esc(title)}</span>, held on ${when}, as part of the Rooman Alumni Network.</p>
    <div class="meta">
      <span>Certificate ID: ${certId}</span>
      <span>Issued: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
    </div>
  </div>
</body>
</html>`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  }),
)

// GET /api/events/:id/attendees — who's going.
eventsRouter.get(
  '/:id/attendees',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query<{ id: string; name: string; designation: string; photo: string | null; waitlisted: boolean }>(
      `SELECT u.id, u.name, u.designation, u.photo, r.waitlisted
       FROM event_rsvps r JOIN users u ON u.id = r.user_id
       WHERE r.event_id = $1 ORDER BY r.waitlisted, r.created_at`,
      [req.params.id],
    )
    res.json(result.rows.map((r) => ({ ...r, photo: r.photo ?? undefined })))
  }),
)

// GET /api/events/:id/ics — downloadable calendar entry.
eventsRouter.get(
  '/:id/ics',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query<{ id: string; title: string; description: string; location: string; meeting_link: string | null; starts_at: Date }>(
      `SELECT id, title, description, location, meeting_link, starts_at FROM events WHERE id = $1`,
      [req.params.id],
    )
    if (!r.rowCount) throw new ApiError(404, 'Event not found')
    const e = r.rows[0]
    const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const start = new Date(e.starts_at)
    const end = new Date(+start + 60 * 60 * 1000) // default 1 hour
    const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Root Connect//Alumni Events//EN',
      'BEGIN:VEVENT',
      `UID:rooconnect-event-${e.id}`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(e.title)}`,
      e.location ? `LOCATION:${esc(e.location)}` : '',
      `DESCRIPTION:${esc(e.description + (e.meeting_link ? `\nJoin: ${e.meeting_link}` : ''))}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n')
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="event.ics"`)
    res.send(ics)
  }),
)

/**
 * Every 15 minutes: remind attendees of events starting within the next 24h
 * (notification + email), once per event.
 */
export function startEventReminderScheduler(): void {
  const tick = async () => {
    try {
      const due = await query<{ id: string; title: string; starts_at: Date; location: string; meeting_link: string | null }>(
        `UPDATE events SET reminded = TRUE
         WHERE NOT reminded AND starts_at BETWEEN now() AND now() + interval '24 hours'
         RETURNING id, title, starts_at, location, meeting_link`,
      )
      for (const e of due.rows) {
        const when = new Date(e.starts_at).toLocaleString('en-IN', {
          weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
        })
        const attendees = await query<{ user_id: string; email: string; name: string }>(
          `SELECT r.user_id, u.email, u.name FROM event_rsvps r JOIN users u ON u.id = r.user_id
           WHERE r.event_id = $1`,
          [e.id],
        )
        for (const a of attendees.rows) {
          void pushNotification(a.user_id, 'event', `Reminder: "${e.title}" starts ${when}${e.location ? ` at ${e.location}` : ''}.`, undefined, { type: 'event', id: e.id })
          void sendEmail(
            a.email,
            `Reminder: ${e.title} — ${when}`,
            `Hi ${a.name},\n\nA reminder that "${e.title}" starts ${when}${e.location ? ` at ${e.location}` : ''}.` +
              (e.meeting_link ? `\nJoin: ${e.meeting_link}` : '') +
              `\n\nSee you there!\n— Root Connect`,
          ).catch(() => {})
        }
      }
      if (due.rowCount) console.log(`Event reminders sent for ${due.rowCount} event(s)`)
    } catch (err) {
      console.error('event reminder scheduler failed:', err instanceof Error ? err.message : err)
    }
  }
  setInterval(tick, 15 * 60 * 1000)
  void tick()
}
