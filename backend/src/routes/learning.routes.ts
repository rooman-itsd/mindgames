import { Router } from 'express'
import { z } from 'zod'
import type pg from 'pg'
import { query, withTransaction } from '../db/pool.js'
import { requireAuth } from '../auth/middleware.js'
import { ApiError, asyncHandler } from '../http.js'
import { pushNotification } from '../notify.js'
import { HTTP_URL, HTTP_URL_MESSAGE } from '../validation.js'
import { workableStages } from '../careerProgress.js'
import { loadRoadmapCore, type LoadedRoadmap } from '../roadmap.js'
import { RESOURCE_SELECT } from '../resourceQueries.js'
import {
  afterAtParam,
  cursorRowSql,
  PROJECT_ABOUT_MIN,
  WHY_HELPED_MIN,
  PROJECT_DIFFICULTIES,
  REPORTS_TO_HIDE,
  SHARES_PER_DAY,
  SHARE_KINDS,
  DESIGNATION_KEY_SQL,
  cleanTags,
  designationKey,
  escapeLike,
  normalizeTag,
  normalizeUrl,
  pageLimit,
  parseList,
  toPrefixQuery,
  toResourceKind,
  topicKey,
  stageMatchTerms,
  type ShareKind,
} from '../learning.js'
import {
  mapCareerResource,
  mapLearningShare,
  mapStageShare,
  type CareerResourceRow,
  type LearningShareRow,
} from '../mappers.js'
import { EMBED_MODEL, EMBED_PROFILE } from '../embeddings.js'
import { kickLearningEmbed, vectorsReady } from '../learningEmbed.js'

/**
 * The Learning Resources page.
 *
 * Its whole premise is that the network teaches itself: an alum shares what
 * helped them get through a stage, and every member on that stage sees it with
 * the alum's name on it and a way to reach them. Nothing here is written by a
 * machine: every item is a member's own share, and its standing is the members
 * who said it helped them (with 1–5 stars). The only machine part is matching
 * — which stages a share is close to in meaning, from embeddings computed in
 * the background (learningEmbed.ts), never while a page loads.
 *
 * Sized for lakhs of members: every read is the viewer's own rows, or one
 * topic's top-N ordered by a counter kept on the row, always with a LIMIT.
 */
export const learningRouter = Router()

/** A share with its author and the viewer's own relationship to it. The two
 *  per-viewer lookups are index probes (both primary keys), one per row. */
const SHARE_SELECT = `
  SELECT s.id, s.topic_key, s.kind, s.title, s.url, s.why_helped, s.about, s.skills, s.difficulty,
         s.est_hours, s.helped_count, s.saved_count, s.hidden, s.created_at,
         -- Tags as typed, in the share's own order (8 at most, each a PK probe).
         (SELECT array_agg(coalesce(t.label, x.tag) ORDER BY x.i)
            FROM unnest(s.skills) WITH ORDINALITY AS x(tag, i)
            LEFT JOIN learning_tags t ON t.tag = x.tag) AS skill_labels,
         s.shared_by, u.name AS sharer_name, u.designation AS sharer_designation,
         u.company AS sharer_company, u.is_mentor AS sharer_is_mentor,
         s.rating_sum, s.rating_count, h.rating AS my_rating, s.audience,
         (h.user_id IS NOT NULL) AS i_helped, cr.id AS my_saved_id
    FROM learning_shares s
    JOIN users u ON u.id = s.shared_by
    LEFT JOIN learning_share_helped h ON h.share_id = s.id AND h.user_id = $1
    LEFT JOIN career_resources cr ON cr.share_id = s.id AND cr.user_id = $1`

/**
 * Whether the viewer ($1) may see share s: the sharer chose its audience.
 * 'everyone' → all members; 'connections' → the sharer's accepted connections
 * (and the sharer). An 'everyone' share — the default — never reaches the
 * connection check; for the rest it is one probe of the connection pair.
 */
const SHARE_AUDIENCE_OK = `
  (s.audience = 'everyone' OR s.shared_by = $1 OR EXISTS (
     SELECT 1 FROM connections c
      WHERE c.status = 'accepted'
        AND ((c.requester_id = $1 AND c.addressee_id = s.shared_by)
          OR (c.addressee_id = $1 AND c.requester_id = s.shared_by))))`

/** One workable stage of the caller's roadmap, with the shared topic it maps
 *  to and the alumni the roadmap matched to it. */
interface StageTopic {
  stepKey: string
  title: string
  status: string
  topicKey: string
  alumniIds: string[]
}

interface MyPlan {
  roadmap: LoadedRoadmap
  targetRole: string | null
  stages: StageTopic[]
  /** The stage the member is working on: the first workable one not yet
   *  completed, or the last when every one is done. */
  current: StageTopic | null
}

/** The caller's roadmap reduced to what this page needs, or null without one. */
async function loadPlan(userId: string): Promise<MyPlan | null> {
  const roadmap = await loadRoadmapCore(userId)
  if (!roadmap) return null
  const targetRole = (roadmap.goal as { targetRole?: string | null })?.targetRole ?? null
  const stages = workableStages(roadmap.stages)
    .filter((s) => typeof s.title === 'string' && s.title.trim())
    .map((s) => ({
      stepKey: String(s.stepKey),
      title: String(s.title),
      status: String(s.status ?? 'upcoming'),
      topicKey: topicKey(targetRole, String(s.title)),
      alumniIds: Array.isArray(s.relevantAlumniIds) ? (s.relevantAlumniIds as string[]) : [],
    }))
  const current = stages.find((s) => s.status !== 'completed') ?? stages[stages.length - 1] ?? null
  return { roadmap, targetRole, stages, current }
}

