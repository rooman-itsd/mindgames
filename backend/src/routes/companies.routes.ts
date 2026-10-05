import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db/pool.js'
import { requireAuth } from '../auth/middleware.js'
import { pushNotification } from '../notify.js'
import { ApiError, asyncHandler } from '../http.js'
import {
  mapCompany,
  mapCompanyAlumnus,
  mapCompanyRoadmap,
  mapCompanySignals,
  type CompanyAlumnusRow,
  type CompanyRoadmapRow,
  type CompanyRow,
  type CompanySignalsRow,
} from '../mappers.js'

export const companiesRouter = Router()

// ---------------------------------------------------------------------------
// Alias-aware matching.
//
// users.company is free text, so one employer arrives under several spellings
// ("Rooman", "Rooman Technologies, Bengaluru"). companies.aliases lists the
// other spellings that mean the same employer, and these two fragments are the
// only place that knowledge lives — every query that counts, lists or scores a
// company's people goes through them, so none of them can disagree.
// ---------------------------------------------------------------------------

/**
 * True when a free-text employer value matches company row `c`, under its own
 * name or any of its alias spellings.
 *
 * Takes the expression rather than assuming `u.company`, because the same rule
 * has to apply to users (`u.company`, `u2.company`) AND to Hiring posts
 * (`p.company`). An aggregate that skips it silently under-counts one company.
 *
 * Written as one ANY over an array rather than the more obvious
 * `= LOWER(c.name) OR = ANY (SELECT ... unnest(c.aliases))`. Both return
 * identical rows, but an OR whose second branch is a correlated sub-select
 * cannot use an index, so the OR form made every company query a sequential
 * scan of `users` -- and /for-you runs eleven of them per company row. In the
 * array form Postgres uses idx_users_company_lower (schema.sql), declared on
 * exactly this LOWER(TRIM(...)) expression. Measured on 20k users across 440
 * employers, ~50 per company -- the shape real data has: the OR form plans a
 * Seq Scan per company at 1174ms, this one a Bitmap Index Scan at 251ms, and
 * the two agree on the alumni count for all 39 companies. The gain is
 * selectivity-dependent: where a handful of employers hold everybody, the
 * planner correctly prefers a Seq Scan either way and the two forms tie.
 */
const matchesCompany = (companyText: string): string => `(
  LOWER(TRIM(${companyText})) = ANY (
    ARRAY[LOWER(c.name)]
    || COALESCE((SELECT array_agg(LOWER(a)) FROM unnest(c.aliases) AS a), ARRAY[]::text[])
  )
)`

/** The common case: the user row aliased `u`. */
const MATCHES_COMPANY: string = matchesCompany('u.company')

/**
 * True when company row `c` is not folded into another company.
 *
 * A row whose own name is listed as somebody else's alias is a duplicate entry
 * for the same employer; it stays in the table (nothing is deleted) but is
 * hidden from the directory so one company appears once.
 */
const NOT_MERGED: string = `NOT EXISTS (
  SELECT 1 FROM companies o
   WHERE o.id <> c.id
     AND LOWER(c.name) = ANY (SELECT LOWER(a) FROM unnest(o.aliases) AS a)
)`

/** The ids of companies folded into `c` — their saves belong to `c` now. */
const FOLDED_INTO_C: string = `(
  SELECT o.id FROM companies o
   WHERE o.id <> c.id
     AND LOWER(o.name) = ANY (SELECT LOWER(a) FROM unnest(c.aliases) AS a)
)`

/** Every spelling of a company, lowercased — for queries that hold one company. */
function spellingsOf(company: { name: string; aliases: string[] }): string[] {
  return [company.name, ...(company.aliases ?? [])].map((n) => n.trim().toLowerCase())
}


async function ensureCompanyExists(
  id: string,
): Promise<{ id: string; name: string; domain: string | null; industry: string; aliases: string[] }> {
  const found = await query<{
    id: string
    name: string
    domain: string | null
    industry: string
    aliases: string[]
  }>(
    'SELECT id, name, domain, industry, aliases FROM companies WHERE id = $1',
    [id],
  )
  if (!found.rowCount) throw new ApiError(404, 'Company not found')
  return found.rows[0]
}

