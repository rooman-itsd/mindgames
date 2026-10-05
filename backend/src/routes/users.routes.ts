import { Router } from 'express'
import { z } from 'zod'
import { createHash, randomInt } from 'node:crypto'
import { query } from '../db/pool.js'
import { requireAuth } from '../auth/middleware.js'
import { ApiError, asyncHandler } from '../http.js'
import { mapOwnUser, mapUser, USER_COLS, type UserRow } from '../mappers.js'
import { sendEmail, sendEmailChangeRequestEmail } from '../email.js'
import { getProfileStats } from '../sessionStats.js'

export const usersRouter = Router()

// Personal / free / disposable mail providers — not accepted as a "work" email,
// because they don't prove the person works at a company. Extend as needed.
const NON_WORK_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'ymail.com', 'rocketmail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'yandex.com', 'zoho.com',
  'rediffmail.com', 'inbox.com', 'pm.me',
  // disposable / throwaway
  'mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org',
  'yopmail.com', 'sharklasers.com', 'maildrop.cc', 'getnada.com', 'trashmail.com', 'dispostable.com',
  'fakeinbox.com', 'throwawaymail.com', 'mintemail.com',
])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const maskEmail = (email: string) => {
  const [local, domain] = email.split('@')
  const shown = local.length <= 2 ? local[0] ?? '' : `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`
  return `${shown}@${domain}`
}

// GET /api/users — the whole directory (drives People You May Know, mentions…).
//
// Members only. `mapUser` withholds anything still locked, but the per-field
// locks mean "visible to other MEMBERS", not "visible to the internet" — so
// the resume detail, address, age and salary a member chose to share with the
// network must not be readable by an anonymous caller. The frontend only ever
// calls this with a token (bootstrap and refreshNetwork both bail without one).
//
// Every profile is visible to every member. What a member keeps to themselves
// is per field — email, phone and the other locks — and mapUser applies those
// for every viewer alike.
usersRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await query<UserRow>(`SELECT ${USER_COLS} FROM users ORDER BY name`)
    res.json(result.rows.map(mapUser))
  }),
)

// GET /api/users/leaderboard — top contributors by activity points.
usersRouter.get(
  '/leaderboard',
  asyncHandler(async (_req, res) => {
    const rows = await query<{ id: string; name: string; photo: string | null; designation: string; points: number }>(
      `SELECT u.id, u.name, u.photo, u.designation,
              ((SELECT count(*)::int FROM posts p WHERE p.author_id = u.id) * 10 +
               (SELECT count(*)::int FROM comments c WHERE c.author_id = u.id) * 2 +
               (SELECT COALESCE(sum(p.likes), 0)::int FROM posts p WHERE p.author_id = u.id) * 3 +
               u.connections_count * 5 +
               COALESCE(u.sessions_conducted, 0) * 25 +
               (SELECT count(*)::int FROM posts p WHERE p.author_id = u.id AND p.type = 'Hiring') * 15 +
               (SELECT count(*)::int FROM communities c WHERE c.created_by = u.id) * 20 +
               (SELECT count(*)::int FROM startups s WHERE s.founder_id = u.id) * 30 +
               (SELECT count(*)::int FROM events e WHERE e.creator_id = u.id) * 15 +
               (CASE WHEN u.email_verified_at IS NOT NULL THEN 20 ELSE 0 END)) AS points
       FROM users u
       WHERE NOT u.is_admin
       ORDER BY points DESC, u.created_at
       LIMIT 5`,
    )
    res.json(rows.rows.map((r) => ({ ...r, photo: r.photo ?? undefined })))
  }),
)

// GET /api/users/:id — a single profile. Members only, for the same reason.
usersRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [
      req.params.id,
    ])
    if (!result.rowCount) throw new ApiError(404, 'User not found')
    res.json(mapUser(result.rows[0]))
  }),
)

