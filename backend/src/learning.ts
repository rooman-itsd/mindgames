/**
 * Pure helpers for the learning hub — no database, no network.
 *
 * Kept apart from the routes because several of them have to agree exactly:
 * if two places computed a topic key differently, an alum's share would never
 * reach the members it was meant for.
 */

/** What an alum can share — the Resource Type filter's five values. 'project'
 *  is a brief drawn from their real work; the rest are things to read or
 *  watch. Keep in step with the CHECK on learning_shares.kind in schema.sql. */
export const SHARE_KINDS = ['course', 'tutorial', 'doc', 'project', 'article'] as const
export type ShareKind = (typeof SHARE_KINDS)[number]

/** A project's "About" must be at least this long to stand without a link —
 *  long enough to be a real problem statement, not a title restated. Keep in
 *  step with learning_shares_project_has_detail in schema.sql. */
export const PROJECT_ABOUT_MIN = 80
/** "Why it helped" must say something — it is what a reader acts on, and what
 *  the share's meaning is matched on. Keep in step with ShareForm.tsx. */
export const WHY_HELPED_MIN = 30

/** Skill tags per share. */
export const MAX_TAGS = 8

/**
 * A skill tag as stored and matched: lower-case, trimmed, inner whitespace
 * collapsed, and only the characters tech names use ("C++", "LLM/RAG",
 * "Node.js"). "AWS", " aws" and "Aws" are one tag, so the Skill filter never
 * splits into near-duplicates. Empty when nothing usable is left.
 */
export function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9+#./ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

/** Tags from a form: normalised, de-duplicated, capped, with the label each
 *  was first typed as (so "LLM/RAG" displays as typed). */
export function cleanTags(raw: string[]): { tag: string; label: string }[] {
  const out = new Map<string, string>()
  for (const r of raw) {
    const tag = normalizeTag(r)
    if (tag && !out.has(tag)) out.set(tag, r.trim().replace(/\s+/g, ' ').slice(0, 40))
    if (out.size >= MAX_TAGS) break
  }
  return [...out].map(([tag, label]) => ({ tag, label }))
}

/** A comma-separated query value ("aws,python") as a clean list, keeping only
 *  values from `allowed` when given. Capped, so a filter can never become an
 *  unbounded IN list. */
export function parseList(value: unknown, allowed?: readonly string[], max = 20): string[] {
  if (typeof value !== 'string' || !value) return []
  const items = value.split(',').map((v) => v.trim()).filter(Boolean)
  const kept = allowed ? items.filter((v) => allowed.includes(v)) : items
  return [...new Set(kept)].slice(0, max)
}

export const PROJECT_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const
export type ProjectDifficulty = (typeof PROJECT_DIFFICULTIES)[number]

/** A share is hidden once this many distinct members report it. */
export const REPORTS_TO_HIDE = 3

/** Most a member may share in a rolling day. */
export const SHARES_PER_DAY = 10

/**
 * A job title as every "is this person in that role?" check compares it:
 * lower-case, trimmed, inner whitespace collapsed. "Cloud  Architect " and
 * "cloud architect" are the same role.
 *
 * ONE rule, used everywhere — sharing, suggesting alumni, nudging — because
 * when these disagreed an alum could share for a role yet never be suggested
 * or asked. DESIGNATION_KEY_SQL is the same rule in SQL, byte-identical to the
 * idx_users_designation_key index in schema.sql so the planner uses it.
 */
export function designationKey(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** designationKey(u.designation) in SQL. Keep identical to the index. */
export const DESIGNATION_KEY_SQL = `lower(regexp_replace(btrim(u.designation), '\\s+', ' ', 'g'))`

/** Lower-cases, trims, and collapses whitespace and stray punctuation, keeping
 *  the symbols that change meaning in tech names (C++, C#, .NET, Node.js). */
export function normaliseLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.&/ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The shared key for "what to learn at this stage, for this goal".
 *
 * Every member whose roadmap has the same target role and stage title lands on
 * the same key, so one alum's share reaches all of them. A member with no
 * target role yet ("not sure") shares a 'general' bucket per stage rather than
 * being cut off from the network's shares entirely.
 */
export function topicKey(targetRole: string | null | undefined, stageTitle: string): string {
  const role = normaliseLabel(targetRole ?? '') || 'general'
  return `${role}|${normaliseLabel(stageTitle)}`.slice(0, 300)
}

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$)/i