/**
 * Keeps the member registered on exactly the topics their roadmap has now.
 *
 * Two things depend on this: a topic row has to exist before anything can be
 * shared against it, and member_count is what tells the nudge job where people
 * are waiting for help. So it adds them to new topics AND takes them off topics
 * their roadmap no longer has (a regenerated or deleted plan) — otherwise
 * "4 members are on this step" would count everyone who was ever there.
 * Every statement is idempotent: a repeat page view writes nothing. The three
 * run as one transaction, so a failure part-way can't leave the member taken
 * off their old stages without being put on the new ones.
 */
async function registerTopics(plan: MyPlan | null, userId: string): Promise<void> {
  // Sorted: the member_count trigger locks each topic row it moves, and two
  // members sharing topics must take those locks in the same order, or their
  // transactions could deadlock waiting on each other.
  const keys = plan ? [...new Set(plan.stages.map((s) => s.topicKey))].sort() : []
  await withTransaction(async (client) => {
    // Off any topic not in the current plan — one walk of
    // idx_learning_topic_members_user over this member's own handful of rows.
    // member_count follows automatically: a trigger in schema.sql keeps it.
    await client.query(
      `DELETE FROM learning_topic_members
        WHERE user_id = $2 AND NOT (topic_key = ANY($1::text[]))`,
      [keys, userId],
    )
    if (!plan || !keys.length) return
    const labels = keys.map((k) => plan.stages.find((s) => s.topicKey === k)!.title.slice(0, 200))
    // The role is stored by the same rule a member's job title is compared with
    // (designationKey), because the nudge job and the contribute list match
    // members' designations against it.
    const role = designationKey(plan.targetRole) || 'general'
    const created = await client.query(
      `INSERT INTO learning_topics (topic_key, role_label, stage_label)
       SELECT k, $2, label FROM unnest($1::text[], $3::text[]) AS t(k, label)
       ON CONFLICT (topic_key) DO NOTHING`,
      [keys, role.slice(0, 120), labels],
    )
    // A stage nobody had before: embed it now, so its Related list is by
    // meaning from the first visits rather than after the next tick.
    if (created.rowCount) kickLearningEmbed()
    // The pair is the primary key, so only a member's FIRST arrival on a topic
    // inserts a row — and only an inserted row moves member_count (the trigger)
    // — so a repeat page view writes nothing and nobody is counted twice.
    await client.query(
      `INSERT INTO learning_topic_members (topic_key, user_id)
       SELECT k, $2 FROM unnest($1::text[]) AS t(k)
       ON CONFLICT DO NOTHING`,
      [keys, userId],
    )
  })
}

function roadmapSummary(plan: MyPlan) {
  const goal = (plan.roadmap.goal ?? {}) as { currentRole?: string; targetRole?: string | null }
  return {
    roadmapId: plan.roadmap.roadmapId,
    goal: { currentRole: goal.currentRole ?? '', targetRole: goal.targetRole ?? null },
    timelineMonths: plan.roadmap.timelineMonths,
    hoursPerWeek: plan.roadmap.hoursPerWeek,
    // Every stage, bookends included, so the page can apply the same
    // workable-stage rule as the roadmap itself.
    stages: plan.roadmap.stages.map((s) => ({
      stepKey: String(s.stepKey),
      title: String(s.title ?? ''),
      status: String(s.status ?? 'upcoming'),
    })),
  }
}

/** Alumni who can help with a stage: the ones the roadmap matched to it, plus
 *  members already in the target role. This is what a member sees when nobody
 *  has shared for their stage yet — an empty page would be a dead end, and the
 *  people are the point. */
async function alumniForStage(me: string, stage: StageTopic, targetRole: string | null, limit = 6) {
  // Two bounded lookups glued together, never one OR over all users: an OR of
  // "id in the matched list" and "title is the role" cannot use one index, so
  // Postgres read the whole users table (measured: 68 ms at 3 lakh users, on
  // every empty-stage view). Here the first half is a primary-key lookup of the
  // handful the roadmap matched, and the second reads at most $4 rows off
  // idx_users_designation_key — mentors first, in index order. Share counts
  // are computed only for the dozen or so people that survive.
  const role = targetRole ? designationKey(targetRole) : ''
  const r = await query<{
    id: string; name: string; designation: string; company: string; is_mentor: boolean
    shares: number; matched: boolean
  }>(
    `WITH cand AS (
       (SELECT u.id, true AS matched FROM users u
         WHERE u.id = ANY($2::text[]) AND u.id <> $1 AND NOT u.is_admin
         LIMIT $4)
       UNION ALL
       (SELECT u.id, false AS matched FROM users u
         WHERE $3 <> '' AND ${DESIGNATION_KEY_SQL} = $3
           AND u.id <> $1 AND NOT u.is_admin AND NOT (u.id = ANY($2::text[]))
         ORDER BY ${DESIGNATION_KEY_SQL}, u.is_mentor DESC, u.id
         LIMIT $4))
     SELECT u.id, u.name, u.designation, u.company, u.is_mentor, c.matched,
            (SELECT count(*)::int FROM learning_shares s
              WHERE s.shared_by = u.id AND NOT s.hidden) AS shares
       FROM cand c JOIN users u ON u.id = c.id
      ORDER BY c.matched DESC, u.is_mentor DESC, shares DESC, u.id
      LIMIT $4`,
    [me, stage.alumniIds, role, limit],
  )
  return r.rows.map((a) => ({
    id: a.id,
    name: a.name,
    designation: a.designation,
    company: a.company,
    isMentor: a.is_mentor,
    sharesCount: a.shares,
  }))
}

// How close in meaning a share must be to a stage (cosine similarity: 1 the
// same meaning, ~0 unrelated). Every model spreads these differently, so the
// cut-offs belong to the model — EMBED_PROFILE (embeddings.ts), measured with
// `npm run learning:calibrate`. Read once at start; numbers, never user input,
// so they are safe to place in the SQL text.
const { relatedMin: RELATED_MIN, relatedWithTagMin: RELATED_WITH_TAG_MIN, sameStageMin: SAME_STAGE_MIN } = EMBED_PROFILE
/** Nearest shares read from the embedding index per stage view. */
const NEAREST = 100