// Editable profile fields → their DB columns.
const COLUMN_MAP: Record<string, string> = {
  name: 'name',
  phone: 'phone',
  photo: 'photo',
  profileTag: 'profile_tag',
  avatar: 'avatar',
  batchYear: 'batch_year',
  course: 'course',
  company: 'company',
  designation: 'designation',
  college: 'college',
  experienceYears: 'experience_years',
  domain: 'domain',
  employmentType: 'employment_type',
  city: 'city',
  bio: 'bio',
  linkedin: 'linkedin',
  expertise: 'expertise',
  willingToMentor: 'willing_to_mentor',
  interestedInStartup: 'interested_in_startup',
  isMentor: 'is_mentor',
  mentorRate: 'mentor_rate',
  sessionsConducted: 'sessions_conducted',

  // Rich profile detail.
  profileTags: 'profile_tags',
  experience: 'experience',
  education: 'education',
  projects: 'projects',
  certifications: 'certifications',
  achievements: 'achievements',
  otherLinks: 'other_links',
  languagesKnown: 'languages_known',
  github: 'github',
  portfolio: 'portfolio',
  industry: 'industry',
  workMode: 'work_mode',
  openToRelocate: 'open_to_relocate',
  interests: 'interests',
  openToSpeakAtEvents: 'open_to_speak_at_events',
  roomanCenter: 'rooman_center',
  mentorTopics: 'mentor_topics',
  mentorAvailability: 'mentor_availability',
  mentorshipMode: 'mentorship_mode',
  openToReferrals: 'open_to_referrals',
  referralNote: 'referral_note',
  hiringFor: 'hiring_for',
  startupIntent: 'startup_intent',
  startupLookingFor: 'startup_looking_for',
  noticePeriod: 'notice_period',
  preferredLocations: 'preferred_locations',
  seekingMentorshipIn: 'seeking_mentorship_in',
  showEmail: 'show_email',
  showPhone: 'show_phone',
  homeAddress: 'home_address',
  dateOfBirth: 'date_of_birth',
  salaryCurrent: 'salary_current',
  salaryExpected: 'salary_expected',
  showAddress: 'show_address',
  showAge: 'show_age',
  showSalary: 'show_salary',
  bannerTheme: 'banner_theme',
  bannerImage: 'banner_image',
}

/** Columns typed JSONB — their values are JSON.stringify'd before the UPDATE. */
const JSONB_FIELDS = new Set([
  'experience',
  'education',
  'projects',
  'certifications',
  'achievements',
  'otherLinks',
])

// Rich-profile entry shapes. Every string is length-capped and every list
// count-capped: these arrive from a resume parse the member can then edit, so
// they are the one part of the profile a client can grow without limit.
// Mirrors PROFILE_TAGS in frontend/src/types.ts. The older single-value
// `profileTag` column keeps its narrower 3-value CHECK constraint.
const PROFILE_TAGS = [
  'Mentor',
  'Hiring',
  'Open to Work',
  'Willing to give referral',
  'Need mentorship',
] as const

// --- Mentoring is verification-gated ---------------------------------------
// A member claims one requirement (2+ years' experience / a postgraduate
// degree / a passed assessment), attaches evidence, and an admin verifies it
// (see mentorship.routes.ts). `users.mentor_verified_at` is the only thing
// that unlocks mentoring, so nothing a member can put in their own profile —
// typing "M.Tech" into their Education list included — qualifies them.
// Switching mentoring OFF is never gated.

const shortText = z.string().trim().max(200)
const longText = z.string().trim().max(2000)
const tagList = (max = 30) => z.array(z.string().trim().min(1).max(80)).max(max)

const experienceEntry = z.object({
  role: shortText,
  company: shortText,
  period: shortText,
  summary: longText,
})
const educationEntry = z.object({
  degree: shortText,
  institution: shortText,
  year: shortText,
  score: shortText.optional(),
})
const projectEntry = z.object({
  title: shortText,
  description: longText,
  link: shortText.optional(),
  tech: tagList(20),
})
const certificationEntry = z.object({ name: shortText, issuer: shortText, year: shortText })
const achievementEntry = z.object({ title: shortText, year: shortText })
const profileLink = z.object({ label: shortText, url: shortText })

const patchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    phone: z.string().optional(),
    // Small data-URL image; null removes the photo.
    photo: z
      .union([z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(400_000), z.null()])
      .optional(),
    profileTag: z.union([z.enum(['Mentor', 'Hiring', 'Open to Work']), z.null()]).optional(),
    avatar: z.string().optional(),
    batchYear: z.number().int().optional(),
    course: z.string().optional(),
    company: z.string().optional(),
    designation: z.string().optional(),
    college: z.string().optional(),
    experienceYears: z.number().int().min(0).optional(),
    domain: z.string().optional(),
    employmentType: z.string().optional(),
    city: z.string().optional(),
    bio: z.string().optional(),
    linkedin: z.string().optional(),
    expertise: z.array(z.string()).optional(),
    willingToMentor: z.boolean().optional(),
    interestedInStartup: z.boolean().optional(),
    isMentor: z.boolean().optional(),
    mentorRate: z.number().int().optional(),
    sessionsConducted: z.number().int().optional(),

    // --- Rich profile detail ---------------------------------------------
    profileTags: z.array(z.enum(PROFILE_TAGS)).max(PROFILE_TAGS.length).optional(),
    experience: z.array(experienceEntry).max(25).optional(),
    education: z.array(educationEntry).max(15).optional(),
    projects: z.array(projectEntry).max(25).optional(),
    certifications: z.array(certificationEntry).max(30).optional(),
    achievements: z.array(achievementEntry).max(30).optional(),
    otherLinks: z.array(profileLink).max(10).optional(),
    languagesKnown: tagList(15).optional(),
    github: shortText.optional(),
    portfolio: shortText.optional(),
    industry: shortText.optional(),

    workMode: z.enum(['Remote', 'Hybrid', 'Onsite', '']).optional(),
    openToRelocate: z.boolean().optional(),
    interests: tagList(20).optional(),
    openToSpeakAtEvents: z.boolean().optional(),
    roomanCenter: shortText.optional(),

    mentorTopics: tagList(20).optional(),
    mentorAvailability: shortText.optional(),
    mentorshipMode: z.enum(['Call', 'Chat', 'In-person', '']).optional(),

    openToReferrals: z.boolean().optional(),
    referralNote: longText.optional(),
    hiringFor: tagList(20).optional(),

    startupIntent: z
      .enum(['Have an idea', 'Building something', 'Want to join a startup', 'Just curious', ''])
      .optional(),
    startupLookingFor: tagList(10).optional(),

    // Contact visibility — private by default, opt in per field.
    showEmail: z.boolean().optional(),
    showPhone: z.boolean().optional(),

    // Sensitive personal details. Stored, private by default, each with its
    // own lock. '' / null clears a field.
    homeAddress: z.string().trim().max(500).optional(),
    dateOfBirth: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date'), z.literal(''), z.null()])
      .optional(),
    // Annual figures in rupees. Capped well above any real salary so a typo
    // can't store nonsense, and floored at 0.
    salaryCurrent: z.union([z.number().int().min(0).max(1_000_000_000), z.null()]).optional(),
    salaryExpected: z.union([z.number().int().min(0).max(1_000_000_000), z.null()]).optional(),
    showAddress: z.boolean().optional(),
    showAge: z.boolean().optional(),
    showSalary: z.boolean().optional(),

    // Cover colour on the member's own profile hero — a fixed palette, not a
    // free value, so a bad pick can never clash with the surrounding UI.
    bannerTheme: z.enum(['sunrise', 'midnight', 'forest', 'plum', 'slate']).optional(),
    // Custom cover photo; same shape as `photo` but a larger cap — a 1200x400
    // JPEG runs bigger than a 384x384 avatar. null removes it and falls back
    // to the theme gradient.
    bannerImage: z
      .union([z.string().regex(/^data:image\/(jpeg|png|webp);base64,/).max(800_000), z.null()])
      .optional(),

    // Private to the owner.
    noticePeriod: shortText.optional(),
    preferredLocations: tagList(10).optional(),
    seekingMentorshipIn: tagList(20).optional(),
  })
  .strip()