// GET /api/companies — the directory: every company with at least one
// matched alumnus besides the viewer themself, its alumni count, and a
// 4-avatar preview for the overlapping-avatars card. Curated companies with
// zero other alumni (seeded in schema.sql) are excluded via HAVING rather
// than deleted from the table — they still exist so a matching alumnus's
// profile picks up the curated domain/industry — and this applies uniformly,
// including to a company the viewer has saved: with nobody who has ever
// worked there, there is nothing the directory or the Saved filter can show.
// Alumni are matched via MATCHES_COMPANY (name or alias,
// case/whitespace-insensitively), the same alias-aware rule every other
// query here uses.
companiesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = (
      await query<CompanyRow>(
        `SELECT c.id, c.name, c.domain, c.industry,
                COUNT(u.id) FILTER (WHERE u.id <> $1)::int AS alumni_count,
                COALESCE(
                  (SELECT json_agg(json_build_object('id', p.id, 'name', p.name, 'photo', p.photo))
                   FROM (
                     SELECT u2.id, u2.name, u2.photo FROM users u2
                     -- Through the helper rather than hand-inlined: this is
                     -- the same two-branch rule, and the module header is
                     -- explicit that it must live in exactly one place so the
                     -- count and the preview cannot drift apart.
                     -- u2.id <> $1 mirrors the FILTER above: without it, a
                     -- viewer who matches their own company shows up as one
                     -- of their own company's preview avatars while
                     -- alumni_count (correctly) doesn't count them.
                     WHERE ${matchesCompany('u2.company')} AND u2.id <> $1
                     ORDER BY u2.name LIMIT 4
                   ) p
                  ), '[]'
                ) AS preview_alumni,
                EXISTS (
                  SELECT 1 FROM company_saves cs
                   WHERE cs.user_id = $1
                     AND (cs.company_id = c.id OR cs.company_id IN ${FOLDED_INTO_C})
                ) AS saved_by_me
         FROM companies c
         LEFT JOIN users u ON ${MATCHES_COMPANY}
         WHERE ${NOT_MERGED}
         GROUP BY c.id
         -- Excludes the viewer from the count, same as GET /:id (u.id <> $2
         -- there) — otherwise a company whose only "alumnus" is the viewer
         -- themself passed this filter and then rendered the empty card on
         -- /:id. Applies even to a saved company: a bookmark against a
         -- company nobody has ever worked at points at an empty page either
         -- way, so it is hidden here too rather than kept visible just
         -- because it is saved.
         HAVING COUNT(u.id) FILTER (WHERE u.id <> $1) > 0
         ORDER BY alumni_count DESC, c.name`,
        [req.user!.sub],
      )
    ).rows
    res.json(rows.map(mapCompany))
  }),
)