/**
 * The shares for one stage: first those filed under this exact stage, then
 * Related — shares from any roadmap whose MEANING is close to the stage.
 *
 * Never shown: the viewer's own shares (they are in "I've shared"), hidden
 * ones, and shares filed under the viewer's OTHER stages — those appear when
 * the viewer reaches that stage, not early in this one.
 *
 * Cost per view: one primary-key read for the stage's embedding, one HNSW
 * index scan for its 100 nearest shares, and one topic-index read — bounded,
 * however many shares exist. Until the stage is embedded (seconds after it
 * first appears), or without pgvector, a rule-based match by skill tag stands in.
 */
async function topShares(me: string, stage: StageTopic, otherTopicKeys: string[], limit: number, offset = 0) {
  const { tags } = stageMatchTerms(stage.title)
  const vector = (await vectorsReady())
    ? (
        await query<{ v: string }>(
          `SELECT embedding::text AS v FROM learning_topics
            WHERE topic_key = $1 AND embed_model = $2 AND embedding IS NOT NULL`,
          [stage.topicKey, EMBED_MODEL],
        )
      ).rows[0]?.v
    : undefined

  if (!vector) {
    const r = await query<LearningShareRow>(
      `${SHARE_SELECT}
        WHERE NOT s.hidden AND s.shared_by <> $1 AND ${SHARE_AUDIENCE_OK}
          AND (s.topic_key = $2
               OR ($3::text[] <> '{}' AND s.skills && $3::text[]
                   AND NOT (s.topic_key = ANY($4::text[]))))
        ORDER BY CASE WHEN s.topic_key = $2 THEN 0 ELSE 1 END,
                 s.helped_count DESC, s.created_at DESC, s.id
        LIMIT $5 OFFSET $6`,
      [me, stage.topicKey, tags, otherTopicKeys, limit, offset],
    )
    return r.rows.map((row) => mapStageShare(row, stage.topicKey))
  }

  const rows = await withTransaction(async (client) => {
    // The HNSW index returns at most ef_search rows per scan (default 40);
    // this view reads the nearest 100. Scoped to this transaction only.
    await client.query(`SET LOCAL hnsw.ef_search = ${NEAREST}`)
    const r = await client.query<LearningShareRow>(
      `WITH near AS (
         SELECT id FROM learning_shares
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> $3::halfvec
          LIMIT ${NEAREST}),
       cand AS (
         SELECT id, 0 AS tier FROM (
           SELECT id FROM learning_shares
            WHERE topic_key = $2 AND NOT hidden AND shared_by <> $1
            ORDER BY helped_count DESC, created_at DESC, id
            LIMIT $7) same
         UNION ALL
         SELECT id, 1 FROM near)
       ${SHARE_SELECT}
       JOIN cand c ON c.id = s.id
       CROSS JOIN LATERAL (
         SELECT 1 - (s.embedding <=> $3::halfvec) AS sim,
                ($4::text[] <> '{}' AND s.skills && $4::text[]) AS tag_hit) m
      WHERE NOT s.hidden AND s.shared_by <> $1 AND ${SHARE_AUDIENCE_OK}
        AND CASE WHEN c.tier = 0
                 THEN m.sim IS NULL OR m.sim >= ${SAME_STAGE_MIN} OR m.tag_hit
                 ELSE s.topic_key <> $2 AND NOT (s.topic_key = ANY($5::text[]))
                      AND (m.sim >= ${RELATED_MIN} OR (m.tag_hit AND m.sim >= ${RELATED_WITH_TAG_MIN}))
            END
      ORDER BY c.tier,
               CASE WHEN c.tier = 0 THEN s.helped_count END DESC NULLS LAST,
               m.sim + CASE WHEN m.tag_hit THEN 0.1 ELSE 0 END DESC,
               s.created_at DESC, s.id
      LIMIT $6 OFFSET $8`,
      [me, stage.topicKey, vector, tags, otherTopicKeys, limit, offset + limit, offset],
    )
    return r.rows
  })
  return rows.map((row) => mapStageShare(row, stage.topicKey))
}

/** Resources assigned to the caller, newest first, keyset-paged by the last id
 *  (and where it was seen, in case it has been deleted since). */
async function assignedPage(me: string, limit: number, after: string | null, afterAt: string | null) {
  const r = await query<CareerResourceRow>(
    `WITH cursor_row AS (${cursorRowSql('career_resources', '$2', '$4')})
     ${RESOURCE_SELECT}
      WHERE r.assigned_to = $1 AND r.user_id <> $1
        AND ($2::text IS NULL OR (r.created_at, r.id) < (SELECT created_at, id FROM cursor_row))
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT $3`,
    [me, after, limit, afterAt],
  )
  return r.rows.map(mapCareerResource)
}

/** The other side of assignedPage: what the caller, as a mentor, gave to
 *  mentees — newest first, same keyset paging. Reads idx_career_resources_given. */
async function givenPage(me: string, limit: number, after: string | null, afterAt: string | null) {
  const r = await query<CareerResourceRow>(
    `WITH cursor_row AS (${cursorRowSql('career_resources', '$2', '$4')})
     ${RESOURCE_SELECT}
      WHERE r.user_id = $1 AND r.assigned_to IS NOT NULL AND r.assigned_to <> r.user_id
        AND ($2::text IS NULL OR (r.created_at, r.id) < (SELECT created_at, id FROM cursor_row))
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT $3`,
    [me, after, limit, afterAt],
  )
  return r.rows.map(mapCareerResource)
}

function afterParam(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

/** Offset for the short, bounded lists (one topic's shares). Capped, so it can
 *  never be used to walk a large table. */
function offsetParam(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 200) : 0
}