// PATCH /api/users/me — update the authenticated user's own profile.
usersRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)

    const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    if (entries.length === 0) throw new ApiError(400, 'No fields to update')

    // Turning mentoring ON requires an admin-verified application.
    if (parsed.data.willingToMentor === true || parsed.data.isMentor === true) {
      const current = await query<{ mentor_verified_at: Date | null }>(
        `SELECT mentor_verified_at FROM users WHERE id = $1`,
        [req.user!.sub],
      )
      if (!current.rowCount) throw new ApiError(404, 'User not found')
      if (!current.rows[0].mentor_verified_at) {
        throw new ApiError(
          403,
          'Mentoring needs to be verified first. Submit proof of 2+ years of experience, a postgraduate degree, or a passed mentor assessment from your profile, and an admin will review it.',
        )
      }
    }

    const sets: string[] = []
    const values: unknown[] = []
    entries.forEach(([key, value], i) => {
      sets.push(`${COLUMN_MAP[key]} = $${i + 1}`)
      // JSONB columns must be sent as JSON text: pg serialises a JS array into
      // Postgres array-literal syntax ('{...}') by default, which a jsonb
      // column rejects. TEXT[] columns take the JS array as-is.
      // A cleared date arrives as '' from the form; a DATE column needs NULL.
      const normalised = key === 'dateOfBirth' && value === '' ? null : value
      values.push(JSONB_FIELDS.has(key) ? JSON.stringify(normalised) : normalised)
    })
    values.push(req.user!.sub)

    const result = await query<UserRow>(
      `UPDATE users SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${values.length}
       RETURNING ${USER_COLS}`,
      values,
    )
    // Own profile → includes the private fields.
    res.json(mapOwnUser(result.rows[0]))
  }),
)

// Throttle for the admin-notification mail below. Cleared on restart, which
// is fine — it exists to stop a retry loop spamming the admin, not to hold
// state that matters.
const EMAIL_CHANGE_COOLDOWN_MS = 10 * 60 * 1000
const emailChangeRequestedAt = new Map<string, number>()

const emailChangeRequestSchema = z.object({
  newEmail: z.string().trim().email('a valid email is required'),
  reason: z.string().trim().max(500).optional(),
})

// POST /api/users/me/request-email-change — the account email is not
// self-serve editable (it's the sign-in identity, see PATCH /me above, where
// it's simply absent from patchSchema). This notifies the admin instead of
// changing anything, since there is no self-serve email change in this app.
usersRouter.post(
  '/me/request-email-change',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = emailChangeRequestSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)

    const me = await query<{ name: string; email: string }>(`SELECT name, email FROM users WHERE id = $1`, [
      req.user!.sub,
    ])
    if (!me.rowCount) throw new ApiError(404, 'User not found')

    const newEmail = parsed.data.newEmail.toLowerCase()
    if (newEmail === me.rows[0].email.toLowerCase()) {
      throw new ApiError(400, 'That is already your sign-in email.')
    }
    // Email is the account identity and is UNIQUE, so a request the admin
    // could never grant is worth refusing here rather than after they've
    // tried to apply it.
    const taken = await query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [newEmail])
    if (taken.rowCount) {
      throw new ApiError(409, 'Another account already uses that email address.')
    }

    // One request per user per 10 minutes. In-process is enough: this app
    // runs single-instance (see resume.routes.ts), and the point is to stop a
    // stuck retry loop mailing the admin repeatedly, not to resist an attack.
    const last = emailChangeRequestedAt.get(req.user!.sub)
    if (last && Date.now() - last < EMAIL_CHANGE_COOLDOWN_MS) {
      throw new ApiError(429, 'You have already sent a request. Please wait before sending another.')
    }
    emailChangeRequestedAt.set(req.user!.sub, Date.now())

    // Fire-and-forget with a catch, matching the pattern used by the OTP and
    // verification sends in this file: a slow or unreachable mail server must
    // not hang the request, and an SMTP failure must not surface as a 500.
    void sendEmailChangeRequestEmail(
      req.user!.sub,
      me.rows[0].name,
      me.rows[0].email,
      newEmail,
      parsed.data.reason ?? '',
    ).catch((err) =>
      console.error('email-change request mail failed:', err instanceof Error ? err.message : err),
    )
    res.json({ ok: true })
  }),
)

// --- Employer (work-email) verification ------------------------------------
// A user proves they work at a company by verifying a work email with a
// one-time 6-digit code. Once verified they may create Hiring/job posts.

