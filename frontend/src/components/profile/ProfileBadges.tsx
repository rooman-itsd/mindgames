import { Award, Briefcase, Search, Handshake, BookOpen } from 'lucide-react'
import type { ProfileTag, TagVerificationStatus, User } from '../../types'

const TAG_CONFIG: Record<ProfileTag, {
  label: string
  classes: string
  icon: React.ReactNode
  verifiedClasses: string
  unverifiedClasses: string
  description: string
}> = {
  'Mentor': {
    label: 'Mentor',
    classes: 'bg-brand-100 text-brand',
    verifiedClasses: 'bg-brand-100 text-brand',
    unverifiedClasses: 'bg-brand-50 text-brand-600 opacity-75',
    icon: <Award size={14} />,
    description: 'Listed on the Mentorship page',
  },
  'Hiring': {
    label: 'Hiring',
    classes: 'bg-green-100 text-green-700',
    verifiedClasses: 'bg-green-100 text-green-700',
    unverifiedClasses: 'bg-green-50 text-green-600 opacity-75',
    icon: <Briefcase size={14} />,
    description: 'Actively hiring for their team',
  },
  'Open to Work': {
    label: 'Open to Work',
    classes: 'bg-blue-100 text-blue-700',
    verifiedClasses: 'bg-blue-100 text-blue-700',
    unverifiedClasses: 'bg-blue-50 text-blue-600 opacity-75',
    icon: <Search size={14} />,
    description: 'Actively looking for opportunities',
  },
  'Willing to give referral': {
    label: 'Willing to give referral',
    classes: 'bg-indigo-100 text-indigo-700',
    verifiedClasses: 'bg-indigo-100 text-indigo-700',
    unverifiedClasses: 'bg-indigo-50 text-indigo-600 opacity-75',
    icon: <Handshake size={14} />,
    description: 'Can help with job referrals',
  },
  'Need mentorship': {
    label: 'Need mentorship',
    classes: 'bg-purple-100 text-purple-700',
    verifiedClasses: 'bg-purple-100 text-purple-700',
    unverifiedClasses: 'bg-purple-50 text-purple-600 opacity-75',
    icon: <BookOpen size={14} />,
    description: 'Looking for mentorship',
  },
}

function getVerificationStatus(tag: ProfileTag, user: User): TagVerificationStatus {
  // "Willing to give referral" is verified if:
  // - employerVerified (work email confirmed) AND
  // - connectionsCount >= 50
  if (tag === 'Willing to give referral') {
    return (user.employerVerified && user.connectionsCount >= 50) ? 'verified' : 'unverified'
  }

  // Check if user is flagged (has reports)
  if (user.reportCount && user.reportCount > 0) {
    return 'flagged'
  }

  // Default: verified if tag is explicitly set, unverified otherwise
  return 'verified'
}

export function ProfileBadges({ user }: { user: User }) {
  const tags = user.profileTags ?? []
  if (tags.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const config = TAG_CONFIG[tag]
        const status = getVerificationStatus(tag, user)
        const badgeClasses = status === 'verified' ? config.verifiedClasses : config.unverifiedClasses
        const showWarning = status === 'unverified' && tag === 'Willing to give referral'
        const isFlagged = status === 'flagged'

        return (
          <div
            key={tag}
            className="group relative"
            title={isFlagged ? 'This user has been flagged' : config.description}
          >
            <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${badgeClasses}`}>
              {config.icon}
              <span>{config.label}</span>
              {status === 'verified' && tag === 'Willing to give referral' && (
                <span className="text-[10px]">✓</span>
              )}
              {showWarning && (
                <span className="text-[10px] ml-1">⚠️</span>
              )}
              {isFlagged && (
                <span className="ml-1 text-red-500">🚫</span>
              )}
            </div>

            {/* Tooltip on hover */}
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 whitespace-nowrap">
              {isFlagged && 'This user has been flagged by the community'}
              {showWarning && 'Unverified — requires employer verification + 50 connections'}
              {!isFlagged && !showWarning && config.description}
            </div>
          </div>
        )
      })}
    </div>
  )
}