// The company-side aggregate columns, shared by GET /for-you and
// GET /:id/roadmaps, so the two endpoints can never disagree about what a
// company looks like. Expects `companies c` in scope. `viewer` is the SQL
// parameter holding the current user id, which is $1 in one caller and $2 in
// the other — hence a parameter rather than a hardcoded placeholder.
const signalsCols = (viewer: string): string => `
                -- Which skills the people already there actually hold, ranked
                -- by how many hold them. This is the company's demanded skill
                -- set inferred from evidence rather than from a job ad.
                COALESCE((
                  SELECT json_agg(t) FROM (
                    SELECT s.skill AS skill, count(*)::int AS holders
                      FROM users u, unnest(u.expertise) AS s(skill)
                     WHERE ${MATCHES_COMPANY}
                       AND TRIM(s.skill) <> ''
                     GROUP BY s.skill
                     ORDER BY holders DESC, s.skill
                     LIMIT 12
                  ) t), '[]'
                ) AS top_skills,

                -- Certifications held by alumni there. The jsonb_typeof CASE
                -- guard is the same one GET /:id uses and for the same reason:
                -- a hand-edited non-array value must fall back to empty rather
                -- than raise "cannot extract elements from a scalar".
                COALESCE((
                  SELECT json_agg(t) FROM (
                    SELECT e->>'name' AS name, count(*)::int AS holders
                      FROM users u,
                           jsonb_array_elements(
                             CASE WHEN jsonb_typeof(u.certifications) = 'array'
                                  THEN u.certifications ELSE '[]'::jsonb END
                           ) e
                     WHERE ${MATCHES_COMPANY}
                       AND COALESCE(e->>'name', '') <> ''
                     GROUP BY e->>'name'
                     ORDER BY holders DESC, e->>'name'
                     LIMIT 8
                  ) t), '[]'
                ) AS top_certifications,

                COALESCE((
                  SELECT json_agg(t) FROM (
                    SELECT u.city AS city, count(*)::int AS count
                      FROM users u
                     WHERE ${MATCHES_COMPANY} AND TRIM(u.city) <> ''
                     GROUP BY u.city ORDER BY count DESC, u.city LIMIT 6
                  ) t), '[]'
                ) AS cities,

                COALESCE((
                  SELECT json_agg(t) FROM (
                    SELECT u.domain AS domain, count(*)::int AS count
                      FROM users u
                     WHERE ${MATCHES_COMPANY} AND TRIM(u.domain) <> ''
                     GROUP BY u.domain ORDER BY count DESC, u.domain LIMIT 6
                  ) t), '[]'
                ) AS domains,

                -- Roles this company is actually hiring for, from Hiring posts
                -- members published naming it. First-party, current JD data.
                COALESCE((
                  SELECT json_agg(t) FROM (
                    SELECT p.role AS role, count(*)::int AS count
                      FROM posts p
                     WHERE p.type = 'Hiring' AND p.active
                       AND ${matchesCompany("COALESCE(p.company, '')")}
                       AND COALESCE(p.role, '') <> ''
                     GROUP BY p.role ORDER BY count DESC, p.role LIMIT 6
                  ) t), '[]'
                ) AS hiring_roles,

                -- Median, not average: one 20-year veteran should not drag the
                -- typical seniority of a team of juniors upwards. Zeros are
                -- excluded because 0 is this column's default and means
                -- "never said", not "fresh graduate".
                (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY u.experience_years)
                   FROM users u
                  WHERE ${MATCHES_COMPANY}
                    AND u.experience_years > 0) AS median_experience,

                (SELECT count(*)::int FROM users u
                  WHERE ${MATCHES_COMPANY}
                    AND u.open_to_referrals) AS referral_open,

                (SELECT count(*)::int FROM users u
                  WHERE ${MATCHES_COMPANY}
                    AND u.is_mentor) AS mentor_count,

                -- Only contributions the roadmaps list will actually render:
                -- someone who has since left the company is filtered out
                -- there, so counting them here would advertise "3 roadmaps"
                -- and open an empty page.
                (SELECT count(*)::int
                   FROM company_roadmap_contributions rc
                   JOIN users u2 ON u2.id = rc.user_id
                  WHERE rc.company_id = c.id
                    AND ${matchesCompany('u2.company')}) AS roadmap_count,

                (SELECT count(*)::int
                   FROM users u
                   JOIN connections cn
                     ON cn.status = 'accepted'
                    AND ((cn.requester_id = ${viewer} AND cn.addressee_id = u.id)
                      OR (cn.addressee_id = ${viewer} AND cn.requester_id = u.id))
                  WHERE ${MATCHES_COMPANY}) AS connected_alumni,

                -- "Alumni here", same rule GET / uses: the viewer working at
                -- a company is not evidence about the company, so they don't
                -- count as one of its alumni for scoring purposes either.
                (SELECT count(*)::int FROM users u
                  WHERE ${MATCHES_COMPANY} AND u.id <> ${viewer}) AS sample_size`

