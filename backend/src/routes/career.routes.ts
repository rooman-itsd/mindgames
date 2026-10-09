import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../db/pool.js'
import { requireAuth } from '../auth/middleware.js'
import { ApiError, asyncHandler } from '../http.js'
import { generateCareerRoadmap, generateMenteeBrief, type CareerRoadmapContext } from '../ai.js'
import {
  deriveCareerPathsForUser,
  findCareerPathChains,
  findSimilarPathAlumni,
  normalizeRole,
} from '../careerPaths.js'
import { startYearOf } from '../mappers.js'
import { refreshBadges } from '../sessionStats.js'
import { loadRoadmapCore } from '../roadmap.js'
import {
  mapCareerAssessment,
  mapCareerRoadmap,
  mapAlumniService,
  type CareerAssessmentRow,
  type CareerRoadmapRow,
  type AlumniServiceRow,
} from '../mappers.js'

export const careerRouter = Router()

// Must match the CHECK constraint on alumni_services.service_type (schema.sql)
// and SERVICE_TYPES in frontend/src/types.ts.
export const SERVICE_TYPES = [
  'career_guidance', 'resume_review', 'interview_preparation', 'technical_mentoring',
  'project_guidance', 'industry_guidance', 'career_transition', 'freelance_consulting',
  'portfolio_review', 'linkedin_review', 'mock_interview', 'code_project_review',
  'startup_business_guidance', 'domain_specific_advice',
] as const

// Which service types are relevant to a given assessment goal — a fixed,
// hand-written lookup (not stored data) that drives the deterministic
// "Services matched to your roadmap" scoring below. See the design
// discussion (§4) for why this replaces a vector/semantic search.
const GOAL_SERVICE_TYPES: Record<string, (typeof SERVICE_TYPES)[number][]> = {
  first_job: ['resume_review', 'interview_preparation', 'mock_interview', 'linkedin_review', 'career_guidance'],
  switch_career: ['career_transition', 'career_guidance', 'industry_guidance', 'technical_mentoring'],
  switch_domain: ['career_transition', 'domain_specific_advice', 'technical_mentoring', 'project_guidance'],
  get_promoted: ['career_guidance', 'industry_guidance', 'technical_mentoring'],
  become_specialist: ['technical_mentoring', 'project_guidance', 'code_project_review', 'domain_specific_advice'],
  move_into_management: ['career_guidance', 'industry_guidance'],
  start_freelancing: ['freelance_consulting', 'portfolio_review', 'career_guidance'],
  start_business: ['startup_business_guidance', 'career_guidance'],
  explore_options: ['career_guidance', 'industry_guidance', 'domain_specific_advice'],
}

// ---------------------------------------------------------------------------
// Assessment: draft autosave + submit (submit always regenerates the roadmap)
// ---------------------------------------------------------------------------

const assessmentSchema = z.object({
  currentSituation: z.string().trim().max(60).optional().default(''),
  goalType: z.string().trim().max(60).optional().default(''),
  targetRole: z.string().trim().max(120).optional().default(''),
  targetRoleUnsure: z.boolean().optional().default(false),
  hoursPerWeek: z.number().int().min(1).max(80).optional(),
  timelineMonths: z.number().int().min(1).max(60).optional(),
  extraSkillsNote: z.string().trim().max(1000).optional().default(''),
  learningPrefs: z.array(z.string()).optional().default([]),
  supportPreference: z.string().trim().max(60).optional().default(''),
  helpTypes: z.array(z.string()).optional().default([]),
  freeText: z.string().trim().max(2000).optional().default(''),
  submit: z.boolean().optional().default(false),
})

// GET /api/career/assessment/draft — the in-progress draft, if any, so the
// wizard can resume where the member left off.
careerRouter.get(
  '/assessment/draft',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query<CareerAssessmentRow>(
      `SELECT * FROM career_assessments WHERE user_id = $1 AND status = 'draft'`,
      [req.user!.sub],
    )
    res.json(r.rowCount ? mapCareerAssessment(r.rows[0]) : null)
  }),
)