const startSchema = z.object({ email: z.string().trim().max(200) })

// POST /api/users/me/work-email/start — email a 6-digit verification code.
usersRouter.post(
  '/me/work-email/start',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = startSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, 'A valid work email is required')
    const email = parsed.data.email.toLowerCase()
    if (!EMAIL_RE.test(email)) throw new ApiError(400, 'That does not look like a valid email address')
    const domain = email.split('@')[1]
    if (NON_WORK_DOMAINS.has(domain)) {
      throw new ApiError(400, 'Please use your company/work email — personal or temporary email addresses are not accepted.')
    }

    const me = req.user!.sub
    // Rate-limit: one code per minute.
    const existing = await query<{ sent_at: Date }>(
      `SELECT sent_at FROM work_email_otps WHERE user_id = $1`,
      [me],
    )
    if (existing.rowCount && Date.now() - new Date(existing.rows[0].sent_at).getTime() < 60_000) {
      throw new ApiError(429, 'Please wait a minute before requesting another code.')
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    await query(
      `INSERT INTO work_email_otps (user_id, email, code_hash, expires_at, attempts, sent_at)
       VALUES ($1, $2, $3, now() + interval '10 minutes', 0, now())
       ON CONFLICT (user_id) DO UPDATE
         SET email = EXCLUDED.email, code_hash = EXCLUDED.code_hash,
             expires_at = EXCLUDED.expires_at, attempts = 0, sent_at = now()`,
      [me, email, sha256(code)],
    )

    const sent = await sendEmail(
      email,
      'Your RooConnect employer verification code',
      `Your RooConnect verification code is ${code}\n\n` +
        `Enter it on the Jobs page to verify that you work at ${domain} and unlock job posting. ` +
        `The code expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.\n\n— The Rooman Team`,
    )
    res.json({ ok: true, email: maskEmail(email), simulated: !sent })
  }),
)

const verifySchema = z.object({ code: z.string().trim() })

// POST /api/users/me/work-email/verify — confirm the code, mark the user a
// verified employer, and return the updated profile.
usersRouter.post(
  '/me/work-email/verify',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = verifySchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, 'Enter the 6-digit code')
    const me = req.user!.sub

    const otp = await query<{ email: string; code_hash: string; expires_at: Date; attempts: number }>(
      `SELECT email, code_hash, expires_at, attempts FROM work_email_otps WHERE user_id = $1`,
      [me],
    )
    if (!otp.rowCount) throw new ApiError(400, 'Request a verification code first.')
    const row = otp.rows[0]

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await query(`DELETE FROM work_email_otps WHERE user_id = $1`, [me])
      throw new ApiError(400, 'That code has expired — request a new one.')
    }
    if (row.attempts >= 5) {
      await query(`DELETE FROM work_email_otps WHERE user_id = $1`, [me])
      throw new ApiError(429, 'Too many incorrect attempts — request a new code.')
    }
    if (sha256(parsed.data.code) !== row.code_hash) {
      await query(`UPDATE work_email_otps SET attempts = attempts + 1 WHERE user_id = $1`, [me])
      throw new ApiError(400, 'Incorrect code. Please check and try again.')
    }

    const domain = row.email.split('@')[1]
    const updated = await query<UserRow>(
      `UPDATE users SET work_email = $2, work_email_domain = $3, work_verified_at = now(), updated_at = now()
       WHERE id = $1 RETURNING ${USER_COLS}`,
      [me, row.email, domain],
    )
    await query(`DELETE FROM work_email_otps WHERE user_id = $1`, [me])
    res.json(mapOwnUser(updated.rows[0]))
  }),
)

