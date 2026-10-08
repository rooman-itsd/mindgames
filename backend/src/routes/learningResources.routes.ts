import { Router } from 'express'
import { z } from 'zod'
import { query, withTransaction } from '../db/pool.js'
import { requireAuth } from '../auth/middleware.js'
import { ApiError, asyncHandler } from '../http.js'
import { mapLearningShare, type LearningShareRow } from '../mappers.js'
import { MAX_TAGS, PROJECT_DIFFICULTIES, SHARES_PER_DAY, WHY_HELPED_MIN, cleanTags } from '../learning.js'
import { kickLearningEmbed } from '../learningEmbed.js'
import { SHARE_AUDIENCE_OK, SHARE_SELECT, moveTagCounts } from './learning.routes.js'

/**
 * "Add resource" on Learning Resources: a resource for any domain, made of
 * attached files (any media, up to MAX_FILES) — no link, no roadmap stage.
 *
 *   POST   /api/learning/uploads                    one file in, its id out
 *   DELETE /api/learning/uploads/:id                 drop one not yet attached
 *   POST   /api/learning/resources                  the resource, claiming its uploads
 *   GET    /api/learning/shares/:id/files/:fileId   one file's bytes, if you may see it
 *
 * Files go up one request each, before the resource is submitted: ten files
 * in one JSON body would pass the 15 MB body limit (server.ts), one never does.
 * A resource is an ordinary learning_shares row (kind 'doc', no url, its
 * domains as its tags), so All Resources, search, filters, saving, "Helped
 * me" and reports all work on it unchanged.
 */
export const learningResourcesRouter = Router()

/** Most files on one resource. */
const MAX_FILES = 10
/** Largest single file. Its base64 (×4/3) still fits the 15 MB JSON limit. */
const MAX_FILE_BYTES = 10 * 1024 * 1024
/** Uploads a member may hold unattached at once — enough to swap a few files
 *  while filling the form, not enough to use this as free storage. */
const MAX_PENDING = 20

/** Types a browser may show in place (opened in a tab). Everything else is
 *  sent as a download with a generic type, so an uploaded HTML or SVG file
 *  can never run as a page on our origin. */
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|avif)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp4|ogg|wav|webm|aac)|application\/pdf)$/
/** Never accepted: programs and scripts. */
const BLOCKED_NAME = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|mjs|jar|apk|dll|sh|html?|svg|xhtml)$/i

const uploadSchema = z.object({
  name: z.string().trim().min(1, 'The file needs a name').max(200),
  // Browsers send '' for unknown types; anything odd is replaced below.
  mime: z.string().trim().max(200).default(''),
  // base64 without the data: prefix (lib/file.ts toBase64). Empty is handled
  // below with its own message.
  data: z.string().max(Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8, 'That file is too large — the most is 10 MB'),
})

// POST /api/learning/uploads — one file, kept unattached until a resource
// claims it. Also sweeps this member's own unclaimed uploads older than a day
// (one index range on idx_learning_share_files_pending).
learningResourcesRouter.post(
  '/uploads',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = uploadSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const me = req.user!.sub
    // Strip any path a browser might send, keep the name readable.
    const name = parsed.data.name.split(/[\\/]/).pop()!.slice(0, 200)
    if (BLOCKED_NAME.test(name)) throw new ApiError(400, 'Programs, scripts and web pages cannot be attached')
    const bytes = Buffer.from(parsed.data.data, 'base64')
    if (!bytes.length) throw new ApiError(400, 'That file is empty')
    if (bytes.length > MAX_FILE_BYTES) throw new ApiError(400, 'That file is too large — the most is 10 MB')
    const mime = /^[\w.+-]+\/[\w.+-]+$/.test(parsed.data.mime) ? parsed.data.mime.toLowerCase() : 'application/octet-stream'

    // Sweep, count and insert as one transaction under this member's own
    // lock: the form uploads files in parallel, and without it each request
    // would count the others' files as not there yet and pass the cap.
    const id = await withTransaction(async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`learning_upload:${me}`])
      await client.query(
        `DELETE FROM learning_share_files
          WHERE owner_id = $1 AND share_id IS NULL AND created_at < now() - interval '1 day'`,
        [me],
      )
      const pending = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM learning_share_files WHERE owner_id = $1 AND share_id IS NULL`,
        [me],
      )
      if (pending.rows[0].n >= MAX_PENDING) {
        throw new ApiError(429, 'Too many files waiting to be added — finish or close the form first')
      }
      const r = await client.query<{ id: string }>(
        `INSERT INTO learning_share_files (owner_id, name, mime, size_bytes, data)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [me, name, mime, bytes.length, bytes],
      )
      return r.rows[0].id
    })
    res.status(201).json({ id, name, mime, size: bytes.length })
  }),
)