// GET /api/companies/for-you — every company plus the aggregate "signals"
// that describe it, so the frontend can score the fit against the viewer's
// own profile (lib/companyMatch.ts) and compare companies side by side.
//
// MUST stay registered above GET /:id. Express matches in registration order
// and `/:id` matches any single segment, so below it this path would be
// handled as a lookup for a company whose id is literally "for-you".
//
// Deliberately a separate endpoint rather than extra columns on GET /: the
// plain directory renders on every visit to the Companies tab and has no use
// for these aggregates, so it keeps its existing, cheaper query untouched.
companiesRouter.get(
  '/for-you',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const rows = (
      await query<CompanyRow & CompanySignalsRow>(
        `SELECT c.id, c.name, c.domain, c.industry,
                (SELECT count(*)::int FROM users u
                  WHERE ${MATCHES_COMPANY} AND u.id <> $1) AS alumni_count,
                NULL AS preview_alumni,
                EXISTS (
                  SELECT 1 FROM company_saves cs
                   WHERE cs.user_id = $1
                     AND (cs.company_id = c.id OR cs.company_id IN ${FOLDED_INTO_C})
                ) AS saved_by_me,
                ${signalsCols('$1')}
         FROM companies c
         WHERE ${NOT_MERGED}
         ORDER BY c.name`,
        [me],
      )
    ).rows

    res.json(
      rows.map((r) => ({
        ...mapCompany(r),
        signals: mapCompanySignals(r),
      })),
    )
  }),
)

// GET /api/companies/:id — company header + the full matched-alumni list,
// each with a mutual-connections count relative to the current user.
companiesRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const company = await ensureCompanyExists(req.params.id)

    const alumni = (
      await query<CompanyAlumnusRow>(
        `WITH my_conns AS (
           SELECT CASE WHEN requester_id = $2 THEN addressee_id ELSE requester_id END AS uid
           FROM connections WHERE status = 'accepted' AND (requester_id = $2 OR addressee_id = $2)
         )
         SELECT u.id, u.name, u.photo,
                u.designation AS role, u.city AS location,
                -- Prefer what this member actually wrote about their time at
                -- THIS company over their generic bio.
                --
                -- The jsonb_typeof guard sits INSIDE the function call
                -- rather than in WHERE. Both forms work today: with the guard
                -- in WHERE, Postgres promotes it to a One-Time Filter above
                -- the function scan (confirmed by EXPLAIN), so a hand-edited
                -- object/scalar row falls through to the bio instead of
                -- raising "cannot extract elements from ...". But that
                -- depends on the planner recognising a qual that references
                -- no column of the function scan; expressed as a CASE it is
                -- correct by construction. NULL takes the ELSE branch too,
                -- since jsonb_typeof(NULL) is NULL.
                COALESCE(NULLIF((
                  SELECT e->>'summary'
                  FROM jsonb_array_elements(
                         CASE WHEN jsonb_typeof(u.experience) = 'array'
                              THEN u.experience
                              ELSE '[]'::jsonb END
                       ) e
                  -- $1 is the alias list (see spellingsOf), so this must be
                  -- ANY over the array. Compared as a scalar it silently
                  -- matched nothing -- Postgres reads $1 as text here, which
                  -- makes the $1::text[] below a plain I/O cast rather than a
                  -- type error, so every alumnus fell through to their
                  -- generic bio with no error and no log.
                  WHERE LOWER(TRIM(COALESCE(e->>'company', ''))) = ANY($1::text[])
                    AND COALESCE(e->>'summary', '') <> ''
                  LIMIT 1
                ), ''), u.bio) AS journey,
                (
                  SELECT count(*)::int FROM connections c
                  WHERE c.status = 'accepted' AND (c.requester_id = u.id OR c.addressee_id = u.id)
                    AND (CASE WHEN c.requester_id = u.id THEN c.addressee_id ELSE c.requester_id END)
                        IN (SELECT uid FROM my_conns)
                ) AS mutual_connections
         FROM users u
         WHERE LOWER(TRIM(u.company)) = ANY($1::text[]) AND u.id <> $2
         ORDER BY u.name`,
        [spellingsOf(company), me],
      )
    ).rows

    // Same roll-up the directory list and DELETE /:id/save apply: a save made
    // against a duplicate entry before it was folded in belongs to this
    // company now. Without it the directory showed the company bookmarked
    // while its own page showed it unsaved.
    const savedByMe = await query(
      `SELECT 1 FROM company_saves
        WHERE user_id = $2
          AND (company_id = $1
               OR company_id IN (
                 SELECT o.id FROM companies o, companies c
                  WHERE c.id = $1 AND o.id <> c.id
                    AND LOWER(o.name) = ANY (SELECT LOWER(a) FROM unnest(c.aliases) AS a)
               ))`,
      [company.id, me],
    )

    res.json({
      ...mapCompany({
        ...company,
        alumni_count: alumni.length,
        preview_alumni: null,
        saved_by_me: !!savedByMe.rowCount,
      }),
      alumni: alumni.map(mapCompanyAlumnus),
    })
  }),
)

