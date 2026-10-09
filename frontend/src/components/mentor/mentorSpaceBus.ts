/**
 * Mentor Space ↔ Mentorship right sidebar (siblings under AppLayout).
 * MentorWorkspace announces the stats it loaded, so the sidebar's Badges card
 * needs no second request; the sidebar's "Manage services" asks the workspace
 * to open its services panel, which is too wide to live in the sidebar.
 *
 * The last stats are kept here too, so a sidebar that mounts later (window
 * widened past xl) starts from them — tagged with their owner, so they never
 * show for a different account.
 */
import type { ProfileStats } from '../../types'

export const MENTOR_STATS_EVENT = 'rc:mentor-stats'
export const MANAGE_SERVICES_EVENT = 'rc:manage-services'
export type MentorStatsLoad = { owner: string; stats: ProfileStats }

let last: MentorStatsLoad | null = null

export function publishMentorStats(owner: string, stats: ProfileStats) {
  last = { owner, stats }
  window.dispatchEvent(new CustomEvent<MentorStatsLoad>(MENTOR_STATS_EVENT, { detail: last }))
}

/** The most recent stats for this member, if Mentor Space has loaded them. */
export function lastMentorStats(owner: string): ProfileStats | null {
  return last && last.owner === owner ? last.stats : null
}

export function openManageServices() {
  window.dispatchEvent(new Event(MANAGE_SERVICES_EVENT))
}
