/**
 * GroupSessionsTab announces every fresh load of its lists, so the Mentorship
 * right sidebar (a sibling under AppLayout) shows the same data without
 * fetching it a second time — and stays in step after a join, leave or cancel.
 *
 * The last load is also kept here, so a sidebar that mounts later (say the
 * window is widened past xl) can start from it instead of missing the event.
 * It's tagged with the member it belongs to, so after switching accounts one
 * person's sessions are never shown to another.
 */
import type { GroupSession } from '../../types'

export const GROUP_SESSIONS_EVENT = 'rc:group-sessions'
export type GroupSessionsSnapshot = { open: GroupSession[]; mine: GroupSession[] }
export type GroupSessionsLoad = { owner: string; snapshot: GroupSessionsSnapshot }

let last: GroupSessionsLoad | null = null

export function publishGroupSessions(owner: string, snapshot: GroupSessionsSnapshot) {
  last = { owner, snapshot }
  window.dispatchEvent(new CustomEvent<GroupSessionsLoad>(GROUP_SESSIONS_EVENT, { detail: last }))
}

/** The most recent load for this member, if the tab has loaded one. */
export function lastGroupSessions(owner: string): GroupSessionsSnapshot | null {
  return last && last.owner === owner ? last.snapshot : null
}