// GET /api/career/assessment/last — the most recent submitted assessment,
// so "Edit Assessment" can reopen the wizard prefilled instead of blank.
careerRouter.get(
  '/assessment/last',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query<CareerAssessmentRow>(
      `SELECT * FROM career_assessments WHERE user_id = $1 AND status = 'submitted'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user!.sub],
    )
    res.json(r.rowCount ? mapCareerAssessment(r.rows[0]) : null)
  }),
)

// Builds the small, pre-filtered context packet handed to the AI model — see
// backend/src/ai.ts (generateCareerRoadmap) for what it does with this.
// Deliberately NOT a database dump: every list here is already filtered down
// to what's plausibly relevant before the model ever sees it.
async function buildRoadmapContext(
  userId: string,
  assessment: ReturnType<typeof mapCareerAssessment>,
): Promise<CareerRoadmapContext> {
  const me = await query<{
    expertise: string[]
    experience: unknown
    certifications: unknown
    designation: string
  }>(`SELECT expertise, experience, certifications, designation FROM users WHERE id = $1`, [userId])
  const row = me.rows[0]
  // Sorted, not sliced off the end: profiles are stored newest-first as often
  // as oldest-first (careerPaths.ts sorts for exactly this reason), so taking
  // the last three entries could hand the model someone's three oldest roles
  // and describe a senior engineer by the job they left a decade ago.
  const recentRoles = (Array.isArray(row?.experience) ? row.experience : [])
    .map((e) => (e && typeof e === 'object' ? (e as Record<string, unknown>) : {}))
    .map((e, i) => ({ role: String(e.role ?? ''), year: startYearOf(e.period), i }))
    .filter((e) => e.role !== '')
    .sort((a, b) => {
      if (a.year === null && b.year === null) return a.i - b.i
      if (a.year === null) return 1
      if (b.year === null) return -1
      return b.year - a.year
    })
    .slice(0, 3)
    .map((e) => e.role)
  const certNames = (Array.isArray(row?.certifications) ? row.certifications : [])
    .map((c) => (c && typeof c === 'object' ? String((c as Record<string, unknown>).name ?? '') : ''))
    .filter(Boolean)

  const currentRole = row?.designation ?? ''
  const targetRole = assessment.targetRoleUnsure ? '' : assessment.targetRole

  const pathAlumni = await findSimilarPathAlumni(currentRole, targetRole)
  const pathCounts = new Map<string, number>()
  for (const p of pathAlumni) {
    const key = `${p.fromRole} -> ${p.toRole}`
    pathCounts.set(key, (pathCounts.get(key) ?? 0) + 1)
  }
  const candidatePaths = [...pathCounts.entries()].map(([key, alumniCount]) => {
    const [fromRole, toRole] = key.split(' -> ')
    return { fromRole, toRole, alumniCount }
  })

  // Full journeys, not just single hops: the recursive walk over career_paths
  // reconstructs routes real alumni took from where this member stands to
  // where they want to be (e.g. backend developer -> cloud engineer -> AI
  // engineer), which is far more useful to the model than a set of unlinked
  // role pairs. Empty when nobody has walked it, which is the honest answer.
  const walkedRoutes = (await findCareerPathChains(currentRole, targetRole)).map((c) => c.roles)

  // Candidate alumni: whoever showed up on a similar path, plus mentors who
  // share at least one skill/domain word with the member's own profile —
  // capped to keep the prompt small. Never the whole member directory.
  const pathAlumniIds = [...new Set(pathAlumni.map((p) => p.userId))]
  const alumniRows = await query<{ id: string; designation: string; company: string; expertise: string[] }>(
    `SELECT id, designation, company, expertise FROM users
      WHERE is_mentor AND id <> $1
        AND (id = ANY($2::text[]) OR expertise && $3::text[])
      ORDER BY id = ANY($2::text[]) DESC, sessions_conducted DESC NULLS LAST
      LIMIT 8`,
    [userId, pathAlumniIds, row?.expertise ?? []],
  )
  const candidateAlumni = alumniRows.rows.map((a) => ({
    id: a.id,
    currentRole: [a.designation, a.company].filter(Boolean).join(' @ '),
    topSkills: (a.expertise ?? []).slice(0, 5),
  }))

  // Candidate services: active services tagged with something the member's
  // own profile or goal already mentions, so the model chooses from a
  // relevant shortlist rather than the entire marketplace.
  const goalTags = GOAL_SERVICE_TYPES[assessment.goalType] ?? []
  const serviceRows = await query<{ id: string; service_type: string; tags: string[] }>(
    // Never a member's own listings: a mentor following their own roadmap
    // should not be offered their own services to book.
    `SELECT id, service_type, tags FROM alumni_services
      WHERE active AND user_id <> $3 AND (service_type = ANY($1::text[]) OR tags && $2::text[])
      LIMIT 20`,
    [goalTags, row?.expertise ?? [], userId],
  )
  const candidateServices = serviceRows.rows.map((s) => ({ id: s.id, type: s.service_type, tags: s.tags ?? [] }))

  return {
    assessment: {
      currentSituation: assessment.currentSituation,
      goalType: assessment.goalType,
      targetRole: assessment.targetRoleUnsure ? null : assessment.targetRole,
      hoursPerWeek: assessment.hoursPerWeek ?? 0,
      timelineMonths: assessment.timelineMonths ?? 0,
      learningPreferences: assessment.learningPrefs,
      helpTypesWanted: assessment.helpTypes,
      freeText: assessment.freeText,
    },
    userSkills: { expertise: row?.expertise ?? [], recentRoles, certifications: certNames },
    candidatePaths,
    walkedRoutes,
    candidateAlumni,
    candidateServices,
  }
}

// POST /api/career/assessment — autosave a draft, or submit (regenerating
// the roadmap). Submitting always creates a new assessment row and a new
// roadmap version; nothing is ever overwritten in place.
careerRouter.post(
  '/assessment',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = assessmentSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const { submit, ...a } = parsed.data
    const userId = req.user!.sub

    if (!submit) {
      const draft = await query<CareerAssessmentRow>(
        `INSERT INTO career_assessments
           (user_id, status, current_situation, goal_type, target_role, target_role_unsure,
            hours_per_week, timeline_months, extra_skills_note, learning_prefs,
            support_preference, help_types, free_text)
         VALUES ($1, 'draft', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (user_id) WHERE status = 'draft' DO UPDATE SET
           current_situation = $2, goal_type = $3, target_role = $4, target_role_unsure = $5,
           hours_per_week = $6, timeline_months = $7, extra_skills_note = $8, learning_prefs = $9,
           support_preference = $10, help_types = $11, free_text = $12, updated_at = now()
         RETURNING *`,
        [
          userId, a.currentSituation, a.goalType, a.targetRole, a.targetRoleUnsure,
          a.hoursPerWeek ?? null, a.timelineMonths ?? null, a.extraSkillsNote, a.learningPrefs,
          a.supportPreference, a.helpTypes, a.freeText,
        ],
      )
      return res.json(mapCareerAssessment(draft.rows[0]))
    }

    // Submitting: insert as 'submitted' and drop the draft — a retake starts
    // its own fresh draft next time, it doesn't resume this one.
    const submitted = await withTransaction(async (client) => {
      await client.query(`DELETE FROM career_assessments WHERE user_id = $1 AND status = 'draft'`, [userId])
      return client.query<CareerAssessmentRow>(
        `INSERT INTO career_assessments
           (user_id, status, current_situation, goal_type, target_role, target_role_unsure,
            hours_per_week, timeline_months, extra_skills_note, learning_prefs,
            support_preference, help_types, free_text)
         VALUES ($1, 'submitted', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          userId, a.currentSituation, a.goalType, a.targetRole, a.targetRoleUnsure,
          a.hoursPerWeek ?? null, a.timelineMonths ?? null, a.extraSkillsNote, a.learningPrefs,
          a.supportPreference, a.helpTypes, a.freeText,
        ],
      )
    })
    const assessment = mapCareerAssessment(submitted.rows[0])

    // Freshen this member's own transitions before retrieval reads them —
    // guarantees a profile edit made right before submitting is reflected.
    await deriveCareerPathsForUser(userId)

    const context = await buildRoadmapContext(userId, assessment)
    let result
    try {
      result = await generateCareerRoadmap(context)
    } catch (err) {
      throw new ApiError(502, err instanceof Error ? err.message : 'Could not generate a roadmap. Please try again.')
    }

    // Guardrail: strip any id the model returned that wasn't actually in the
    // candidate lists it was given — it must never reference an alumnus or
    // service that doesn't exist or wasn't offered as an option.
    const validAlumniIds = new Set(context.candidateAlumni.map((a) => a.id))
    const validServiceIds = new Set(context.candidateServices.map((s) => s.id))
    const lastIndex = result.stages.length - 1
    // stepKey is the primary key of the step-state table, and the model has
    // been seen to reuse a slug across stages. Deduped here so a repeat can't
    // abort the insert transaction after the (slow, paid) AI call succeeded.
    const seenKeys = new Set<string>()
    const stages = result.stages.map((s, i) => ({
      ...s,
      stepKey: (() => {
        let key = s.stepKey || `step-${i + 1}`
        while (seenKeys.has(key)) key = `${key}-${i + 1}`
        seenKeys.add(key)
        return key
      })(),
      // Progress is ours to decide, not the model's: left to the model it
      // marked the target role "completed" on day one and every middle stage
      // "in progress" at once. Where the member stands is a fact we know —
      // they start at their current situation, working on the first real
      // stage, with everything after it still ahead.
      status:
        i === 0 ? ('completed' as const)
        : i === lastIndex ? ('upcoming' as const)
        : i === 1 ? ('in_progress' as const)
        : ('upcoming' as const),
      relevantAlumniIds: s.relevantAlumniIds.filter((id) => validAlumniIds.has(id)),
      relevantServiceIds: s.relevantServiceIds.filter((id) => validServiceIds.has(id)),
    }))

    const me = await query<{ designation: string }>(`SELECT designation FROM users WHERE id = $1`, [userId])
    const data = {
      goal: { currentRole: me.rows[0]?.designation ?? '', targetRole: assessment.targetRoleUnsure ? null : assessment.targetRole },
      timelineMonths: assessment.timelineMonths ?? 0,
      hoursPerWeek: assessment.hoursPerWeek ?? 0,
      stages,
    }

    const roadmap = await withTransaction(async (client) => {
      await client.query(`UPDATE career_roadmaps SET status = 'archived' WHERE user_id = $1 AND status = 'active'`, [userId])
      const prevVersion = await client.query<{ v: number }>(
        `SELECT COALESCE(MAX(version), 0)::int AS v FROM career_roadmaps WHERE user_id = $1`,
        [userId],
      )
      const version = (prevVersion.rows[0]?.v ?? 0) + 1
      const ins = await client.query<CareerRoadmapRow>(
        `INSERT INTO career_roadmaps (user_id, assessment_id, version, status, data)
         VALUES ($1, $2, $3, 'active', $4) RETURNING *`,
        [userId, assessment.id, version, JSON.stringify(data)],
      )
      // Seed step state from the model's own initial status per stage.
      for (const s of stages) {
        await client.query(
          `INSERT INTO career_roadmap_step_state (roadmap_id, step_key, status, completed_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (roadmap_id, step_key) DO UPDATE SET status = EXCLUDED.status`,
          [
            ins.rows[0].id,
            s.stepKey,
            s.status === 'completed' ? 'completed' : s.status === 'in_progress' ? 'in_progress' : 'upcoming',
            s.status === 'completed' ? new Date() : null,
          ],
        )
      }
      return ins.rows[0]
    })

    res.json(mapCareerRoadmap(roadmap))
  }),
)