// ---------------------------------------------------------------------------
// GET /api/learning/overview — the page frame, in one call: the roadmap and
// its stages, the support preference, the tab counts, and whether this member
// is someone who can contribute. A handful of indexed reads, all scoped to the
// caller. Each tab fetches its own list when opened.
// ---------------------------------------------------------------------------
learningRouter.get(
  '/overview',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const [plan, pref, counts] = await Promise.all([
      loadPlan(me),
      query<{ support_preference: string }>(
        `SELECT support_preference FROM career_assessments
          WHERE user_id = $1 AND status = 'submitted'
          ORDER BY created_at DESC LIMIT 1`,
        [me],
      ),
      query<{ saved: number; assigned: number; shared: number }>(
        // saved = exactly what the Saved Resources list shows (GET
        // /career-resources?scope=saved): the member's own rows, minus any
        // they assigned to someone else as a mentor.
        `SELECT (SELECT count(*)::int FROM career_resources
                  WHERE user_id = $1 AND assigned_to IS NULL) AS saved,
                (SELECT count(*)::int FROM career_resources
                  WHERE assigned_to = $1 AND user_id <> $1) AS assigned,
                (SELECT count(*)::int FROM learning_shares
                  WHERE shared_by = $1 AND NOT hidden) AS shared`,
        [me],
      ),
    ])
    await registerTopics(plan, me)

    res.json({
      roadmap: plan ? roadmapSummary(plan) : null,
      currentStepKey: plan?.current?.stepKey ?? null,
      supportPreference: pref.rows[0]?.support_preference || null,
      counts: {
        // Each count matches exactly one tab.
        saved: counts.rows[0].saved,
        assigned: counts.rows[0].assigned,
        shared: counts.rows[0].shared,
      },
    })
  }),
)

// GET /api/learning/stage?stepKey=&offset= — what alumni shared for one stage.
//
// When nobody has shared yet this returns the alumni who can help with that
// stage instead, so the member always has someone to ask. Defaults to the
// stage they are on.
learningRouter.get(
  '/stage',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const plan = await loadPlan(me)
    if (!plan?.current) {
      res.json({ stepKey: null, shares: [], alumni: [], memberCount: 0 })
      return
    }
    const wanted = typeof req.query.stepKey === 'string' ? req.query.stepKey : plan.current.stepKey
    const stage = plan.stages.find((s) => s.stepKey === wanted)
    if (!stage) throw new ApiError(404, 'No such stage in your roadmap')

    const offset = offsetParam(req.query.offset)
    const others = plan.stages.filter((s) => s.topicKey !== stage.topicKey).map((s) => s.topicKey)
    const shares = await topShares(me, stage, others, pageLimit(req.query.limit), offset)
    // Only when there is nothing to show, and only on the first page: the
    // people are the fallback, not a permanent second list.
    const alumni = shares.length === 0 && offset === 0 ? await alumniForStage(me, stage, plan.targetRole) : []
    const topic = await query<{ member_count: number }>(
      `SELECT member_count FROM learning_topics WHERE topic_key = $1`,
      [stage.topicKey],
    )

    res.json({
      stepKey: stage.stepKey,
      stageTitle: stage.title,
      shares,
      alumni,
      memberCount: topic.rows[0]?.member_count ?? 0,
    })
  }),
)

// GET /api/learning/assigned?after= — everything mentors assigned to me.
learningRouter.get(
  '/assigned',
  requireAuth,
  asyncHandler(async (req, res) => {
    const after = afterParam(req.query.after)
    res.json(
      await assignedPage(req.user!.sub, pageLimit(req.query.limit), after, after ? afterAtParam(req.query.afterAt) : null),
    )
  }),
)

// GET /api/learning/given?after= — what I gave my mentees as their mentor
// (before a session, after it, or directly), each with who it went to and
// whether they have sent work back. Shown under "I've shared".
learningRouter.get(
  '/given',
  requireAuth,
  asyncHandler(async (req, res) => {
    const after = afterParam(req.query.after)
    res.json(
      await givenPage(req.user!.sub, pageLimit(req.query.limit), after, after ? afterAtParam(req.query.afterAt) : null),
    )
  }),
)

// GET /api/learning/contribute — the stages this member can share for, each
// with how many members are waiting and whether anything is shared yet.
//
// Anyone can share for any stage; this list is what the share form offers and
// what the "help someone behind you" strip suggests. Three kinds, in this order:
//   passed  — a stage of their own roadmap they completed: they have just been
//             through it, the best person to ask
//   role    — a stage leading to the role they already hold
//   mine    — a stage of their own roadmap they are on now (so "Been through
//             this stage? Share…" works on every stage they can see)
// Only passed/role ones are offered as "members are waiting — can you help?".
learningRouter.get(
  '/contribute',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const [plan, who] = await Promise.all([
      loadPlan(me),
      query<{ designation: string }>(`SELECT designation FROM users WHERE id = $1`, [me]),
    ])
    const role = designationKey(who.rows[0]?.designation)

    // Topics this member's own role leads to, which they have not been asked
    // about through their own roadmap. Bounded: the most-wanted few.
    const byRole = role
      ? await query<{ topic_key: string; stage_label: string; member_count: number; shares: number }>(
          `SELECT t.topic_key, t.stage_label, t.member_count,
                  (SELECT count(*)::int FROM learning_shares s
                    WHERE s.topic_key = t.topic_key AND NOT s.hidden) AS shares
             FROM learning_topics t
            WHERE t.role_label = $1 AND t.member_count > 0
            ORDER BY t.member_count DESC
            LIMIT 12`,
          [role],
        )
      : { rows: [] as { topic_key: string; stage_label: string; member_count: number; shares: number }[] }

    const mine = plan
      ? await query<{ topic_key: string; member_count: number; shares: number }>(
          `SELECT t.topic_key, t.member_count,
                  (SELECT count(*)::int FROM learning_shares s
                    WHERE s.topic_key = t.topic_key AND NOT s.hidden) AS shares
             FROM learning_topics t WHERE t.topic_key = ANY($1::text[])`,
          [plan.stages.map((s) => s.topicKey)],
        )
      : { rows: [] as { topic_key: string; member_count: number; shares: number }[] }

    const stats = new Map(
      [...byRole.rows, ...mine.rows].map((r) => [r.topic_key, { members: r.member_count, shares: r.shares }]),
    )
    type Reason = 'passed' | 'role' | 'mine'
    const seen = new Set<string>()
    const stages: {
      topicKey: string; stepKey: string | null; title: string
      reason: Reason; membersWaiting: number; sharesCount: number
    }[] = []
    const push = (topicKey: string, stepKey: string | null, title: string, reason: Reason) => {
      if (seen.has(topicKey)) return
      seen.add(topicKey)
      const st = stats.get(topicKey)
      stages.push({ topicKey, stepKey, title, reason, membersWaiting: st?.members ?? 0, sharesCount: st?.shares ?? 0 })
    }

    for (const s of plan?.stages ?? []) if (s.status === 'completed') push(s.topicKey, s.stepKey, s.title, 'passed')
    for (const r of byRole.rows) push(r.topic_key, null, r.stage_label, 'role')
    for (const s of plan?.stages ?? []) push(s.topicKey, s.stepKey, s.title, 'mine')

    // Where help is most needed first: passed/role gaps, then by members
    // waiting; the member's own current stages last.
    const rank = (s: (typeof stages)[number]) => (s.reason === 'mine' ? 2 : s.sharesCount === 0 ? 0 : 1)
    stages.sort((a, b) => rank(a) - rank(b) || b.membersWaiting - a.membersWaiting)
    res.json({ stages: stages.slice(0, 20) })
  }),
)