// POST /api/companies/:id/save — bookmark for the current user.
companiesRouter.post(
  '/:id/save',
  requireAuth,
  asyncHandler(async (req, res) => {
    await ensureCompanyExists(req.params.id)
    await query(
      `INSERT INTO company_saves (company_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, req.user!.sub],
    )
    res.json({ saved: true })
  }),
)

// DELETE /api/companies/:id/save — remove bookmark.
companiesRouter.delete(
  '/:id/save',
  requireAuth,
  asyncHandler(async (req, res) => {
    await ensureCompanyExists(req.params.id)
    // Also clears a save made against a duplicate entry before it was folded
    // in — otherwise "unsave" appears to do nothing, because saved_by_me still
    // finds the old row.
    await query(
      `DELETE FROM company_saves
        WHERE user_id = $2
          AND (company_id = $1
               OR company_id IN (
                 SELECT o.id FROM companies o, companies c
                  WHERE c.id = $1 AND o.id <> c.id
                    AND LOWER(o.name) = ANY (SELECT LOWER(a) FROM unnest(c.aliases) AS a)
               ))`,
      [req.params.id, req.user!.sub],
    )
    res.json({ saved: false })
  }),
)

// ---------------------------------------------------------------------------
// Roadmaps: how alumni actually got into this company.
// ---------------------------------------------------------------------------

// Who the "ask the alumni here" button reaches. Five years is the point at
// which someone has enough of a path behind them to describe it usefully —
// and it keeps the ask off people who only just arrived themselves.
const ROADMAP_ASK_MIN_YEARS = 5

// Upper bound on one ask, so a company with hundreds of alumni cannot turn a
// single click into hundreds of notifications.
const ROADMAP_ASK_MAX_RECIPIENTS = 25

const roadmapBodySchema = z.object({
  role: z.string().trim().max(120).default(''),
  headline: z.string().trim().max(160).default(''),
  advice: z.string().trim().max(2000).default(''),
  stages: z
    .array(
      z.object({
        title: z.string().trim().min(1, 'Each step needs a title').max(120),
        detail: z.string().trim().max(600).default(''),
      }),
    )
    .max(8, 'Eight steps is the maximum')
    .default([]),
})

/** SQL fragment: the alumni of the company named by $1, matched as everywhere else here. */
// $1 is every spelling of the company (see spellingsOf), not just its name,
// so a profile written with an alias spelling still counts as working here.
const WORKS_HERE: string = `LOWER(TRIM(u.company)) = ANY($1::text[])`

// The profile columns a roadmap is derived from. Shared by the list query and
// the viewer's own row below so the two can never drift apart.
const ROADMAP_COLS: string = `u.id, u.name, u.photo, u.designation, u.city, u.course,
        u.batch_year, u.experience_years, u.expertise, u.experience, u.certifications,
        u.is_mentor, u.mentor_topics, u.open_to_referrals,
        rc.role AS contrib_role, rc.headline AS contrib_headline,
        rc.stages AS contrib_stages, rc.advice AS contrib_advice,
        rc.updated_at AS contrib_updated_at`

// GET /api/companies/:id/roadmaps — one entry per alumnus, oldest career step
// first, plus whatever advice they wrote on top of it. Built from profile
// fields, which every member can see; contact details are never part of it.
companiesRouter.get(
  '/:id/roadmaps',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const company = await ensureCompanyExists(req.params.id)

    const rows = (
      await query<CompanyRoadmapRow>(
        `WITH my_conns AS (
           SELECT CASE WHEN requester_id = $2 THEN addressee_id ELSE requester_id END AS uid
           FROM connections WHERE status = 'accepted' AND (requester_id = $2 OR addressee_id = $2)
         )
         SELECT ${ROADMAP_COLS},
                (
                  SELECT count(*)::int FROM connections c
                  WHERE c.status = 'accepted' AND (c.requester_id = u.id OR c.addressee_id = u.id)
                    AND (CASE WHEN c.requester_id = u.id THEN c.addressee_id ELSE c.requester_id END)
                        IN (SELECT uid FROM my_conns)
                ) AS mutual_connections
         FROM users u
         LEFT JOIN company_roadmap_contributions rc
                ON rc.company_id = $3 AND rc.user_id = u.id
         WHERE ${WORKS_HERE}
           AND u.id <> $2
           -- Somebody with neither a timeline nor a written contribution has
           -- no roadmap to show; listing them would render an empty card.
           AND (rc.user_id IS NOT NULL
                OR jsonb_array_length(
                     CASE WHEN jsonb_typeof(u.experience) = 'array'
                          THEN u.experience ELSE '[]'::jsonb END
                   ) > 0)
         ORDER BY (rc.user_id IS NOT NULL) DESC,
                  rc.updated_at DESC NULLS LAST,
                  u.experience_years DESC,
                  u.name`,
        [spellingsOf(company), me, company.id],
      )
    ).rows

    // The viewer's own entry is fetched separately rather than filtered out of
    // the list above: they need it in order to edit it, and it belongs in its
    // own "your roadmap" card rather than among other people's.
    const mine = (
      await query<CompanyRoadmapRow>(
        `SELECT ${ROADMAP_COLS}, 0 AS mutual_connections
         FROM users u
         LEFT JOIN company_roadmap_contributions rc
                ON rc.company_id = $3 AND rc.user_id = u.id
         WHERE u.id = $2 AND ${WORKS_HERE}`,
        [spellingsOf(company), me, company.id],
      )
    ).rows

    // How many people this viewer's ask would actually reach, so the button can
    // say so honestly — and hide itself when it would reach nobody.
    const eligible = await query<{ count: number }>(
      // Capped to what the ask will actually notify. Uncapped, the button reads
      // "Ask 60 alumni", 25 are notified, and the one-ask-per-company key means
      // the other 35 can never be reached — the number would be a promise the
      // endpoint cannot keep.
      `SELECT LEAST(count(*), $5)::int AS count FROM users u
        WHERE ${WORKS_HERE} AND u.id <> $2
          AND u.experience_years >= $3
          AND NOT EXISTS (
            SELECT 1 FROM company_roadmap_contributions rc
             WHERE rc.company_id = $4 AND rc.user_id = u.id
          )`,
      [spellingsOf(company), me, ROADMAP_ASK_MIN_YEARS, company.id, ROADMAP_ASK_MAX_RECIPIENTS],
    )

    const asked = await query(
      `SELECT 1 FROM company_roadmap_requests WHERE company_id = $1 AND requester_id = $2`,
      [company.id, me],
    )

    // The same aggregates GET /for-you computes, for this one company — they
    // drive the "what you are missing" checklist next to the roadmaps. Shared
    // fragment, so the gap list and the match score always agree on which
    // skills this company actually wants.
    const signals = (
      await query<CompanySignalsRow>(
        `SELECT
                ${signalsCols('$2')}
         FROM companies c WHERE c.id = $1`,
        [company.id, me],
      )
    ).rows[0]

    res.json({
      signals: mapCompanySignals(signals),
      roadmaps: rows.map((r) => mapCompanyRoadmap(r, spellingsOf(company))),
      // Non-null only when the viewer works here — which is also exactly when
      // they are allowed to contribute one.
      mine: mine.length ? mapCompanyRoadmap(mine[0], spellingsOf(company)) : null,
      canContribute: mine.length > 0,
      alreadyAsked: !!asked.rowCount,
      eligibleToAsk: eligible.rows[0]?.count ?? 0,
    })
  }),
)

// POST /api/companies/:id/roadmap — add or edit the viewer's own roadmap notes.
//
// Only someone who works at the company may write one: the whole value of this
// section is that every path shown was walked by somebody actually there. The
// timeline itself is never written here — it stays derived from the member's
// profile, so keeping the profile current keeps the roadmap current.
companiesRouter.post(
  '/:id/roadmap',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const company = await ensureCompanyExists(req.params.id)
    const parsed = roadmapBodySchema.safeParse(req.body ?? {})
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)

    const worksHere = await query(`SELECT 1 FROM users u WHERE u.id = $2 AND ${WORKS_HERE}`, [
      spellingsOf(company),
      me,
    ])
    if (!worksHere.rowCount) {
      throw new ApiError(403, `Only members who work at ${company.name} can share a roadmap for it.`)
    }

    const { role, headline, advice, stages } = parsed.data
    await query(
      `INSERT INTO company_roadmap_contributions
         (company_id, user_id, role, headline, stages, advice)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (company_id, user_id) DO UPDATE
         SET role = EXCLUDED.role,
             headline = EXCLUDED.headline,
             stages = EXCLUDED.stages,
             advice = EXCLUDED.advice,
             updated_at = now()`,
      [company.id, me, role, headline, JSON.stringify(stages), advice],
    )
    res.json({ saved: true })
  }),
)

// POST /api/companies/:id/roadmap/request — ask the experienced alumni here to
// share how they got in.
//
// Rate-limited to one ask per member per company by company_roadmap_requests.
// Without that row this endpoint would be a one-click way to notify every
// alumnus of a company, repeatedly.
companiesRouter.post(
  '/:id/roadmap/request',
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = req.user!.sub
    const company = await ensureCompanyExists(req.params.id)

    const existing = await query(
      `SELECT 1 FROM company_roadmap_requests WHERE company_id = $1 AND requester_id = $2`,
      [company.id, me],
    )
    if (existing.rowCount) {
      throw new ApiError(429, `You have already asked the alumni at ${company.name}.`)
    }

    const asker = await query<{ name: string }>(`SELECT name FROM users WHERE id = $1`, [me])
    const askerName = asker.rows[0]?.name ?? 'A Rooman member'

    const recipients = (
      await query<{ id: string }>(
        `SELECT u.id FROM users u
          WHERE ${WORKS_HERE} AND u.id <> $2
            AND u.experience_years >= $3
            AND NOT EXISTS (
              SELECT 1 FROM company_roadmap_contributions rc
               WHERE rc.company_id = $4 AND rc.user_id = u.id
            )
          ORDER BY u.experience_years DESC
          LIMIT $5`,
        [spellingsOf(company), me, ROADMAP_ASK_MIN_YEARS, company.id, ROADMAP_ASK_MAX_RECIPIENTS],
      )
    ).rows

    // Nobody to notify: do not claim the rate-limit row. That row is the
    // record of "you have had your one ask", so writing it here would spend
    // it on a request that reached no one -- alreadyAsked stays true forever
    // and every later attempt is a 429, even once someone becomes eligible.
    // Reachable whenever the eligible set empties between page load and click
    // (the last eligible alumnus contributes, turns private, or leaves).
    // The client already renders notified === 0 as "no one available to ask
    // right now" and reloads, so this needs no new UI.
    if (!recipients.length) {
      res.json({ requested: false, notified: 0 })
      return
    }

    // The insert is the lock, not the SELECT above. Two clicks in quick
    // succession both pass that check, and with the notify loop outside the
    // conflict the second one would notify all 25 alumni a second time. The
    // primary key makes exactly one INSERT win; RETURNING tells us which, and
    // only the winner sends anything.
    const claimed = await query(
      `INSERT INTO company_roadmap_requests (company_id, requester_id, notified)
       VALUES ($1, $2, $3)
       ON CONFLICT (company_id, requester_id) DO NOTHING
       RETURNING 1`,
      [company.id, me, recipients.length],
    )
    if (!claimed.rowCount) {
      throw new ApiError(429, `You have already asked the alumni at ${company.name}.`)
    }

    for (const r of recipients) {
      await pushNotification(
        r.id,
        'mentorship',
        `${askerName} asked how you got into ${company.name}. Share your roadmap to help them in.`,
        me,
        { type: 'company', id: company.id },
      )
    }

    res.json({ requested: true, notified: recipients.length })
  }),
)
