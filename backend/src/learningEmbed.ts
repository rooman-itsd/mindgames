import { query } from './db/pool.js'
import { EMBED_MODEL, EmbedUnavailableError, embedTexts, embeddingsEnabled, toVectorLiteral } from './embeddings.js'
import { shareEmbedText, topicEmbedText } from './learning.js'

/**
 * Turns Learning Resources shares and stage topics into embeddings, in the
 * background, so a stage can show the shares closest to it in MEANING.
 *
 * Each row is embedded once. Every 30s the worker claims a batch of rows that
 * have no embedding yet and sends the whole batch in ONE call — page requests
 * never wait on it, and its cost grows with how many NEW shares and stages
 * appear, not with how many members open the page.
 *
 * Claims are made in the database (FOR UPDATE SKIP LOCKED plus a retry-after
 * time), so several server instances can run this without embedding a row
 * twice, and a crash mid-batch only delays those rows until their retry time.
 */

const TICK_MS = 30_000
/** Rows per call — one request embeds this many texts. */
const BATCH = 32
/** A row that fails this many times is left alone rather than retried forever. */
const MAX_ATTEMPTS = 3
/** After a rate limit or an outage, the whole worker waits this long — so a
 *  long outage costs one call per pause, and no row loses an attempt to it. */
const RATE_LIMIT_PAUSE_MS = 10 * 60_000

let running = false
let pausedUntil = 0
let modelChecked = false

// Whether the database has the embedding columns (pgvector installed). Once
// true it stays true; false is re-checked every few minutes, so installing
// pgvector later turns this on without a restart.
let ready: boolean | null = null
let readyCheckedAt = 0
export async function vectorsReady(): Promise<boolean> {
  if (ready) return true
  if (ready === false && Date.now() - readyCheckedAt < 5 * 60_000) return false
  const r = await query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_name = 'learning_topics' AND column_name = 'embedding'`,
  )
  ready = !!r.rowCount
  readyCheckedAt = Date.now()
  return ready
}

type Table = 'learning_shares' | 'learning_topics'

/** What each table is keyed by, what it reads, and how a row becomes text. */
const SOURCES: Record<
  Table,
  { key: string; cols: string; role: 'query' | 'document'; text: (row: Record<string, unknown>) => string }
> = {
  learning_shares: {
    key: 'id',
    cols: 's.title, s.kind, s.why_helped, s.about, s.skills',
    role: 'document',
    text: (r) => shareEmbedText(r as Parameters<typeof shareEmbedText>[0]),
  },
  learning_topics: {
    key: 'topic_key',
    cols: 's.role_label, s.stage_label',
    // A stage is what a member is looking FOR — the query side.
    role: 'query',
    text: (r) => topicEmbedText(r as Parameters<typeof topicEmbedText>[0]),
  },
}

/** Embeds one batch from one table. Returns how many rows it embedded. */
async function embedBatch(table: Table): Promise<number> {
  const { key, cols, role, text } = SOURCES[table]
  // Claim: lock waiting rows other instances have not locked, and push their
  // retry time forward so nobody else takes them once the lock is released.
  // Walks the partial queue index — only rows still waiting are read.
  const claimed = await query<Record<string, unknown> & { k: string }>(
    `WITH c AS (
       SELECT ${key} FROM ${table}
        WHERE embed_model IS NULL AND embed_attempts < $2
          AND (embed_next_at IS NULL OR embed_next_at <= now())
        ORDER BY created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED)
     UPDATE ${table} s
        SET embed_attempts = s.embed_attempts + 1,
            embed_next_at = now() + make_interval(mins => 5 * (s.embed_attempts + 1))
       FROM c WHERE s.${key} = c.${key}
     RETURNING s.${key} AS k, ${cols}`,
    [BATCH, MAX_ATTEMPTS],
  )
  if (!claimed.rowCount) return 0
  const ids = claimed.rows.map((r) => r.k)

  let vectors: number[][]
  try {
    vectors = await embedTexts(claimed.rows.map(text), role)
  } catch (err) {
    if (err instanceof EmbedUnavailableError) {
      // Rate limit or outage — not these rows' fault: give the attempt back.
      await query(
        `UPDATE ${table} SET embed_attempts = GREATEST(embed_attempts - 1, 0), embed_next_at = NULL
          WHERE ${key} = ANY($1::text[])`,
        [ids],
      )
    }
    throw err
  }

  await query(
    `UPDATE ${table} s
        SET embedding = v.e::halfvec, embed_model = $3, embed_attempts = 0, embed_next_at = NULL
       FROM unnest($1::text[], $2::text[]) AS v(k, e)
      WHERE s.${key} = v.k`,
    [ids, vectors.map(toVectorLiteral), EMBED_MODEL],
  )
  return ids.length
}

/** On a model switch, what the old model embedded is queued again: two
 *  models' numbers cannot be compared. Once per process — a no-op after the
 *  first pass, since nothing is left on the old model. */
async function requeueOtherModels() {
  for (const table of Object.keys(SOURCES) as Table[]) {
    await query(
      `UPDATE ${table} SET embedding = NULL, embed_model = NULL, embed_attempts = 0, embed_next_at = NULL
        WHERE embed_model IS NOT NULL AND embed_model <> $1`,
      [EMBED_MODEL],
    )
  }
  modelChecked = true
}

async function tick() {
  if (running || Date.now() < pausedUntil || !embeddingsEnabled) return
  running = true
  try {
    if (!(await vectorsReady())) return
    if (!modelChecked) await requeueOtherModels()
    // Stages first: a stage without an embedding falls back to the
    // rule-based match for everyone on it. Then shares, until both queues are
    // empty or this tick has done a few batches.
    for (let i = 0; i < 4; i++) {
      const done = (await embedBatch('learning_topics')) + (await embedBatch('learning_shares'))
      if (!done) break
    }
  } catch (err) {
    if (err instanceof EmbedUnavailableError) pausedUntil = Date.now() + RATE_LIMIT_PAUSE_MS
    console.warn('[learning-embed]', err instanceof Error ? err.message : err)
  } finally {
    running = false
  }
}

/** Embed soon — called after a new share or topic, so it is matched within
 *  seconds instead of waiting for the next tick. Never blocks the caller. */
export function kickLearningEmbed() {
  setTimeout(() => void tick(), 1_000)
}

export function startLearningEmbedScheduler() {
  setInterval(() => void tick(), TICK_MS)
  setTimeout(() => void tick(), 10_000)
}