// GET /api/learning/mine?after= — what I have shared with the network.
learningRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const after = afterParam(req.query.after)
    const r = await query<LearningShareRow>(
      `WITH cursor_row AS (${cursorRowSql('learning_shares', '$2', '$4')})
       ${SHARE_SELECT}
        WHERE s.shared_by = $1
          AND ($2::text IS NULL OR (s.created_at, s.id) < (SELECT created_at, id FROM cursor_row))
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT $3`,
      [me, after, pageLimit(req.query.limit), after ? afterAtParam(req.query.afterAt) : null],
    )
    res.json(r.rows.map(mapLearningShare))
  }),
)

// GET /api/learning/browse?q=&tags=&types=&difficulty=&after= — the "All
// Resources" tab: everything shared across the whole network, roadmap or not,
// narrowed by the search box and the Filter-by panel.
//
// One query for every combination. Within a filter group any choice matches
// (AWS or Python); across groups all must (skill AND type AND difficulty).
// Each condition is index-backed — skills by GIN, type and difficulty by
// partial btree, the text by GIN — and an empty group is passed as NULL so it
// drops out entirely. Most-helped first, 20 a page, keyset-paged from the last
// item's live (helped_count, created_at, id) so a page never repeats or skips.
learningRouter.get(
  '/browse',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const text = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : ''
    const tsq = text ? toPrefixQuery(text) : null
    // Typed something with no searchable word in it ("?!"): nothing can match.
    if (text && !tsq) {
      res.json([])
      return
    }
    const tags = parseList(req.query.tags).map(normalizeTag).filter(Boolean)
    const types = parseList(req.query.types, SHARE_KINDS)
    const levels = parseList(req.query.difficulty, PROJECT_DIFFICULTIES)
    const after = afterParam(req.query.after)
    // The last item's position as the client saw it — the paging cursor (see
    // cursor_row below). Ignored unless both are valid.
    const helpedRaw = Number(req.query.afterHelped)
    const afterHelped = after && Number.isInteger(helpedRaw) && helpedRaw >= 0 ? helpedRaw : null
    const atRaw = typeof req.query.afterAt === 'string' ? req.query.afterAt : ''
    const afterAt = after && afterHelped !== null && !Number.isNaN(Date.parse(atRaw)) ? atRaw : null

    const r = await query<LearningShareRow>(
      // The cursor is the position the client SAW the last item at ($8, $9,
      // $6) — not that item's live row. Its helped_count can change between
      // pages: if it dropped, a cursor read from the live row would sit lower
      // than what was shown, and items between the two would be skipped. The
      // seen position also survives the item being deleted. The live row is
      // only the fallback for a client that sent no position.
      //
      // created_at never changes, so it is read from the live row while that
      // exists — exact to the microsecond. The client's copy is only
      // millisecond-precise, and comparing against it could skip a second
      // item with the same count from the same millisecond. Only when the row
      // has been deleted does the client's timestamp stand in, rounded UP to
      // the end of its millisecond so nothing is skipped (at worst a
      // neighbour from that millisecond is sent again; the client drops
      // duplicates by id).
      `WITH cursor_row AS (
         SELECT $8::int AS helped_count,
                COALESCE((SELECT created_at FROM learning_shares WHERE id = $6),
                         $9::timestamptz + interval '999 microseconds') AS created_at,
                $6::text AS id
          WHERE $8::int IS NOT NULL AND $9::timestamptz IS NOT NULL
         UNION ALL
         SELECT helped_count, created_at, id FROM learning_shares
          WHERE id = $6 AND ($8::int IS NULL OR $9::timestamptz IS NULL)
         LIMIT 1)
       ${SHARE_SELECT}
        -- Never the viewer's own shares: those live in "I've shared", with who
        -- they went to — seeing them again here read as someone else's.
        WHERE NOT s.hidden AND s.shared_by <> $1 AND ${SHARE_AUDIENCE_OK}
          AND ($2::text[] IS NULL OR s.skills && $2::text[])
          AND ($3::text[] IS NULL OR s.kind = ANY($3::text[]))
          AND ($4::text[] IS NULL OR s.difficulty = ANY($4::text[]))
          AND ($5::text IS NULL OR s.search_tsv @@ to_tsquery('simple', $5))
          AND ($6::text IS NULL OR (s.helped_count, s.created_at, s.id) <
                                   (SELECT helped_count, created_at, id FROM cursor_row))
        ORDER BY s.helped_count DESC, s.created_at DESC, s.id DESC
        LIMIT $7`,
      [
        me,
        tags.length ? tags : null,
        types.length ? types : null,
        levels.length ? levels : null,
        tsq,
        after,
        pageLimit(req.query.limit),
        afterHelped,
        afterAt,
      ],
    )
    res.json(r.rows.map(mapLearningShare))
  }),
)

