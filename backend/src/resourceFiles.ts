import type pg from 'pg'
import { ApiError } from './http.js'

/**
 * Attachments on an assigned career resource (career_resource_files).
 *
 * Files are uploaded through Add resource's pipeline (POST
 * /api/learning/uploads), which already enforces size, blocked types and the
 * daily cap, and land as unclaimed rows in learning_share_files. Claiming
 * copies them into career_resource_files and removes the upload rows — see
 * the schema.sql note on why this is a separate table.
 */

/** Most files on one resource, and on one submission. Same as Add resource. */
export const MAX_RESOURCE_FILES = 10

/**
 * Moves the caller's own unclaimed uploads onto a resource, in the order
 * given. One statement: copy, delete, count — and the caller runs it inside
 * the same transaction as the resource write, so a missing file rolls the
 * whole thing back rather than leaving a resource short of files.
 */
export async function claimUploads(
  client: pg.PoolClient,
  resourceId: string,
  fileIds: string[],
  me: string,
  role: 'assigned' | 'evidence',
): Promise<void> {
  if (!fileIds.length) return
  const r = await client.query<{ n: number }>(
    `WITH picked AS (
       DELETE FROM learning_share_files
        WHERE id = ANY($2::text[]) AND owner_id = $3 AND share_id IS NULL
        RETURNING id, owner_id, name, mime, size_bytes, data),
     moved AS (
       INSERT INTO career_resource_files (resource_id, role, owner_id, name, mime, size_bytes, data, position)
       SELECT $1, $4, owner_id, name, mime, size_bytes, data, array_position($2::text[], id) - 1
         FROM picked
       RETURNING 1)
     SELECT count(*)::int AS n FROM moved`,
    [resourceId, fileIds, me, role],
  )
  if (r.rows[0].n !== fileIds.length) {
    throw new ApiError(400, 'Some files are no longer available — please attach them again')
  }
}
