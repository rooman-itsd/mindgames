/**
 * Mentor Space ↔ Mentorship right sidebar (siblings under AppLayout).
 * MentorWorkspace announces the stats it loaded, so the sidebar's Badges card
 * needs no second request; the sidebar's "Manage services" asks the workspace
 * to open its services panel, which is too wide to live in the sidebar.
 */
import type { ProfileStats } from '../../types'

export const MENTOR_STATS_EVENT = 'rc:mentor-stats'
export const MANAGE_SERVICES_EVENT = 'rc:manage-services'

export function publishMentorStats(stats: ProfileStats) {
  window.dispatchEvent(new CustomEvent<ProfileStats>(MENTOR_STATS_EVENT, { detail: stats }))
}

export function openManageServices() {
  window.dispatchEvent(new Event(MANAGE_SERVICES_EVENT))
}