// GET /api/learning/tags?q= — the Skill / Topic filter's list. With no q, the
// most-used skills across the network (a read of the top rows of a counter
// table); with q, skills starting with what was typed (a prefix index walk).
// Both capped.
learningRouter.get(
  '/tags',
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? normalizeTag(req.query.q) : ''
    const r = q
      ? await query<{ tag: string; label: string; share_count: number }>(
          `SELECT tag, label, share_count FROM learning_tags
            WHERE tag LIKE $1 ESCAPE '\\' AND share_count > 0
            ORDER BY share_count DESC, tag LIMIT 20`,
          [`${escapeLike(q)}%`],
        )
      : await query<{ tag: string; label: string; share_count: number }>(
          `SELECT tag, label, share_count FROM learning_tags
            WHERE share_count > 0
            ORDER BY share_count DESC, tag LIMIT $1`,
          [Math.min(pageLimit(req.query.limit, 12), 40)],
        )
    res.json(r.rows.map((t) => ({ tag: t.tag, label: t.label, count: t.share_count })))
  }),
)

/** Moves the Skill filter's counters for a share's tags, inside the caller's
 *  transaction, so a tag's count can never disagree with the shares carrying
 *  it. +1 adds the tag row on first use; -1 floors at zero. */
async function moveTagCounts(client: pg.PoolClient, tags: { tag: string; label: string }[], delta: 1 | -1) {
  if (!tags.length) return
  if (delta === 1) {
    await client.query(
      `INSERT INTO learning_tags (tag, label, share_count)
       SELECT t, l, 1 FROM unnest($1::text[], $2::text[]) AS x(t, l)
       ON CONFLICT (tag) DO UPDATE SET share_count = learning_tags.share_count + 1`,
      [tags.map((t) => t.tag), tags.map((t) => t.label)],
    )
  } else {
    await client.query(
      `UPDATE learning_tags SET share_count = GREATEST(share_count - 1, 0) WHERE tag = ANY($1::text[])`,
      [tags.map((t) => t.tag)],
    )
  }
}

/** Locks one share the viewer may see for the rest of the transaction, or
 *  404s. The row lock is what serialises concurrent saves and "helped me"
 *  presses on the same item, so its counters can never drift from the rows
 *  they count. The audience is checked too, so a connections-only share
 *  cannot be saved, rated or reported by someone outside it just by its id. */
async function lockShare(client: pg.PoolClient, id: string, me: string) {
  const r = await client.query<{
    id: string; shared_by: string; title: string; url: string | null; why_helped: string; kind: ShareKind
  }>(
    `SELECT s.id, s.shared_by, s.title, s.url, s.why_helped, s.kind FROM learning_shares s
      WHERE s.id = $2 AND NOT s.hidden AND ${SHARE_AUDIENCE_OK}
      FOR UPDATE OF s`,
    [me, id],
  )
  if (!r.rowCount) throw new ApiError(404, 'That share was not found')
  return r.rows[0]
}

const shareSchema = z
  .object({
    topicKey: z.string().min(1).max(300),
    kind: z.enum(SHARE_KINDS),
    title: z.string().trim().min(3).max(160),
    url: z.string().trim().url().regex(HTTP_URL, HTTP_URL_MESSAGE).max(2000).optional(),
    // A real reason — "web development" says nothing a reader can act on, and
    // this text is also what the share's meaning is matched on.
    whyHelped: z.string().trim().min(WHY_HELPED_MIN, `Say in a sentence what it taught you (at least ${WHY_HELPED_MIN} characters)`).max(500),
    // Project briefs: the full problem statement.
    about: z.string().trim().max(5000).optional(),
    // Every share, so the Skill filter can find it.
    skills: z.array(z.string().trim().min(1).max(40)).min(1, 'Add at least one skill it covers').max(20),
    difficulty: z.enum(PROJECT_DIFFICULTIES),
    estHours: z.number().int().min(1).max(500).optional(),
    // Everyone (default) or My connections — see SHARE_AUDIENCE_OK.
    audience: z.enum(['everyone', 'connections']).default('everyone'),
  })
  // Anything but a project brief is a pointer to something, so it needs a link.
  .refine((d) => d.kind === 'project' || !!d.url, {
    message: 'Add the link you are recommending',
  })
  // A brief needs something to go on: a link to it, or a real problem statement.
  .refine((d) => d.kind !== 'project' || !!d.url || (d.about ?? '').length >= PROJECT_ABOUT_MIN, {
    message: `Add a link to the brief, or describe the project in at least ${PROJECT_ABOUT_MIN} characters`,
  })

