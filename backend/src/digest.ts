import { query } from './db/pool.js'
import { appBaseUrl, emailEnabled, sendEmail } from './email.js'

const DIGEST_KEY = 'digest_last_sent_at'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** Compose the weekly digest body from the last 7 days of activity. */
// One digest body is built and mailed to every subscriber, so it cannot
// respect who each recipient is connected to the way the feed query does.
// Connections-only ('My Network') posts are therefore left out: emailing
// them to the whole network would leak exactly what the feed's visibility
// rule exists to withhold.
async function buildDigest(): Promise<string> {
  const topPosts = await query<{ content: string; likes: number; name: string }>(
    `SELECT p.content, p.likes, u.name FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.created_at > now() - interval '7 days'
       AND p.visibility <> 'My Network'
     ORDER BY p.likes DESC, p.created_at DESC LIMIT 5`,
  )
  const jobs = await query<{ role: string | null; company: string | null; name: string }>(
    `SELECT p.role, p.company, u.name FROM posts p JOIN users u ON u.id = p.author_id
     WHERE p.type = 'Hiring' AND p.active AND p.created_at > now() - interval '7 days'
       AND p.visibility <> 'My Network'
     ORDER BY p.created_at DESC LIMIT 5`,
  )
  const events = await query<{ title: string; starts_at: Date; location: string }>(
    `SELECT title, starts_at, location FROM events
     WHERE starts_at > now() ORDER BY starts_at LIMIT 5`,
  )
  const newMembers = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM users WHERE created_at > now() - interval '7 days'`,
  )

  const lines: string[] = ['Your week on Root Connect', '========================', '']
  if (topPosts.rowCount) {
    lines.push('Top posts this week:')
    for (const p of topPosts.rows) {
      const snippet = p.content.length > 90 ? `${p.content.slice(0, 90)}…` : p.content
      lines.push(`  • ${snippet} — ${p.name} (${p.likes} likes)`)
    }
    lines.push('')
  }
  if (jobs.rowCount) {
    lines.push('New job openings:')
    for (const j of jobs.rows) {
      lines.push(`  • ${j.role ?? 'Open role'}${j.company ? ` at ${j.company}` : ''} — posted by ${j.name}`)
    }
    lines.push('')
  }
  if (events.rowCount) {
    lines.push('Upcoming events:')
    for (const e of events.rows) {
      const when = new Date(e.starts_at).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
      lines.push(`  • ${e.title} — ${when}${e.location ? ` · ${e.location}` : ''}`)
    }
    lines.push('')
  }
  if (newMembers.rows[0].count > 0) {
    lines.push(`${newMembers.rows[0].count} new member${newMembers.rows[0].count === 1 ? '' : 's'} joined the network this week.`)
    lines.push('')
  }
  lines.push(`Catch up: ${appBaseUrl()}/home`)
  lines.push('')
  lines.push('— The Rooman Alumni Network')
  lines.push('(You can turn this digest off under Settings.)')
  return lines.join('\n')
}

/**
 * Send the weekly digest to every opted-in member.
 * Returns how many were sent (or would have been, when SMTP is simulated).
 */
export async function sendWeeklyDigest(): Promise<{ recipients: number; simulated: boolean }> {
  const body = await buildDigest()
  const recipients = await query<{ email: string }>(
    `SELECT email FROM users WHERE email_digest AND NOT is_admin AND email LIKE '%@%'`,
  )
  let sent = 0
  for (const r of recipients.rows) {
    try {
      await sendEmail(r.email, 'Your weekly Root Connect digest', body)
      sent++
    } catch (err) {
      console.error(`digest to ${r.email} failed:`, err instanceof Error ? err.message : err)
    }
  }
  await query(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [DIGEST_KEY, new Date().toISOString()],
  )
  return { recipients: sent, simulated: !emailEnabled }
}

/**
 * Hourly check: send the digest on Monday mornings (server time), at most
 * once every 6 days. Cheap enough to run in-process — no cron dependency.
 */
export function startDigestScheduler(): void {
  const tick = async () => {
    try {
      const now = new Date()
      if (now.getDay() !== 1 || now.getHours() < 9 || now.getHours() > 11) return
      const last = await query<{ value: string }>(`SELECT value FROM app_meta WHERE key = $1`, [DIGEST_KEY])
      const lastAt = last.rowCount ? +new Date(last.rows[0].value) : 0
      if (Date.now() - lastAt < WEEK_MS - 24 * 60 * 60 * 1000) return
      const result = await sendWeeklyDigest()
      console.log(`Weekly digest sent to ${result.recipients} member(s)${result.simulated ? ' (simulated)' : ''}`)
    } catch (err) {
      console.error('digest scheduler failed:', err instanceof Error ? err.message : err)
    }
  }
  setInterval(tick, 60 * 60 * 1000)
}
