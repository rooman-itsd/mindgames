import { config } from './config.js'
import express from 'express'
import cors from 'cors'
import { pool } from './db/pool.js'
import { errorHandler } from './http.js'
import { authRouter } from './routes/auth.routes.js'
import { usersRouter } from './routes/users.routes.js'
import { postsRouter } from './routes/posts.routes.js'
import { connectionsRouter } from './routes/connections.routes.js'
import { messagesRouter } from './routes/messages.routes.js'
import { communitiesRouter } from './routes/communities.routes.js'
import { mentorshipRouter, startSessionReminderScheduler } from './routes/mentorship.routes.js'
import { startupsRouter } from './routes/startups.routes.js'
import { notificationsRouter } from './routes/notifications.routes.js'
import { inviteesRouter } from './routes/invitees.routes.js'
import { adminRouter } from './routes/admin.routes.js'
import { invitesRouter } from './routes/invites.routes.js'
import { resumeRouter } from './routes/resume.routes.js'
import { eventsRouter, startEventReminderScheduler } from './routes/events.routes.js'
import { sseHandler } from './realtime.js'
import { aiRouter } from './routes/ai.routes.js'
import { reportsRouter } from './routes/reports.routes.js'
import { companiesRouter } from './routes/companies.routes.js'
import { careerRouter } from './routes/career.routes.js'
import { careerResourcesRouter } from './routes/careerResources.routes.js'
import { learningRouter } from './routes/learning.routes.js'
import { learningResourcesRouter } from './routes/learningResources.routes.js'
import { startLearningNudgeScheduler } from './learningNudge.js'
import { startLearningEmbedScheduler } from './learningEmbed.js'
import { backfillSessionAssignees } from './resourceAssignees.js'
import { subscriptionRouter } from './routes/subscription.routes.js'
import { groupSessionsRouter } from './routes/groupSessions.routes.js'
import { backfillCareerPaths } from './careerPaths.js'
import { setAppBaseUrl } from './email.js'
import { baseUrlSource, resolveAppBaseUrl } from './publicUrl.js'

const app = express()
app.use(cors())
// Mentor proof documents: up to 5 files x 5MB, base64-encoded into a single
// JSON body — ~34MB worst case, well over the app-wide ceiling below. Three
// 4MB scans were already enough to be rejected by the parser before the route
// ever ran. Mounted BEFORE the global parser because body-parser skips a
// request whose body an earlier parser already read, so the first one to match
// is the one whose limit applies.
app.use('/api/mentorship/applications', express.json({ limit: '40mb' }))
app.use(express.json({ limit: '15mb' })) // base64 PDFs for resume parsing

// --- Health (also checks DB connectivity) -----------------------------------
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true, db: 'up' })
  } catch {
    res.status(503).json({ ok: false, db: 'down' })
  }
})

// --- Feature routers --------------------------------------------------------
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/posts', postsRouter)
app.use('/api/connections', connectionsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/communities', communitiesRouter)
app.use('/api/mentorship', mentorshipRouter)
app.use('/api/startups', startupsRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/alumni', inviteesRouter) // admin invitee directory
app.use('/api/admin', adminRouter) // admin console stats

app.use('/api/invites', invitesRouter)
app.use('/api/resume', resumeRouter)
app.use('/api/events', eventsRouter)
app.get('/api/stream', sseHandler)
app.use('/api/ai', aiRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/companies', companiesRouter)
app.use('/api/career', careerRouter)
app.use('/api/career-resources', careerResourcesRouter)
app.use('/api/learning', learningRouter)
app.use('/api/learning', learningResourcesRouter) // Add resource: uploads, files
app.use('/api/subscription', subscriptionRouter)
app.use('/api/group-sessions', groupSessionsRouter)

// --- Terminal error handler -------------------------------------------------
app.use(errorHandler)

startEventReminderScheduler()
startSessionReminderScheduler()
startLearningNudgeScheduler()
startLearningEmbedScheduler()
// Session resources written by the previous build during the deploy window
// get their recipient now that this build is the one running.
void backfillSessionAssignees()

// Resolve the address for email links BEFORE accepting requests. Awaiting it
// is what makes that guarantee true: fire-and-forget left a window in which a
// password reset could be sent with an unresolved base, and reset tokens are
// single-use, so a broken link in that window is not recoverable by retrying.
//
// With APP_URL=auto this asks EC2 for the instance's own public address, so a
// stop/start that changes the IP corrects itself on restart. Off EC2 the
// metadata endpoint is unroutable and the attempt abandons in ~35ms (see
// publicUrl.ts), so this delays local startup imperceptibly.
async function start(): Promise<void> {
  try {
    const base = await resolveAppBaseUrl()
    setAppBaseUrl(base)
    console.log(`Email links will use ${base} (${baseUrlSource()})`)
  } catch (err) {
    // Never fatal: a wrong address in an email is recoverable, an API that
    // refuses to boot is not. resolveAppBaseUrl already logs the detail.
    console.error(
      'could not resolve the public base URL:',
      err instanceof Error ? err.message : err,
    )
  }

  // Career Guidance reads alumni role transitions derived from existing
  // profiles. Idempotent (rows are replaced, not appended), and never fatal:
  // the rest of the API must still start if this one derivation fails.
  backfillCareerPaths().catch((err) => {
    console.error('career_paths backfill failed:', err instanceof Error ? err.message : err)
  })

  app.listen(config.port, () => {
    console.log(`Rooman Alumni API listening on http://localhost:${config.port}`)
  })
}

void start()