// ---------------------------------------------------------------------------
// Roadmap: read the active plan, mark step progress
// ---------------------------------------------------------------------------

async function loadActiveRoadmap(userId: string) {
  // The plan and its live stage statuses — shared with the Learning
  // Resources page, which needs exactly this much and not the services below.
  const mapped = await loadRoadmapCore(userId)
  if (!mapped) return null

  // The services the roadmap matched to its stages, for each stage card's
  // "N services" list. Live ones only: a service paused or deleted since the
  // roadmap was built drops out here rather than showing as something the
  // member can't book. Fetched by id rather than taken from the page's
  // matched list, which is a top-N across all services and missed most of
  // them. The member's own services are left out, same as /services/matched.
  const serviceIds = [
    ...new Set(
      mapped.stages.flatMap((s: Record<string, unknown>) =>
        Array.isArray(s.relevantServiceIds) ? (s.relevantServiceIds as string[]) : [],
      ),
    ),
  ]
  const stageServices = serviceIds.length
    ? (
        await query<AlumniServiceRow>(
          `SELECT s.*, u.name AS provider_name, u.photo AS provider_photo,
                  u.designation AS provider_designation, u.company AS provider_company
             FROM alumni_services s JOIN users u ON u.id = s.user_id
            WHERE s.active AND s.id = ANY($1::text[]) AND s.user_id <> $2`,
          [serviceIds, userId],
        )
      ).rows.map(mapAlumniService)
    : []

  return { ...mapped, stageServices }
}