/**
 * A link reduced to what identifies the page, for duplicate detection.
 *
 * "https://www.Example.com/docs/?utm_source=x#intro" and
 * "http://example.com/docs" are the same page to a reader, so they must be the
 * same row — otherwise one page appears twice with its "helped me" counts
 * split between the copies. Returns null for anything that is not a web URL.
 */
export function normalizeUrl(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAM.test(k))
    .sort(([a], [b]) => a.localeCompare(b))
  const query = params.length ? '?' + new URLSearchParams(params).toString() : ''
  const path = u.pathname.replace(/\/+$/, '')
  return `${host}${path}${query}`
}

/** A share's kind as the older career_resources.kind can store it, for the
 *  member's saved copy. That column's CHECK predates this feature and cannot
 *  be altered from schema.sql: a tutorial is filed as 'video' (what most
 *  tutorials are) and a project as 'other'. The saved row keeps share_id, so
 *  the real kind is never lost. */
export function toResourceKind(kind: ShareKind): 'doc' | 'article' | 'video' | 'course' | 'other' {
  if (kind === 'tutorial') return 'video'
  if (kind === 'project') return 'other'
  return kind
}

/**
 * A search box's text as a Postgres tsquery that matches word PREFIXES, so
 * "kube" finds "Kubernetes" while the member is still typing. Built from
 * letters and digits only — nothing a member types can inject tsquery
 * operators. Null when nothing searchable is left.
 */
export function toPrefixQuery(text: string): string | null {
  const words = (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 2).slice(0, 6)
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null
}

/** Words a roadmap stage title is made of that say nothing about its subject
 *  ("Deepen AWS and Cloud Fundamentals" is about aws and cloud). */
const STAGE_FILLER = new Set([
  'a', 'an', 'and', 'or', 'the', 'of', 'to', 'in', 'on', 'for', 'with', 'via', 'into', 'through', 'your', 'my',
  'learn', 'learning', 'master', 'mastering', 'gain', 'build', 'building', 'complete', 'completing', 'deepen',
  'understand', 'understanding', 'fundamentals', 'fundamental', 'basics', 'basic', 'principles', 'expertise',
  'skills', 'skill', 'advanced', 'intermediate', 'beginner', 'intro', 'introduction', 'core', 'essentials',
  'practice', 'practical', 'hands', 'real', 'world', 'get', 'become', 'transition', 'role', 'current',
  'situation', 'gap', 'analysis', 'stage', 'step', 'level', 'start', 'starting', 'foundations', 'foundation',
  'concepts', 'key', 'strong', 'solid', 'deep', 'dive', 'apply', 'applying', 'using', 'use', 'work', 'working',
  'professional', 'internship', 'project', 'projects', 'design', 'optimization', 'preparation',
])

/** Common short forms and their long forms, both directions, plus the
 *  combined tags people actually type — so "ML" in a stage title finds a
 *  "Machine Learning" tag and "LLM" finds "LLM/RAG". Lower-case. */
const STAGE_ALIASES: Record<string, string[]> = {
  ml: ['machine learning'],
  'machine learning': ['ml'],
  ai: ['artificial intelligence'],
  'artificial intelligence': ['ai'],
  llm: ['llms', 'llm/rag', 'large language models'],
  llms: ['llm', 'llm/rag'],
  rag: ['llm/rag'],
  k8s: ['kubernetes'],
  kubernetes: ['k8s'],
  js: ['javascript'],
  javascript: ['js'],
  ts: ['typescript'],
  typescript: ['ts'],
  dsa: ['data structures', 'algorithms'],
  nlp: ['natural language processing'],
  cv: ['computer vision'],
  devops: ['ci/cd'],
  sql: ['databases'],
  'system design': ['architecture'],
  cloud: ['aws', 'azure', 'gcp'],
  // Design: a UX stage rarely names its tools, so "Figma" shares need these.
  ux: ['user research', 'ui design', 'figma'],
  prototyping: ['figma'],
  // DevOps.
  containerisation: ['docker', 'kubernetes'],
  containerization: ['docker', 'kubernetes'],
  'ci/cd': ['github actions', 'jenkins'],
  pipelines: ['ci/cd'],
  // Product.
  product: ['product management'],
  prioritisation: ['product management'],
  prioritization: ['product management'],
  dashboarding: ['power bi', 'tableau', 'data visualization'],
  visualisation: ['data visualization'],
  visualization: ['data visualization'],
}

