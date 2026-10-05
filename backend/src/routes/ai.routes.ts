import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db/pool.js'
import { requireAuth } from '../auth/middleware.js'
import { ApiError, asyncHandler } from '../http.js'
import { AiRateLimitError, aiEnabled, askRoo, type RooTurn } from '../ai.js'

export const aiRouter = Router()

/** Compact, fresh snapshot of the network for grounding Roo's answers. */
async function buildContext(): Promise<string> {
  const [users, jobs, events, communities] = await Promise.all([
    query<{
      name: string
      designation: string
      company: string
      college: string
      employment_type: string
      city: string
      domain: string
      is_mentor: boolean
      mentor_rate: number | null
      batch_year: number
    }>(
      // Profiles are visible network-wide, so any member may be named here.
      // Only profile fields — never email or phone, which stay behind each
      // member's own show-contact switch.
      `SELECT name, designation, company, college, employment_type, city, domain, is_mentor, mentor_rate, batch_year
       FROM users WHERE NOT is_admin ORDER BY created_at LIMIT 200`,
    ),
    query<{ role: string | null; company: string | null; city: string | null; domain: string | null; poster: string; applicants: number }>(
      `SELECT p.role, p.company, p.city, p.domain, u.name AS poster,
              (SELECT count(*)::int FROM job_applications ja WHERE ja.post_id = p.id) AS applicants
       FROM posts p JOIN users u ON u.id = p.author_id
       -- This context answers any member, so connections-only posts stay out.
       WHERE p.type = 'Hiring' AND p.active AND p.visibility <> 'My Network'
       ORDER BY p.created_at DESC LIMIT 25`,
    ),
    query<{ title: string; starts_at: Date; location: string; host: string; rsvps: number }>(
      `SELECT e.title, e.starts_at, e.location, u.name AS host,
              (SELECT count(*)::int FROM event_rsvps r WHERE r.event_id = e.id) AS rsvps
       FROM events e JOIN users u ON u.id = e.creator_id
       WHERE e.starts_at > now() ORDER BY e.starts_at LIMIT 10`,
    ),
    query<{ name: string; category: string; member_count: number }>(
      `SELECT name, category, member_count FROM communities WHERE status = 'approved'
       ORDER BY member_count DESC LIMIT 20`,
    ),
  ])

  const lines: string[] = []
  lines.push(`MEMBERS (${users.rowCount}):`)
  for (const u of users.rows) {
    const status =
      u.employment_type === 'Student'
        ? `Student${u.college ? ` at ${u.college}` : ''}`
        : u.employment_type === 'Looking for opportunity'
          ? 'Looking for opportunity'
          : u.employment_type === 'Just looking around'
            ? 'Just looking around'
            : `${u.designation || 'Member'} at ${u.company || '—'}`
    lines.push(
      `- ${u.name} — ${status}, ${u.city || '—'} · ${u.domain} · Batch ${u.batch_year}` +
        (u.is_mentor ? ` · MENTOR${u.mentor_rate ? ` (₹${u.mentor_rate}/hr)` : ' (rate on request)'}` : ''),
    )
  }
  lines.push('', `OPEN JOBS (${jobs.rowCount}):`)
  for (const j of jobs.rows) {
    lines.push(`- ${j.role ?? 'Open role'} at ${j.company ?? '—'}${j.city ? `, ${j.city}` : ''}${j.domain ? ` · ${j.domain}` : ''} — posted by ${j.poster}, ${j.applicants} applicant(s)`)
  }
  lines.push('', `UPCOMING EVENTS (${events.rowCount}):`)
  for (const e of events.rows) {
    const when = new Date(e.starts_at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    lines.push(`- "${e.title}" on ${when}${e.location ? ` at ${e.location}` : ''} — hosted by ${e.host}, ${e.rsvps} going`)
  }
  lines.push('', `COMMUNITIES (${communities.rowCount}):`)
  for (const c of communities.rows) {
    lines.push(`- ${c.name} (${c.category}, ${c.member_count} members)`)
  }
  return lines.join('\n')
}

const askSchema = z.object({
  question: z.string().trim().min(1, 'question is required').max(500),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .max(10)
    .default([]),
})

// POST /api/ai/ask — Roo answers questions grounded in live network data.
aiRouter.post(
  '/ask',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!aiEnabled) throw new ApiError(503, 'AI is not configured on this server.')
    const parsed = askSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const context = await buildContext()
    try {
      const answer = await askRoo(parsed.data.question, parsed.data.history as RooTurn[], context)
      res.json({ answer })
    } catch (err) {
      console.error('Ask Roo failed:', err instanceof Error ? err.message : err)
      // Usage limits are actionable, so surface the reason verbatim as a 503.
      if (err instanceof AiRateLimitError) throw new ApiError(503, err.message)
      throw new ApiError(502, 'Roo had trouble answering — please try again.')
    }
  }),
)