// GET /api/career/roadmap — the member's current active roadmap, or null if
// they haven't completed the assessment yet.
careerRouter.get(
  '/roadmap',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await loadActiveRoadmap(req.user!.sub))
  }),
)

const stepStatusSchema = z.object({
  status: z.enum(['upcoming', 'in_progress', 'completed', 'paused']),
})

const roadmapEditSchema = z.object({
  stages: z
    .array(
      z.object({
        stepKey: z.string().min(1).max(80),
        // "New stage" is the edit panel's old placeholder. Saved as-is it reads
        // like the AI wrote a meaningless step, so a member-added stage must
        // be given a real name.
        title: z
          .string()
          .trim()
          .min(1)
          .max(160)
          .refine((t) => t.toLowerCase() !== 'new stage', 'Give your new stage a name of its own.'),
        status: z.enum(['upcoming', 'in_progress', 'completed', 'paused']),
        durationWeeks: z.number().int().min(1).max(260).nullable(),
      }),
    )
    .min(1)
    .max(20),
})

// PATCH /api/career/roadmap — the member's own edits to their plan: rename,
// reorder, add or remove a stage, pause one. Applied in place rather than as
// a new version — a version is what a *regenerated* roadmap gets, and losing
// their hand-edits behind a version bump every time they rename a step would
// make the plan feel like it isn't theirs to touch.
//
// Alumni/service links are carried over from the existing stage rather than
// accepted from the client, so this route can never be used to attach an
// arbitrary person or service to a roadmap.
careerRouter.patch(
  '/roadmap',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = roadmapEditSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)

    const existing = await query<CareerRoadmapRow>(
      `SELECT * FROM career_roadmaps WHERE user_id = $1 AND status = 'active'`,
      [req.user!.sub],
    )
    if (!existing.rowCount) throw new ApiError(404, 'No active roadmap')

    const current = mapCareerRoadmap(existing.rows[0])
    // The first stage is the "you are here" marker and the last is the
    // target; the timeline labels them by position. Moving or dropping either
    // puts a real stage under the "Current"/"Target" label, so both stay put.
    const savedKeys = (current.stages as { stepKey: string }[]).map((s) => s.stepKey)
    const sentKeys = parsed.data.stages.map((s) => s.stepKey)
    if (
      savedKeys.length >= 2 &&
      (sentKeys[0] !== savedKeys[0] || sentKeys[sentKeys.length - 1] !== savedKeys[savedKeys.length - 1])
    ) {
      throw new ApiError(400, 'Your starting point and target stay at the ends of the plan.')
    }
    const bySavedKey = new Map(
      (current.stages as { stepKey: string; relevantAlumniIds?: string[]; relevantServiceIds?: string[] }[]).map(
        (s) => [s.stepKey, s],
      ),
    )
    const stages = parsed.data.stages.map((s) => ({
      ...s,
      relevantAlumniIds: bySavedKey.get(s.stepKey)?.relevantAlumniIds ?? [],
      relevantServiceIds: bySavedKey.get(s.stepKey)?.relevantServiceIds ?? [],
    }))

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE career_roadmaps SET data = jsonb_set(data, '{stages}', $2::jsonb) WHERE id = $1`,
        [existing.rows[0].id, JSON.stringify(stages)],
      )
      // Drop state for stages that no longer exist, and make sure every
      // remaining stage has a row matching the status just submitted.
      await client.query(
        `DELETE FROM career_roadmap_step_state WHERE roadmap_id = $1 AND NOT (step_key = ANY($2::text[]))`,
        [existing.rows[0].id, stages.map((s) => s.stepKey)],
      )
      for (const s of stages) {
        await client.query(
          // completed_at is preserved when a stage was already complete —
          // renaming one stage used to stamp every completed stage with the
          // current time, erasing when the member actually finished them.
          // It is only set when a stage becomes complete, and cleared when it
          // is reopened.
          `INSERT INTO career_roadmap_step_state (roadmap_id, step_key, status, completed_at)
           VALUES ($1, $2, $3, CASE WHEN $3 = 'completed' THEN now() ELSE NULL END)
           ON CONFLICT (roadmap_id, step_key) DO UPDATE
             SET status = $3,
                 completed_at = CASE
                   WHEN $3 <> 'completed' THEN NULL
                   ELSE COALESCE(career_roadmap_step_state.completed_at, now())
                 END`,
          [existing.rows[0].id, s.stepKey, s.status],
        )
      }
    })

    res.json(await loadActiveRoadmap(req.user!.sub))
  }),
)

// PATCH /api/career/roadmap/steps/:stepKey — mark a step's progress. Kept
// separate from the roadmap's own JSON so this never requires a new version.
careerRouter.patch(
  '/roadmap/steps/:stepKey',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = stepStatusSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)

    const active = await query<{ id: string; data: unknown }>(
      `SELECT id, data FROM career_roadmaps WHERE user_id = $1 AND status = 'active'`,
      [req.user!.sub],
    )
    if (!active.rowCount) throw new ApiError(404, 'No active roadmap')

    // The step must be one this roadmap actually has. Without the check any
    // string in the URL created a row, so a typo (or a loop) could fill the
    // table with state for steps that don't exist.
    const roadmapData = (active.rows[0].data ?? {}) as {
      stages?: { stepKey?: string; title?: string; status?: string }[]
    }
    const stages = roadmapData.stages ?? []
    const index = stages.findIndex((s) => s.stepKey === req.params.stepKey)
    if (index === -1) throw new ApiError(404, 'No such step in your roadmap')

    // A stage is only finishable once everything before it is finished.
    //
    // Enforced here rather than only in the UI: greying out a button stops a
    // click, not a request. Without this, a member (or a stale tab) could
    // PATCH the last stage straight to 'completed' and "finish" a roadmap
    // they never walked, which would also make the completion score
    // meaningless.
    //
    // A stage's effective status is its row in career_roadmap_step_state when
    // one exists, and otherwise whatever the roadmap JSON was generated with
    // — the same merge loadActiveRoadmap does when it reads the plan back.
    if (parsed.data.status === 'completed' && index > 0) {
      const saved = await query<{ step_key: string; status: string }>(
        `SELECT step_key, status FROM career_roadmap_step_state WHERE roadmap_id = $1`,
        [active.rows[0].id],
      )
      const savedByKey = new Map(saved.rows.map((r) => [r.step_key, r.status]))
      const effective = (st: { stepKey?: string; status?: string }) =>
        savedByKey.get(String(st.stepKey)) ?? st.status

      // From index 1, never 0. Stage 0 is the "you are here" marker: it has no
      // completion control in the timeline, and the generator is allowed to
      // emit it as 'in_progress' rather than 'completed'
      // (see the prompt in ai.ts). Requiring it would deadlock the whole plan
      // with no way for the member to unstick it.
      const blocker = stages.slice(1, index).find((st) => effective(st) !== 'completed')
      if (blocker) {
        throw new ApiError(
          400,
          `Finish "${blocker.title ?? 'the earlier stage'}" first — stages are completed in order.`,
        )
      }
    }

    await query(
      `INSERT INTO career_roadmap_step_state (roadmap_id, step_key, status, completed_at)
       VALUES ($1, $2, $3, CASE WHEN $3 = 'completed' THEN now() ELSE NULL END)
       ON CONFLICT (roadmap_id, step_key) DO UPDATE
         SET status = $3,
             completed_at = CASE
               WHEN $3 <> 'completed' THEN NULL
               ELSE COALESCE(career_roadmap_step_state.completed_at, now())
             END`,
      [active.rows[0].id, req.params.stepKey, parsed.data.status],
    )

    // Completing a stage can be the thing that finishes the roadmap, and the
    // timeline says so immediately. Refresh here so the 'Goal Reached' badge
    // lands with that message instead of waiting for the member to happen to
    // open their own profile. Fire-and-forget on purpose: a badge is not
    // worth failing the member's save for, same as posts.routes.ts does.
    void refreshBadges(req.user!.sub)
    res.json(await loadActiveRoadmap(req.user!.sub))
  }),
)

// GET /api/career/roadmap/of/:userId — a mentor reading their mentee's plan.
//
// The gate is an accepted session between the two. Booking someone is what
// makes sharing your goals with them reasonable, so no separate consent step
// is needed — but a mentor cannot browse the roadmaps of students who never
// approached them, which is what makes this safe to expose at all. A roadmap
// holds someone's goals, skill gaps and dissatisfaction with their job.
careerRouter.get(
  '/roadmap/of/:userId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const menteeId = req.params.userId
    if (menteeId === req.user!.sub) {
      return res.json(await loadActiveRoadmap(req.user!.sub))
    }

    const allowed = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM mentorship_sessions
        WHERE mentor_id = $1 AND mentee_id = $2 AND status IN ('upcoming', 'past')`,
      [req.user!.sub, menteeId],
    )
    if (!allowed.rows[0].n) {
      throw new ApiError(403, 'You can view a roadmap once you have an accepted session with that member.')
    }

    const roadmap = await loadActiveRoadmap(menteeId)
    if (!roadmap) throw new ApiError(404, 'That member has not built a roadmap yet.')

    const who = await query<{ name: string; designation: string; company: string; photo: string | null }>(
      `SELECT name, designation, company, photo FROM users WHERE id = $1`,
      [menteeId],
    )
    const assessment = await query<{ support_preference: string; free_text: string; help_types: string[] }>(
      `SELECT support_preference, free_text, help_types FROM career_assessments
        WHERE user_id = $1 AND status = 'submitted' ORDER BY created_at DESC LIMIT 1`,
      [menteeId],
    )

    res.json({
      ...roadmap,
      member: {
        id: menteeId,
        name: who.rows[0]?.name ?? '',
        designation: who.rows[0]?.designation ?? '',
        company: who.rows[0]?.company ?? '',
        photo: who.rows[0]?.photo ?? undefined,
      },
      // What they asked for in their own words — the most useful thing a
      // mentor can read before a session, and not derivable from the stages.
      context: {
        supportPreference: assessment.rows[0]?.support_preference ?? '',
        note: assessment.rows[0]?.free_text ?? '',
        helpTypes: assessment.rows[0]?.help_types ?? [],
      },
    })
  }),
)