// DELETE /api/learning/uploads/:id — the × on a file before the form is sent.
// Only the uploader's own, and only while it is not part of a resource.
learningResourcesRouter.delete(
  '/uploads/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await query(`DELETE FROM learning_share_files WHERE id = $1 AND owner_id = $2 AND share_id IS NULL`, [
      req.params.id,
      req.user!.sub,
    ])
    res.status(204).end()
  }),
)

const resourceSchema = z.object({
  // Picked domains plus any typed under "Others" — they become the tags.
  domains: z.array(z.string().trim().min(1).max(40)).min(1, 'Pick at least one domain').max(MAX_TAGS, `Pick up to ${MAX_TAGS} domains`),
  title: z.string().trim().min(3, 'Give it a title').max(160),
  fileIds: z.array(z.string().min(1).max(64)).min(1, 'Attach at least one file').max(MAX_FILES, `Attach up to ${MAX_FILES} files`),
  whyHelped: z
    .string()
    .trim()
    .min(WHY_HELPED_MIN, `Say in a sentence why it helped (at least ${WHY_HELPED_MIN} characters)`)
    .max(500),
  difficulty: z.enum(PROJECT_DIFFICULTIES),
  audience: z.enum(['everyone', 'connections']).default('everyone'),
})

// POST /api/learning/resources — publish a resource from uploaded files.
// Published at once, like any share; the daily cap and member reports are
// what keep quality up. The row and its file claims land together.
learningResourcesRouter.post(
  '/resources',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = resourceSchema.safeParse(req.body)
    if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message)
    const d = parsed.data
    const me = req.user!.sub
    const fileIds = [...new Set(d.fileIds)]
    const tags = cleanTags(d.domains)
    if (!tags.length) throw new ApiError(400, 'Pick at least one domain')

    const id = await withTransaction(async (client) => {
      // Same per-member lock and daily cap as POST /shares — both add to
      // learning_shares, so they share one count.
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
           (topic_key, shared_by, kind, title, url, url_norm, why_helped, skills, difficulty, audience, file_count)
         VALUES (NULL, $1, 'doc', $2, NULL, NULL, $3, $4, $5, $6, $7)
         RETURNING id`,
        [me, d.title, d.whyHelped, tags.map((t) => t.tag), d.difficulty, d.audience, fileIds.length],
      )
      const shareId = ins.rows[0].id
      // Claim exactly the member's own unattached uploads, in the order given.
      const claimed = await client.query(
        `UPDATE learning_share_files
            SET share_id = $1, position = array_position($2::text[], id) - 1
          WHERE id = ANY($2::text[]) AND owner_id = $3 AND share_id IS NULL`,
        [shareId, fileIds, me],
      )
      if (claimed.rowCount !== fileIds.length) {
        // Rolls the share back too: a resource never exists with missing files.
        throw new ApiError(400, 'Some files are no longer available — please attach them again')
      }
      await moveTagCounts(client, tags, 1)
      return shareId
    })

    kickLearningEmbed()
    const full = await query<LearningShareRow>(`${SHARE_SELECT} WHERE s.id = $2`, [me, id])
    res.status(201).json({ share: mapLearningShare(full.rows[0]) })
  }),
)

// GET /api/learning/shares/:id/files/:fileId — one attached file, to anyone
// who may see the resource (the sharer always; others while it is not hidden
// and its audience includes them). Sent with nosniff, and as a download
// unless it is a type browsers show safely in place.
learningResourcesRouter.get(
  '/shares/:id/files/:fileId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query<{ name: string; mime: string; data: Buffer }>(
      `SELECT f.name, f.mime, f.data
         FROM learning_share_files f
         JOIN learning_shares s ON s.id = f.share_id
        WHERE f.id = $2 AND s.id = $3
          AND (s.shared_by = $1 OR (NOT s.hidden AND ${SHARE_AUDIENCE_OK}))`,
      [req.user!.sub, req.params.fileId, req.params.id],
    )
    if (!r.rowCount) throw new ApiError(404, 'That file was not found')
    const f = r.rows[0]
    const inline = INLINE_TYPES.test(f.mime)
    res.setHeader('Content-Type', inline ? f.mime : 'application/octet-stream')
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    res.send(f.data)
  }),
)