// GET /api/users/:id/badges — achievements computed live from activity.
// No stored state: cheap at this network's scale and always accurate.
usersRouter.get(
  '/:id/badges',
  asyncHandler(async (req, res) => {
    const uid = req.params.id
    const user = await query<{
      connections_count: number
      is_mentor: boolean
      email_verified_at: Date | null
      created_at: Date
    }>(
      `SELECT connections_count, is_mentor, email_verified_at, created_at
       FROM users WHERE id = $1`,
      [uid],
    )
    if (!user.rowCount) throw new ApiError(404, 'User not found')
    const u = user.rows[0]

    const stats = await query<{
      posts: number
      comments: number
      jobs: number
      communities: number
      startups: number
      events: number
      likes_received: number
    }>(
      `SELECT
         (SELECT count(*)::int FROM posts WHERE author_id = $1) AS posts,
         (SELECT count(*)::int FROM comments WHERE author_id = $1) AS comments,
         (SELECT count(*)::int FROM posts WHERE author_id = $1 AND type = 'Hiring') AS jobs,
         (SELECT count(*)::int FROM communities WHERE created_by = $1) AS communities,
         (SELECT count(*)::int FROM startups WHERE founder_id = $1) AS startups,
         (SELECT count(*)::int FROM events WHERE creator_id = $1) AS events,
         (SELECT COALESCE(sum(p.likes), 0)::int FROM posts p WHERE p.author_id = $1) AS likes_received`,
      [uid],
    )
    const c = stats.rows[0]
    // Mentorship counts come from the same mutually-confirmed source the
    // mentor workspace's stored badges use (sessionStats.getProfileStats),
    // not the raw sessions_conducted counter — that counter bumps the moment
    // a mentor clicks "mark completed", before the mentee confirms, so it can
    // read higher than what actually counts. Without this, a mentor could
    // read "Super Mentor" here while the mentor workspace's own "10 Sessions"
    // badge (the stricter, canonical count) hadn't fired yet — same person,
    // two disagreeing numbers.
    const mentorStats = await getProfileStats(uid)
    const sessions = mentorStats.sessionsGiven

    const badges = [
      { id: 'verified', emoji: '✅', label: 'Verified', description: 'Confirmed their email address', earned: !!u.email_verified_at },
      { id: 'first-post', emoji: '📝', label: 'First Post', description: 'Shared their first post with the network', earned: c.posts >= 1 },
      { id: 'contributor', emoji: '✍️', label: 'Contributor', description: 'Shared 5 or more posts', earned: c.posts >= 5 },
      { id: 'popular', emoji: '❤️', label: 'Crowd Favourite', description: 'Collected 10+ likes on their posts', earned: c.likes_received >= 10 },
      { id: 'connector', emoji: '🤝', label: 'Connector', description: 'Made 5 or more connections', earned: u.connections_count >= 5 },
      { id: 'super-connector', emoji: '🌐', label: 'Super Connector', description: 'Made 20 or more connections', earned: u.connections_count >= 20 },
      { id: 'mentor', emoji: '🎓', label: 'Mentor', description: 'Gives back as a mentor', earned: u.is_mentor || sessions > 0 },
      // Stays at 5, the threshold this badge has always used. It is a
      // different badge from the mentor workspace's "10 Sessions"
      // (sessionStats.BADGES: ten_sessions_given) — different name, different
      // surface — so they do not need the same number, and raising this one
      // to match would take the badge away from every mentor sitting on 5-9
      // sessions who had already earned it.
      { id: 'super-mentor', emoji: '🏆', label: 'Super Mentor', description: 'Completed 5+ mentorship sessions', earned: sessions >= 5 },
      { id: 'job-creator', emoji: '💼', label: 'Job Creator', description: 'Posted an opening for fellow alumni', earned: c.jobs >= 1 },
      { id: 'community-builder', emoji: '🏗️', label: 'Community Builder', description: 'Started a community', earned: c.communities >= 1 },
      { id: 'founder', emoji: '🚀', label: 'Founder', description: 'Applied to StartupVarsity with an idea', earned: c.startups >= 1 },
      { id: 'event-host', emoji: '📅', label: 'Event Host', description: 'Hosted a network event', earned: c.events >= 1 },
    ]

    const points =
      c.posts * 10 +
      c.comments * 2 +
      c.likes_received * 3 +
      u.connections_count * 5 +
      sessions * 25 +
      c.jobs * 15 +
      c.communities * 20 +
      c.startups * 30 +
      c.events * 15 +
      (u.email_verified_at ? 20 : 0)

    res.json({ points, badges })
  }),
)