// POST /api/learning/shares — an alum shares what helped them with everyone on
// a stage. Published at once (no review queue); members' reports hide a bad
// one. A link already shared for that topic returns the existing item rather
// than a second copy.
learningRouter.post(
  '/shares',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = shareSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const d = parsed.data
    const me = req.user!.sub

    // Anyone in the network can share for any stage — no connection or
    // eligibility needed. The stage just has to exist. What keeps quality up is
    // the per-day cap below, the name on every share, and members' reports
    // hiding a bad one.
    const topic = await query(`SELECT 1 FROM learning_topics WHERE topic_key = $1`, [d.topicKey])
    if (!topic.rowCount) throw new ApiError(404, 'No such stage')

    const urlNorm = d.url ? normalizeUrl(d.url) : null
    if (d.url && !urlNorm) throw new ApiError(400, HTTP_URL_MESSAGE)
    const tags = cleanTags(d.skills)
    if (!tags.length) throw new ApiError(400, 'Add at least one skill it covers')
    const isProject = d.kind === 'project'

    // The share and its tag counts land together, so the Skill filter's
    // numbers can never disagree with what is actually shared.
    const { id, duplicate } = await withTransaction(async (client) => {
      // One share at a time per member, so the daily cap is a real cap: two
      // posts sent at once would otherwise both count "9 today" before either
      // landed. The lock is this member's alone (nobody else waits on it) and
      // is released when the transaction ends — the same pattern as
      // connectionGraph.ts.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`learning_share:${me}`])
      const recent = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM learning_shares
          WHERE shared_by = $1 AND created_at > now() - interval '1 day'`,
        [me],
      )
      if (recent.rows[0].n >= SHARES_PER_DAY) {
        throw new ApiError(429, `You can share up to ${SHARES_PER_DAY} a day — thank you, and please come back tomorrow`)
      }

      const ins = await client.query<{ id: string }>(
        `INSERT INTO learning_shares
           (topic_key, shared_by, kind, title, url, url_norm, why_helped, about, skills, difficulty, est_hours, audience)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (topic_key, url_norm) WHERE url_norm IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          d.topicKey, me, d.kind, d.title, d.url ?? null, urlNorm, d.whyHelped,
          isProject ? d.about || null : null,
          tags.map((t) => t.tag),
          d.difficulty,
          isProject ? d.estHours ?? null : null,
          d.audience,
        ],
      )
      if (ins.rowCount) {
        await moveTagCounts(client, tags, 1)
        return { id: ins.rows[0].id, duplicate: false }
      }
      // Already shared for this stage: hand back that one — unless reports
      // have hidden it, which must not be shown to anyone again, or it was
      // deleted in the instant since the insert ran into it.
      const existing = await client.query<{ id: string; hidden: boolean }>(
        `SELECT id, hidden FROM learning_shares WHERE topic_key = $1 AND url_norm = $2`,
        [d.topicKey, urlNorm],
      )
      if (!existing.rowCount) throw new ApiError(409, 'That link was just changed on this stage — please try again')
      if (existing.rows[0].hidden) {
        throw new ApiError(409, 'That link was already shared for this stage and has been hidden after members reported it')
      }
      return { id: existing.rows[0].id, duplicate: true }
    })
    // Embed it now rather than at the next tick, so it reaches other stages
    // within seconds. Runs after this response, never delays it.
    if (!duplicate) kickLearningEmbed()
    const full = await query<LearningShareRow>(`${SHARE_SELECT} WHERE s.id = $2`, [me, id])
    if (!full.rowCount) throw new ApiError(409, 'That share was just removed — please try again')
    res.status(duplicate ? 200 : 201).json({ share: mapLearningShare(full.rows[0]), duplicate })
  }),
)

// DELETE /api/learning/shares/:id — take back something I shared. Only the
// sharer; members' saved copies survive as their own rows (share_id goes null).
// Its tags stop counting in the same transaction — unless reports had already
// hidden it, in which case they stopped counting then.
learningRouter.delete(
  '/shares/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const deleted = await withTransaction(async (client) => {
      const r = await client.query<{ skills: string[]; hidden: boolean }>(
        `DELETE FROM learning_shares WHERE id = $1 AND shared_by = $2 RETURNING skills, hidden`,
        [req.params.id, req.user!.sub],
      )
      if (!r.rowCount) return false
      if (!r.rows[0].hidden) {
        await moveTagCounts(client, r.rows[0].skills.map((tag) => ({ tag, label: tag })), -1)
      }
      return true
    })
    if (!deleted) throw new ApiError(404, 'That share was not found (or not yours)')
    res.status(204).end()
  }),
)

