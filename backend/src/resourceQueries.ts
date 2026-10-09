/**
 * The one SELECT for a career_resources row as the API returns it — owner
 * name, session topic/status, and who it was assigned to.
 *
 * Shared by careerResources.routes.ts and learning.routes.ts (the "Assigned to
 * You" tab) so both feed mapCareerResource exactly the columns it expects;
 * mapCareerResource has no fallback for a column a query forgot.
 *
 * No photo columns: no screen shows them, and a profile photo is a data URL of
 * up to ~400 KB — on every row of a list it was most of the response.
 */
/**
 * A share's attached files as JSON ({id, name, mime, size}[], in order), or
 * NULL when it has none — one index range on idx_learning_share_files_share,
 * only for shares with files, never the bytes. `alias` is the learning_shares
 * alias in the surrounding query. Shared by SHARE_SELECT and RESOURCE_SELECT.
 */
export function shareFilesJson(alias: string, onlyIf = 'TRUE'): string {
  return `CASE WHEN ${alias}.file_count > 0 AND (${onlyIf}) THEN
           (SELECT json_agg(json_build_object('id', f.id, 'name', f.name, 'mime', f.mime, 'size', f.size_bytes)
                            ORDER BY f.position)
              FROM learning_share_files f WHERE f.share_id = ${alias}.id)
         END`
}

export const RESOURCE_SELECT = `
  SELECT r.*, u.name AS owner_name, s.topic AS session_topic, s.status AS session_status,
         s.ended_at AS session_ended_at,
         a.name AS assignee_name, sh_u.name AS share_sharer_name,
         -- A saved copy of a files-only resource (Add resource) has no url;
         -- its files' details let Saved Resources open them. Not once reports
         -- have hidden it: the download would refuse them anyway.
         ${shareFilesJson('sh', 'NOT sh.hidden')} AS share_files,
         -- The title of the stage it is filed under, so a mentee sees which of
         -- their stages a mentor assigned it to. Only assigned rows use it
         -- (personal saves group by stage client-side), so the CASE skips the
         -- roadmap read for every other row; when it runs, it is one
         -- primary-key lookup and a walk of that roadmap's few stages.
         CASE WHEN r.assigned_to IS NOT NULL AND r.step_key IS NOT NULL THEN
           (SELECT st->>'title'
              FROM career_roadmaps cr, jsonb_array_elements(cr.data->'stages') st
             WHERE cr.id = r.roadmap_id AND st->>'stepKey' = r.step_key
             LIMIT 1)
         END AS step_title,
         -- Its attachments — the mentor's and any sent back as evidence —
         -- names and sizes only, never the bytes. Only a resource handed to
         -- someone can have files (create refuses them on personal saves, and
         -- session and direct assignments both set assigned_to), so the CASE
         -- skips the lookup for every other row; when it runs, it is one index
         -- range on idx_career_resource_files_resource.
         CASE WHEN r.assigned_to IS NOT NULL THEN
           (SELECT json_agg(json_build_object('id', f.id, 'name', f.name, 'mime', f.mime,
                                              'size', f.size_bytes, 'role', f.role)
                            ORDER BY f.role, f.position)
              FROM career_resource_files f WHERE f.resource_id = r.id)
         END AS resource_files
    FROM career_resources r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN mentorship_sessions s ON s.id = r.session_id
    LEFT JOIN users a ON a.id = r.assigned_to
    LEFT JOIN learning_shares sh ON sh.id = r.share_id
    LEFT JOIN users sh_u ON sh_u.id = sh.shared_by`
