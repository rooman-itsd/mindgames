import { useEffect, useState } from 'react'
import { Award, Calendar, Clock, Flame, GraduationCap, Heart, Star } from 'lucide-react'
import { api } from '../../lib/api'
import { badgeTierClasses } from '../../lib/format'
import type { ProfileStats } from '../../types'

/**
 * The record built from real, verified activity: mentorship sessions BOTH
 * sides confirmed, events actually attended (not just RSVP'd), and like
 * involvement given and received. Visible on anyone's profile, not just your
 * own — same as `user.sessionsConducted` above it, this is a claim about the
 * member other people read, so nothing here is self-reported.
 */
export function MentorshipRecord({ userId }: { userId: string }) {
  const [stats, setStats] = useState<ProfileStats | null>(null)

  useEffect(() => {
    let live = true
    api.getProfileStats(userId).then((s) => { if (live) setStats(s) }, () => {})
    return () => { live = false }
  }, [userId])

  if (!stats) return null

  const hasMentored = stats.sessionsGiven > 0
  const hasLearned = stats.sessionsTaken > 0
  const hasCommunity = stats.eventsAttended > 0 || stats.likesGiven > 0 || stats.likesReceived > 0
  // Nothing to show yet — a brand-new member's card would otherwise be an
  // empty row of zeros, which reads as broken rather than "hasn't started".
  if (!hasMentored && !hasLearned && !hasCommunity && stats.badges.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {hasMentored && (
          <RecordTile icon={<GraduationCap size={14} />} value={stats.sessionsGiven} label="Mentored" />
        )}
        {hasMentored && <RecordTile icon={<Clock size={14} />} value={`${stats.hoursGiven}h`} label="Hours given" />}
        {hasLearned && (
          <RecordTile icon={<GraduationCap size={14} />} value={stats.sessionsTaken} label="Sessions taken" />
        )}
        {hasLearned && <RecordTile icon={<Clock size={14} />} value={`${stats.hoursTaken}h`} label="Hours learned" />}
        {stats.avgRating !== null && (
          <RecordTile icon={<Star size={14} />} value={`${stats.avgRating}★`} label={`${stats.ratingCount} ratings`} />
        )}
        {stats.eventsAttended > 0 && (
          <RecordTile icon={<Calendar size={14} />} value={stats.eventsAttended} label="Events attended" />
        )}
        {stats.likesGiven > 0 && (
          <RecordTile icon={<Heart size={14} />} value={stats.likesGiven} label="Likes given" />
        )}
        {stats.likesReceived > 0 && (
          <RecordTile icon={<Heart size={14} />} value={stats.likesReceived} label="Likes received" />
        )}
        {Math.max(stats.mentorStreakWeeks, stats.learnerStreakWeeks) > 0 && (
          <RecordTile
            icon={<Flame size={14} />}
            value={Math.max(stats.mentorStreakWeeks, stats.learnerStreakWeeks)}
            label="Week streak"
          />
        )}
      </div>

      {stats.badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stats.badges.map((b) => (
            <span
              key={b.id}
              title={b.description}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeTierClasses(b.tier)}`}
            >
              <Award size={12} />
              {b.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function RecordTile({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="rounded-lg bg-page px-3 py-2 text-center">
      <span className="flex items-center justify-center gap-1 text-lg font-bold leading-tight text-ink">
        <span className="text-brand">{icon}</span>
        {value}
      </span>
      <span className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</span>
    </div>
  )
}
