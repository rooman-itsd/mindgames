import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db/pool.js'
import { requireAdmin, requireAuth } from '../auth/middleware.js'
import { ApiError, asyncHandler } from '../http.js'
import { config } from '../config.js'
import {
  emailEnabled,
  INVITE_DEFAULT_BODY,
  INVITE_DEFAULT_SUBJECT,
  INVITE_PLACEHOLDERS,
  INVITE_REQUIRED_PLACEHOLDERS,
  INVITE_TEMPLATE_KEY,
  appBaseUrl,
  inviteLinkFor,
  renderTemplate,
} from '../email.js'
import { aiEnabled } from '../ai.js'

// Network-wide overview numbers for the admin console.

export const adminRouter = Router()
adminRouter.use(requireAuth, requireAdmin)

// GET /api/admin/stats — one call, everything the dashboard shows.
adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const one = async (sql: string): Promise<number> =>
      Number((await query<{ n: string }>(sql)).rows[0].n)

    const [
      members,
      membersThisWeek,
      invitees,
      invited,
      posts,
      comments,
      communities,
      sessionsUpcoming,
      sessionsRequested,
      sessionsCompleted,
      startups,
      pendingMentorApps,
      jobApplications,
      messages,
    ] = await Promise.all([
      one(`SELECT count(*) AS n FROM users WHERE NOT is_admin`),
      one(`SELECT count(*) AS n FROM users WHERE NOT is_admin AND created_at > now() - interval '7 days'`),
      one(`SELECT count(*) AS n FROM invitees`),
      one(`SELECT count(*) AS n FROM invitees WHERE invited_at IS NOT NULL`),
      one(`SELECT count(*) AS n FROM posts`),
      one(`SELECT count(*) AS n FROM comments`),
      one(`SELECT count(*) AS n FROM communities`),
      one(`SELECT count(*) AS n FROM mentorship_sessions WHERE status = 'upcoming'`),
      one(`SELECT count(*) AS n FROM mentorship_sessions WHERE status = 'requested'`),
      one(`SELECT count(*) AS n FROM mentorship_sessions WHERE status = 'past'`),
      one(`SELECT count(*) AS n FROM startups`),
      one(`SELECT count(*) AS n FROM mentor_applications WHERE status = 'pending'`),
      one(`SELECT count(*) AS n FROM job_applications`),
      one(`SELECT count(*) AS n FROM messages`),
    ])

    // Latest sign-ups so the admin can see who joined.
    // created_at is when the ACCOUNT was made, which an admin invite does on
    // the member's behalf — so it says nothing about whether they've actually
    // turned up. last_login_at is the fact that answers that.
    const recent = await query<{
      id: string
      name: string
      email: string
      city: string
      created_at: Date
      last_login_at: Date | null
      must_change_password: boolean
      ever_active: boolean
    }>(
      `SELECT id, name, email, city, created_at, last_login_at, must_change_password,
              -- Proof the account has actually been used, for members who
              -- signed in before last_login_at existed. Deliberately does NOT
              -- read updated_at: system writes bump it too (re-issuing an
              -- invite password, a password reset), which made one resend
              -- flip a never-signed-in member to "signed in earlier" and drop
              -- them out of every pending filter. Only member-authored
              -- content counts, none of which can be set while logged out.
              (course <> '' OR bio <> '' OR city <> '' OR photo IS NOT NULL) AS ever_active
         FROM users WHERE NOT is_admin ORDER BY created_at DESC LIMIT 8`,
    )

    res.json({
      members,
      membersThisWeek,
      invitees,
      invited,
      posts,
      comments,
      communities,
      sessions: { upcoming: sessionsUpcoming, requested: sessionsRequested, completed: sessionsCompleted },
      startups,
      pendingMentorApps,
      jobApplications,
      messages,
      integrations: {
        google: !!config.googleClientId,
        smtp: emailEnabled,
        ai: aiEnabled,
      },
      // The base every invite link is built from. Surfaced so a stale value
      // is visible in the console instead of only discovered when a tester
      // reports a dead link: this box's public IP changes on stop/start
      // unless an Elastic IP is attached, and APP_URL does not follow it.
      appUrl: appBaseUrl(),
      recentMembers: recent.rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        city: r.city,
        // Kept as `joinedAt` for compatibility, but it means "account created".
        joinedAt: new Date(r.created_at).toISOString(),
        lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
        passwordChanged: !r.must_change_password,
        // True = has used the account, even if we don't know when.
        everActive: r.ever_active,
      })),
    })
  }),
)


