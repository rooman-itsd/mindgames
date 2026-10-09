/**
 * GroupSessionsTab announces every fresh load of its lists, so the Mentorship
 * right sidebar (a sibling under AppLayout) shows the same data without
 * fetching it a second time — and stays in step after a join, leave or cancel.
 */
import type { GroupSession } from '../../types'

export const GROUP_SESSIONS_EVENT = 'rc:group-sessions'
export type GroupSessionsSnapshot = { open: GroupSession[]; mine: GroupSession[] }

export function publishGroupSessions(snapshot: GroupSessionsSnapshot) {
  window.dispatchEvent(new CustomEvent<GroupSessionsSnapshot>(GROUP_SESSIONS_EVENT, { detail: snapshot }))
}