// GET /api/career/mentee-brief/:userId — the AI briefing a mentor reads
// before a session, and what the printed report is built from.
//
// Same gate as the roadmap: an accepted session between the two. The model
// is given the student's plan, skills, own words and session history, and
// returns structured insight — never free prose we would have to trust.
careerRouter.get(
  '/mentee-brief/:userId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const menteeId = req.params.userId
    const allowed = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM mentorship_sessions
        WHERE mentor_id = $1 AND mentee_id = $2 AND status IN ('upcoming', 'past')`,
      [req.user!.sub, menteeId],
    )
    if (!allowed.rows[0].n) {
      throw new ApiError(403, 'You can view a briefing once you have an accepted session with that member.')
    }

    const roadmap = await loadActiveRoadmap(menteeId)
    const who = await query<{
      name: string; designation: string; company: string; experience_years: number; expertise: string[]
    }>(
      `SELECT name, designation, company, experience_years, expertise FROM users WHERE id = $1`,
      [menteeId],
    )
    if (!who.rowCount) throw new ApiError(404, 'Member not found')

    const assessment = await query<{ free_text: string; help_types: string[] }>(
      `SELECT free_text, help_types FROM career_assessments
        WHERE user_id = $1 AND status = 'submitted' ORDER BY created_at DESC LIMIT 1`,
      [menteeId],
    )
    const past = await query<{ topic: string }>(
      `SELECT topic FROM mentorship_sessions
        WHERE mentor_id = $1 AND mentee_id = $2 AND status = 'past' ORDER BY created_at DESC LIMIT 5`,
      [req.user!.sub, menteeId],
    )

    const u = who.rows[0]
    const goal = (roadmap?.goal ?? { currentRole: '', targetRole: null }) as {
      currentRole: string; targetRole: string | null
    }
    const stages = ((roadmap?.stages ?? []) as Record<string, unknown>[]).map((s) => ({
      title: String(s.title ?? ''),
      status: String(s.status ?? 'upcoming'),
      durationWeeks: typeof s.durationWeeks === 'number' ? s.durationWeeks : null,
    }))

    try {
      const brief = await generateMenteeBrief({
        name: u.name,
        currentRole: u.designation,
        company: u.company,
        experienceYears: u.experience_years,
        skills: u.expertise ?? [],
        goal,
        timelineMonths: Number(roadmap?.timelineMonths ?? 0),
        hoursPerWeek: Number(roadmap?.hoursPerWeek ?? 0),
        stages,
        askedFor: assessment.rows[0]?.help_types ?? [],
        ownWords: assessment.rows[0]?.free_text ?? '',
        sessionsTogether: allowed.rows[0].n,
        pastTopics: past.rows.map((p) => p.topic),
      })
      res.json({ brief, generatedAt: new Date().toISOString() })
    } catch (err) {
      // A briefing is an extra, not the point of the page — the roadmap still
      // renders without it, so this reports the reason rather than 500ing.
      throw new ApiError(502, err instanceof Error ? err.message : 'Could not generate the briefing.')
    }
  }),
)

// GET /api/career/mentees — everyone this mentor has an accepted session
// with, plus where each one is on their roadmap. The mentor workspace list.
careerRouter.get(
  '/mentees',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query<{
      id: string; name: string; photo: string | null; designation: string; company: string
      sessions: number; last_session: Date | string | null; has_roadmap: boolean
      goal: unknown
    }>(
      `SELECT u.id, u.name, u.photo, u.designation, u.company,
              count(s.id)::int AS sessions,
              max(s.created_at) AS last_session,
              (r.id IS NOT NULL) AS has_roadmap,
              r.data -> 'goal' AS goal
         FROM mentorship_sessions s
         JOIN users u ON u.id = s.mentee_id
         LEFT JOIN career_roadmaps r ON r.user_id = u.id AND r.status = 'active'
        WHERE s.mentor_id = $1 AND s.status IN ('upcoming', 'past')
        GROUP BY u.id, u.name, u.photo, u.designation, u.company, r.id, r.data
        ORDER BY max(s.created_at) DESC`,
      [req.user!.sub],
    )
    res.json(
      rows.rows.map((r) => ({
        id: r.id,
        name: r.name,
        photo: r.photo ?? undefined,
        designation: r.designation,
        company: r.company,
        sessions: r.sessions,
        lastSessionAt: r.last_session ? new Date(r.last_session).toISOString() : null,
        hasRoadmap: r.has_roadmap,
        goal: (r.goal as { currentRole?: string; targetRole?: string } | null) ?? null,
      })),
    )
  }),
)

// ---------------------------------------------------------------------------
// Alumni services
// ---------------------------------------------------------------------------

const serviceSchema = z.object({
  serviceType: z.enum(SERVICE_TYPES),
  title: z.string().trim().max(120).optional().default(''),
  description: z.string().trim().max(1000).optional().default(''),
  tags: z.array(z.string().trim().max(40)).optional().default([]),
  pricingMode: z.enum(['free', 'paid', 'custom']).optional().default('free'),
  amount: z.number().int().min(0).max(1_000_000).optional(),
  pricingUnit: z.enum(['hour', 'session']).optional(),
})

// GET /api/career/services/mine — the caller's own listed services, for the
// "manage my services" panel (mentors only, but reading an empty list for a
// non-mentor is harmless).
careerRouter.get(
  '/services/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query<AlumniServiceRow>(
      `SELECT * FROM alumni_services WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user!.sub],
    )
    res.json(r.rows.map(mapAlumniService))
  }),
)