// --- Invite email template -------------------------------------------------
// Admin-editable copy for the credentials email. A row in email_templates is
// an override; no row means the built-in default is in force, so resetting is
// a DELETE rather than writing the default text back (which would then go
// stale the moment the default changed in code).

/** A worked example so the editor's preview shows realistic output. */
const TEMPLATE_SAMPLE = {
  name: 'Asha Rao',
  email: 'asha.rao@example.com',
  password: 'qHB6kbsQCs5m',
  link: inviteLinkFor('asha.rao@example.com'),
}

// GET /api/admin/email-template/invite — current copy plus the defaults, so
// the editor can offer "reset" without a second round trip.
adminRouter.get(
  '/email-template/invite',
  asyncHandler(async (_req, res) => {
    const row = await query<{ subject: string; body: string; updated_at: Date }>(
      `SELECT subject, body, updated_at FROM email_templates WHERE key = $1`,
      [INVITE_TEMPLATE_KEY],
    )
    const custom = row.rows[0]
    res.json({
      subject: custom?.subject ?? INVITE_DEFAULT_SUBJECT,
      body: custom?.body ?? INVITE_DEFAULT_BODY,
      isCustom: !!custom,
      updatedAt: custom ? new Date(custom.updated_at).toISOString() : null,
      defaults: { subject: INVITE_DEFAULT_SUBJECT, body: INVITE_DEFAULT_BODY },
      placeholders: INVITE_PLACEHOLDERS,
      required: INVITE_REQUIRED_PLACEHOLDERS,
      sample: TEMPLATE_SAMPLE,
    })
  }),
)

const templateSchema = z.object({
  subject: z.string().trim().min(1, 'a subject is required').max(200),
  body: z.string().trim().min(1, 'a body is required').max(20_000),
})

// PUT /api/admin/email-template/invite — save an override.
adminRouter.put(
  '/email-template/invite',
  asyncHandler(async (req, res) => {
    const parsed = templateSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const { subject, body } = parsed.data

    // An invite without the password or the sign-in link can't be acted on by
    // the recipient — refuse rather than silently mail out a dead end.
    // Probing through renderTemplate (rather than a parallel regex) means this
    // check can't disagree with what the sender will actually substitute.
    const probeVars = Object.fromEntries(INVITE_PLACEHOLDERS.map((name) => [name, `<<${name}>>`]))
    const probe = renderTemplate(body, probeVars)
    const missing = INVITE_REQUIRED_PLACEHOLDERS.filter((name) => !probe.includes(`<<${name}>>`))

    // The subject is substituted too, so {{password}} there would put the
    // credential in a place that leaks: mail-server logs, push/notification
    // previews and inbox list views all show subjects. Keep it in the body.
    if (renderTemplate(subject, probeVars).includes('<<password>>')) {
      throw new ApiError(
        400,
        'Remove {{password}} from the subject — subject lines are logged by mail servers and ' +
          'shown in notification previews. Keep the password in the body.',
      )
    }
    if (missing.length) {
      throw new ApiError(
        400,
        `The body must still include ${missing.map((m) => `{{${m}}}`).join(' and ')} — ` +
          'without it the invited member has no way to sign in.',
      )
    }

    await query(
      `INSERT INTO email_templates (key, subject, body, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (key) DO UPDATE
         SET subject = EXCLUDED.subject, body = EXCLUDED.body, updated_at = now()`,
      [INVITE_TEMPLATE_KEY, subject, body],
    )
    res.json({
      ok: true,
      preview: {
        subject: renderTemplate(subject, TEMPLATE_SAMPLE),
        body: renderTemplate(body, TEMPLATE_SAMPLE),
      },
    })
  }),
)

// DELETE /api/admin/email-template/invite — drop the override, back to default.
adminRouter.delete(
  '/email-template/invite',
  asyncHandler(async (_req, res) => {
    await query(`DELETE FROM email_templates WHERE key = $1`, [INVITE_TEMPLATE_KEY])
    res.json({ ok: true, subject: INVITE_DEFAULT_SUBJECT, body: INVITE_DEFAULT_BODY })
  }),
)
