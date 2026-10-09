import { BadgeCheck } from 'lucide-react'
import { badgeTierClasses } from '../../lib/format'
import type { ProfileStats } from '../../types'

/** A mentor's earned badges, or how to earn the first. Shared by Mentor Space
 *  (narrow screens) and the Mentorship right sidebar (wide screens). */
export function MentorBadgeChips({ stats }: { stats: ProfileStats | null }) {
  if (!stats || stats.badges.length === 0) {
    return (
      <p className="text-sm text-muted">
        Complete a session and have your mentee confirm it to earn your first badge.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      {stats.badges.map((b) => (
        <span
          key={b.id}
          title={b.description}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeTierClasses(b.tier)}`}
        >
          <BadgeCheck size={13} />
          {b.name}
        </span>
      ))}
    </div>
  )
}