// POST /api/learning/shares/:id/save — keep an alum's share in my own list.
// The saved copy keeps share_id, so the member's list still says who
// recommended it. Saving twice is a no-op: the unique (user_id, share_id)
// index refuses the second row, and saved_count only moves when one was
// really inserted.
learningRouter.post(
  '/shares/:id/save',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const plan = await loadPlan(me)

    const result = await withTransaction(async (client) => {
      const share = await lockShare(client, req.params.id, req.user!.sub)
      const topic = await client.query<{ topic_key: string }>(
        `SELECT topic_key FROM learning_shares WHERE id = $1`,
        [share.id],
      )
      // Filed under the member's own stage when this share belongs to one of
      // them, so it lands in the right group in their saved list.
      const stage = plan?.stages.find((s) => s.topicKey === topic.rows[0].topic_key) ?? null
      const ins = await client.query<{ id: string }>(
        `INSERT INTO career_resources (user_id, title, url, note, kind, roadmap_id, step_key, share_id)
         VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8)
         ON CONFLICT (user_id, share_id) WHERE share_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [
          me, share.title, share.url, share.why_helped, toResourceKind(share.kind),
          stage ? plan!.roadmap.roadmapId : null, stage?.stepKey ?? null, share.id,
        ],
      )
      if (ins.rowCount) {
        const c = await client.query<{ saved_count: number }>(
          `UPDATE learning_shares SET saved_count = saved_count + 1 WHERE id = $1 RETURNING saved_count`,
          [share.id],
        )
        return { savedResourceId: ins.rows[0].id, savedCount: c.rows[0].saved_count }
      }
      const existing = await client.query<{ id: string; saved_count: number }>(
        `SELECT cr.id, s.saved_count FROM career_resources cr JOIN learning_shares s ON s.id = cr.share_id
          WHERE cr.user_id = $1 AND cr.share_id = $2`,
        [me, share.id],
      )
      return { savedResourceId: existing.rows[0].id, savedCount: existing.rows[0].saved_count }
    })
    res.json(result)
  }),
)

// DELETE /api/learning/shares/:id/save — remove my saved copy. The delete and
// the counter move together in one statement.
learningRouter.delete(
  '/shares/:id/save',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query<{ saved_count: number }>(
      `WITH del AS (
         DELETE FROM career_resources WHERE user_id = $1 AND share_id = $2 RETURNING share_id),
       upd AS (
         UPDATE learning_shares s SET saved_count = GREATEST(s.saved_count - 1, 0)
           FROM del WHERE s.id = del.share_id
         RETURNING s.saved_count)
       SELECT saved_count FROM upd
       UNION ALL
       SELECT saved_count FROM learning_shares WHERE id = $2 AND NOT EXISTS (SELECT 1 FROM del)`,
      [req.user!.sub, req.params.id],
    )
    if (!r.rowCount) throw new ApiError(404, 'That share was not found')
    res.json({ savedCount: r.rows[0].saved_count })
  }),
)

const helpedSchema = z.object({ rating: z.number().int().min(1).max(5) })

/** A share's rating as the card shows it: average to one decimal, and how
 *  many members rated. */
function ratingOf(sum: number, count: number) {
  return { rating: count > 0 ? Math.round((sum / count) * 10) / 10 : null, ratingCount: count }
}

// POST /api/learning/shares/:id/helped  { rating: 1–5 } — "this helped me",
// with how much. The item's standing and the alum's thanks are the same action:
// one press tells the network the share is good, rates it for everyone, and
// tells the person who shared it that it landed. A rating is final: once
// given it cannot be changed or taken back, so a share's standing can't be
// nudged up and down by the same member. (A press from before ratings existed
// has no rating yet — that member may add one, once.)
learningRouter.post(
  '/shares/:id/helped',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = helpedSchema.safeParse(req.body ?? {})
    if (!parsed.success) throw new ApiError(400, 'Pick 1 to 5 stars')
    const rating = parsed.data.rating
    const me = req.user!.sub
    const result = await withTransaction(async (client) => {
      const share = await lockShare(client, req.params.id, req.user!.sub)
      if (share.shared_by === me) throw new ApiError(400, 'That is your own share')
      // The share row is locked, so reading the old rating and moving the sums
      // cannot interleave with another press on the same share.
      const old = await client.query<{ rating: number | null }>(
        `SELECT rating FROM learning_share_helped WHERE share_id = $1 AND user_id = $2`,
        [share.id, me],
      )
      if (old.rowCount) {
        if (old.rows[0].rating !== null) throw new ApiError(409, 'You have already rated this — ratings are final')
        // An old press with no rating: record its rating, once.
        await client.query(
          `UPDATE learning_share_helped SET rating = $3 WHERE share_id = $1 AND user_id = $2`,
          [share.id, me, rating],
        )
        const c = await client.query<{ helped_count: number; rating_sum: number; rating_count: number }>(
          `UPDATE learning_shares
              SET rating_sum = rating_sum + $2, rating_count = rating_count + 1
            WHERE id = $1
            RETURNING helped_count, rating_sum, rating_count`,
          [share.id, rating],
        )
        return { ...c.rows[0], first: false, sharedBy: share.shared_by, title: share.title }
      }
      await client.query(
        `INSERT INTO learning_share_helped (share_id, user_id, rating) VALUES ($1, $2, $3)`,
        [share.id, me, rating],
      )
      const c = await client.query<{ helped_count: number; rating_sum: number; rating_count: number }>(
        `UPDATE learning_shares
            SET helped_count = helped_count + 1, rating_sum = rating_sum + $2, rating_count = rating_count + 1
          WHERE id = $1
          RETURNING helped_count, rating_sum, rating_count`,
        [share.id, rating],
      )
      // Thank the alum once per member, ever. A rating is final now, but this
      // row also outlives a "helped" press from the older un-pressable days.
      const thanked = await client.query(
        `INSERT INTO learning_share_thanked (share_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [share.id, me],
      )
      return {
        ...c.rows[0],
        first: (thanked.rowCount ?? 0) > 0,
        sharedBy: share.shared_by,
        title: share.title,
      }
    })

    if (result.first) {
      const who = await query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [me])
      void pushNotification(
        result.sharedBy,
        'mentorship',
        `${who.rows[0].name} found "${result.title}" helpful — thanks for sharing it.`,
        me,
        { type: 'learning_share', id: req.params.id },
      )
    }
    res.json({
      helpedCount: result.helped_count,
      ...ratingOf(result.rating_sum, result.rating_count),
      iHelped: true,
      myRating: rating,
    })
  }),
)

// DELETE /api/learning/shares/:id/helped — kept so an older client gets a clear
// answer, but ratings are final: nothing is removed. (A member's ratings do
// leave with their account — the users BEFORE DELETE trigger in schema.sql.)
learningRouter.delete(
  '/shares/:id/helped',
  requireAuth,
  asyncHandler(async () => {
    throw new ApiError(409, 'Ratings are final — once given, they cannot be taken back')
  }),
)

// POST /api/learning/shares/:id/report — flag a broken or unhelpful share. One
// report per member (the primary key); at REPORTS_TO_HIDE distinct reports it
// hides itself, with no admin step.
learningRouter.post(
  '/shares/:id/report',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const hidden = await withTransaction(async (client) => {
      await lockShare(client, req.params.id, req.user!.sub)
      const ins = await client.query(
        `INSERT INTO learning_share_reports (share_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.params.id, me],
      )
      if (!ins.rowCount) return false
      const c = await client.query<{ hidden: boolean; skills: string[]; just_hidden: boolean }>(
        `UPDATE learning_shares
            SET report_count = report_count + 1,
                hidden = hidden OR report_count + 1 >= $2
          WHERE id = $1
          RETURNING hidden, skills, (report_count = $2) AS just_hidden`,
        [req.params.id, REPORTS_TO_HIDE],
      )
      // The report that hides it also takes its tags out of the Skill filter's
      // counts — otherwise the list would offer a skill with nothing behind it.
      if (c.rows[0].just_hidden) {
        await moveTagCounts(client, c.rows[0].skills.map((tag) => ({ tag, label: tag })), -1)
      }
      return c.rows[0].hidden
    })
    res.json({ reported: true, hidden })
  }),
)