// POST /api/career/services — create a service. Gated on is_mentor: this
// reuses the existing mentor-verification trust bar rather than opening a
// second, unvetted tier of service providers.
careerRouter.post(
  '/services',
  requireAuth,
  asyncHandler(async (req, res) => {
    const isMentor = await query<{ is_mentor: boolean }>(`SELECT is_mentor FROM users WHERE id = $1`, [req.user!.sub])
    if (!isMentor.rows[0]?.is_mentor) {
      throw new ApiError(403, 'Only approved mentors can offer services. Apply to become a mentor from Mentorship first.')
    }
    const parsed = serviceSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const s = parsed.data
    if (s.pricingMode === 'paid' && s.amount === undefined) {
      throw new ApiError(400, 'A paid service needs an amount')
    }

    const ins = await query<AlumniServiceRow>(
      `INSERT INTO alumni_services (user_id, service_type, title, description, tags, pricing_mode, amount, pricing_unit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        req.user!.sub, s.serviceType, s.title, s.description, s.tags,
        s.pricingMode, s.pricingMode === 'paid' ? s.amount : null, s.pricingUnit ?? null,
      ],
    )
    res.status(201).json(mapAlumniService(ins.rows[0]))
  }),
)

// Spelled out rather than derived as `serviceSchema.partial()`.
//
// Zod's .partial() makes every key optional but KEEPS its .default(), so a
// body of `{ active: false }` parsed as
// `{ title: '', description: '', tags: [], pricingMode: 'free', active: false }`.
// Those defaults are values, not `undefined`, so the `?? cur.*` fallbacks below
// never fired and simply pausing a service silently wiped its title,
// description and tags and reset a paid listing to free — losing the mentor's
// price. Every field here is optional with no default, so an absent field
// really is absent and falls back to the stored row.
const serviceUpdateSchema = z.object({
  serviceType: z.enum(SERVICE_TYPES).optional(),
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().max(40)).optional(),
  pricingMode: z.enum(['free', 'paid', 'custom']).optional(),
  amount: z.number().int().min(0).max(1_000_000).optional(),
  pricingUnit: z.enum(['hour', 'session']).optional(),
  active: z.boolean().optional(),
})

// PATCH /api/career/services/:id — edit or activate/deactivate my own service.
careerRouter.patch(
  '/services/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await query<AlumniServiceRow>(
      `SELECT * FROM alumni_services WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.sub],
    )
    if (!existing.rowCount) throw new ApiError(404, 'Service not found')

    const parsed = serviceUpdateSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const cur = existing.rows[0]
    const body = parsed.data

    // Each field is resolved explicitly rather than by spreading the body over
    // the row: the row is snake_case and the body camelCase, so a merged object
    // always found the row's `pricing_mode` first and silently ignored an
    // incoming `pricingMode` — switching a service free -> paid did nothing.
    const pricingMode = body.pricingMode ?? cur.pricing_mode
    const amount = body.amount ?? cur.amount
    const pricingUnit = body.pricingUnit ?? cur.pricing_unit
    if (pricingMode === 'paid' && (amount === null || amount === undefined)) {
      throw new ApiError(400, 'A paid service needs an amount')
    }

    const upd = await query<AlumniServiceRow>(
      `UPDATE alumni_services SET
         title = $2, description = $3, tags = $4, pricing_mode = $5, amount = $6,
         pricing_unit = $7, active = $8, service_type = $9, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        body.title ?? cur.title,
        body.description ?? cur.description,
        body.tags ?? cur.tags,
        pricingMode,
        pricingMode === 'paid' ? amount : null,
        pricingMode === 'free' ? null : pricingUnit,
        body.active ?? cur.active,
        // service_type was accepted by the schema but never written, so
        // re-typing a service from the manage panel silently did nothing.
        body.serviceType ?? cur.service_type,
      ],
    )
    res.json(mapAlumniService(upd.rows[0]))
  }),
)

// DELETE /api/career/services/:id — permanently remove one of my own
// services.
//
// Scoped by user_id in the WHERE clause, so the id in the URL can only ever
// name a service the caller owns — a mentor can never delete someone else's.
//
// Sessions already booked from this service survive: the FK is
// ON DELETE SET NULL (schema.sql), and mentorship_sessions snapshots its own
// `is_paid` and `price` at booking time, so unlinking never rewrites what a
// mentee was quoted. The count of those sessions is returned so the UI can
// tell the mentor what deleting actually affects instead of guessing.
//
// Deactivating (PATCH active:false) stays the reversible option; this is the
// permanent one.
careerRouter.delete(
  '/services/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await withTransaction(async (client) => {
      const owned = await client.query(
        `SELECT id FROM alumni_services WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [req.params.id, req.user!.sub],
      )
      if (!owned.rowCount) throw new ApiError(404, 'Service not found')

      // Live bookings only. The count is shown to the alumnus as "N booked
      // sessions keep their original price", which is reassurance about money
      // still owed — a declined session was never a booking, and a past one is
      // already settled. Counting those overstated their live commitments.
      const linked = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM mentorship_sessions
          WHERE service_id = $1 AND status IN ('requested', 'upcoming')`,
        [req.params.id],
      )
      await client.query(`DELETE FROM alumni_services WHERE id = $1`, [req.params.id])
      return { unlinkedSessions: linked.rows[0]?.n ?? 0 }
    })
    res.json(result)
  }),
)

// GET /api/career/services/matched — deterministic "services matched to your
// roadmap": additive point-scoring over active services, same style as the
// existing lib/matching.ts heuristic, just server-side. No embeddings.
careerRouter.get(
  '/services/matched',
  requireAuth,
  asyncHandler(async (req, res) => {
    const roadmap = await loadActiveRoadmap(req.user!.sub)
    const assessmentRow = await query<{ support_preference: string }>(
      `SELECT support_preference FROM career_assessments WHERE user_id = $1 AND status = 'submitted'
       ORDER BY created_at DESC LIMIT 1`,
      [req.user!.sub],
    )
    const supportPreference = assessmentRow.rows[0]?.support_preference ?? ''

    const currentStage = Array.isArray(roadmap?.stages)
      ? (roadmap.stages as Record<string, unknown>[]).find((s) => s.status === 'in_progress') ??
        (roadmap.stages as Record<string, unknown>[]).find((s) => s.status === 'upcoming')
      : undefined
    const stageServiceIds = new Set(Array.isArray(currentStage?.relevantServiceIds) ? currentStage.relevantServiceIds as string[] : [])

    // What the member is working on right now, as matchable words. Stages
    // carry no tag field of their own, so the title is the only signal —
    // "Learn LLMs and RAG" should favour a service tagged llm or rag over one
    // tagged with a skill they already have.
    const stageTags = String(currentStage?.title ?? '')
      .toLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((w) => w.length > 2)

    const me = await query<{ expertise: string[] }>(`SELECT expertise FROM users WHERE id = $1`, [req.user!.sub])
    const myTags = (me.rows[0]?.expertise ?? []).map((t) => t.toLowerCase())

    const services = await query<AlumniServiceRow & { sessions_conducted: number | null }>(
      `SELECT s.*, u.sessions_conducted, u.name AS provider_name, u.photo AS provider_photo,
              u.designation AS provider_designation, u.company AS provider_company
         FROM alumni_services s JOIN users u ON u.id = s.user_id
        WHERE s.active AND s.user_id <> $1`,
      [req.user!.sub],
    )

    // "Free help only" is an answer, not a preference to be outweighed: a paid
    // service is excluded outright rather than docked a few points, which had
    // let paid listings still top the list.
    const wantsFree = supportPreference === 'free_only'
    const eligible = wantsFree ? services.rows.filter((s) => s.pricing_mode === 'free') : services.rows

    const scored = eligible.map((s) => {
      let score = 0
      if (stageServiceIds.has(s.id)) score += 40
      const tags = (s.tags ?? []).map((t) => t.toLowerCase())
      score += tags.filter((t) => stageTags.includes(t)).length * 15
      score += tags.filter((t) => myTags.includes(t)).length * 10
      if (s.pricing_mode === 'free') score += 5
      score += Math.min(s.sessions_conducted ?? 0, 10) * 0.5
      return { s, score }
    })
    scored.sort((a, b) => b.score - a.score)
    res.json(scored.slice(0, 6).map((x) => mapAlumniService(x.s)))
  }),
)

// GET /api/career/services — the full marketplace ("View all services"),
// newest first, no scoring.
careerRouter.get(
  '/services',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query<AlumniServiceRow>(
      `SELECT s.*, u.name AS provider_name, u.photo AS provider_photo,
              u.designation AS provider_designation, u.company AS provider_company
         FROM alumni_services s JOIN users u ON u.id = s.user_id
        WHERE s.active AND s.user_id <> $1
        ORDER BY s.created_at DESC`,
      [req.user!.sub],
    )
    res.json(r.rows.map(mapAlumniService))
  }),
)

// ---------------------------------------------------------------------------
// People from Rooman who can help you: resolve the current roadmap's
// relevant alumni ids into displayable cards with a reason.
// ---------------------------------------------------------------------------

careerRouter.get(
  '/alumni-help',
  requireAuth,
  asyncHandler(async (req, res) => {
    const roadmap = await loadActiveRoadmap(req.user!.sub)
    if (!roadmap) return res.json([])
    const stages = roadmap.stages as Record<string, unknown>[]
    const relevant = new Map<string, { reason: string }>()
    for (const s of stages) {
      if (s.status === 'completed') continue
      const ids = Array.isArray(s.relevantAlumniIds) ? (s.relevantAlumniIds as string[]) : []
      for (const id of ids) if (!relevant.has(id)) relevant.set(id, { reason: String(s.title ?? '') })
    }
    if (relevant.size === 0) return res.json([])

    const me = await query<{ designation: string }>(`SELECT designation FROM users WHERE id = $1`, [req.user!.sub])
    const similarPaths = await findSimilarPathAlumni(me.rows[0]?.designation ?? '', normalizeRole((roadmap.goal as { targetRole?: string })?.targetRole ?? ''))
    const similarPathIds = new Set(similarPaths.map((p) => p.userId))

    const rows = await query<{
      id: string; name: string; photo: string | null; designation: string; company: string
      expertise: string[]; is_mentor: boolean
    }>(
      `SELECT id, name, photo, designation, company, expertise, is_mentor FROM users WHERE id = ANY($1::text[])`,
      [[...relevant.keys()]],
    )
    res.json(
      rows.rows.map((u) => ({
        id: u.id,
        name: u.name,
        photo: u.photo ?? undefined,
        designation: u.designation,
        company: u.company,
        expertise: (u.expertise ?? []).slice(0, 4),
        isMentor: u.is_mentor,
        reason: relevant.get(u.id)?.reason ?? '',
        similarPath: similarPathIds.has(u.id),
      })),
    )
  }),
)