/**
 * What a roadmap stage is about, for matching shares to it across roadmaps.
 *
 * Roadmaps are written per person, so the same subject appears under
 * different wording ("Deepen AWS and Cloud Fundamentals", "Learn AWS basics").
 * Matching on the exact title would show a share only to people with the same
 * sentence. Instead: the meaningful single words, the two-word terms
 * ("data analysis", "system design" — kept even when one word alone is
 * filler), and their common aliases — as normalised values to compare with
 * share skill tags (GIN &&). The tag half of matching; meaning is matched by
 * embeddings (learningEmbed.ts).
 */
export function stageMatchTerms(stageTitle: string): { tags: string[] } {
  const words = (stageTitle.toLowerCase().match(/[a-z0-9+#.]+/g) ?? []).map((w) => w.replace(/^\.+|\.+$/g, ''))
  const connector = new Set(['and', 'or', 'of', 'the', 'to', 'in', 'for', 'with', 'via', 'a', 'an'])
  const terms = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w.length >= 2 && !STAGE_FILLER.has(w)) terms.add(w)
    const next = words[i + 1]
    // A two-word term counts when its FIRST word is the subject — "data
    // analysis", "cloud architecture", "machine learning" — not "deepen aws".
    if (next && w.length >= 2 && !STAGE_FILLER.has(w) && !connector.has(next)) terms.add(`${w} ${next}`)
  }
  const tags = new Set<string>()
  for (const t of terms) {
    tags.add(normalizeTag(t))
    for (const a of STAGE_ALIASES[t] ?? []) tags.add(normalizeTag(a))
  }
  tags.delete('')
  return { tags: [...tags].slice(0, 30) }
}

/** The text a share is embedded from: everything a reader would judge it by.
 *  One fixed shape for every share, so embeddings are compared like for like.
 *  Capped at ~1500 characters, which also fits a 512-token model if one is chosen. */
export function shareEmbedText(s: {
  title: string
  kind: string
  why_helped: string
  about: string | null
  skills: string[] | null
}): string {
  const parts = [
    `${s.title}.`,
    `Type: ${s.kind}.`,
    `Why it helped: ${s.why_helped}`,
    s.about ? `About: ${s.about}` : '',
    s.skills?.length ? `Skills: ${s.skills.join(', ')}.` : '',
  ]
  return parts.filter(Boolean).join(' ').slice(0, 1500)
}

/** The text a stage topic is embedded from — the role gives the stage its
 *  context ("Fundamentals" means something different for a data analyst). */
export function topicEmbedText(t: { role_label: string; stage_label: string }): string {
  const role = t.role_label.trim()
  return (role ? `Career stage for a ${role}: ${t.stage_label}` : `Career stage: ${t.stage_label}`).slice(0, 500)
}

/** Escapes LIKE wildcards so a typed "%" or "_" matches itself. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** Parses a ?limit= query value, clamped to [1, max]. Lists that can grow
 *  without bound page by keyset — "rows older than the last id you have" —
 *  rather than OFFSET, because OFFSET makes the database walk and discard
 *  every skipped row: page 50 would read 1,000 rows to return 20. */
export function pageLimit(value: unknown, fallback = 20, max = 50): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.min(Math.floor(n), max)
}

/** Parses ?afterAt= — the created_at the client SAW the last row at, sent with
 *  ?after=<id> so paging survives that row being deleted (its own created_at
 *  can no longer be looked up then). Null unless it is a real timestamp. */
export function afterAtParam(value: unknown): string | null {
  return typeof value === 'string' && value && !Number.isNaN(Date.parse(value)) ? value : null
}

/**
 * The keyset cursor for a list ordered by (created_at DESC, id DESC), as SQL.
 *
 * The last row's own (created_at, id) when it still exists — exact. When it
 * has been deleted since the page was shown (a mentor removed an assignment, an
 * author took a share back), the position the client saw it at instead. That
 * timestamp is millisecond-precise and the column microsecond, so it is rounded
 * UP to the end of its millisecond: nothing older can be skipped, and at worst
 * a row from that same millisecond is sent twice, which the client drops by id.
 * Without the fallback the lookup comes back empty, every comparison against
 * it is NULL, and "Load more" returns nothing — the list looks finished.
 */
export function cursorRowSql(table: string, idParam: string, atParam: string): string {
  return `SELECT created_at, id FROM ${table} WHERE id = ${idParam}
     UNION ALL
     SELECT ${atParam}::timestamptz + interval '999 microseconds', ${idParam}::text
      WHERE ${atParam}::timestamptz IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ${idParam})
     LIMIT 1`
}
