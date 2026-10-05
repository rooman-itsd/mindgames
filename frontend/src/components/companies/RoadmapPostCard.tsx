import { Award, GraduationCap, Handshake, Route, Users } from 'lucide-react'
import { Avatar, Card, CompanyLogo, cx } from '../ui'
import { timeAgo } from '../../lib/format'
import type { CompanyRoadmap } from '../../types'

// A roadmap rendered as a feed post.
//
// Same reading order as the post cards in the feed: who and where, then a
// headline, then the body, then a row of facts. That ordering is what makes a
// list of these skimmable — you decide whether to open one from the title
// alone, exactly as you would in a feed.
//
// The company takes the "posted in" slot rather than the person, because these
// are read on a company's page: which company it is, is the context; who wrote
// it is the byline.
export function RoadmapPostCard({
  roadmap,
  companyName,
  companyLogoUrl,
  isMine,
  onOpen,
}: {
  roadmap: CompanyRoadmap
  companyName: string
  companyLogoUrl?: string
  /** The viewer's own roadmap, badged and pinned to the top of the list. */
  isMine?: boolean
  onOpen: () => void
}) {
  // A contributor's own words if they wrote any, otherwise a title built from
  // the timeline — never an empty heading.
  const previous = roadmap.steps.find((s) => !s.atThisCompany)
  const title =
    roadmap.headline ||
    (previous
      ? `From ${previous.role || 'a role'} at ${previous.company} to ${roadmap.roleGoal || roadmap.currentRole}`
      : `How ${roadmap.name.split(' ')[0]} got into ${companyName}`)

  const body =
    roadmap.advice ||
    roadmap.stages.map((s) => s.title).join(' · ') ||
    roadmap.steps
      .map((s) => `${s.role || 'Role'} at ${s.company}${s.period ? ` (${s.period})` : ''}`)
      .join('  →  ')

  return (
    <Card className={cx('overflow-hidden', isMine && 'border-[#ffd9cc]')}>
      {isMine && (
        <div className="border-b border-orange-100 bg-orange-50 px-4 py-1.5 text-xs font-semibold text-[#ff4500]">
          Your roadmap — visible to everyone viewing {companyName}
        </div>
      )}

      {/* Who and where */}
      <div className="flex items-center gap-2 px-4 pt-3">
        <CompanyLogo name={companyName} logoUrl={companyLogoUrl} size={22} />
        <span className="text-xs font-bold text-[#1c1c1c]">{companyName}</span>
        <span className="text-xs text-[#878a8c]">·</span>
        <Avatar name={roadmap.name} src={roadmap.photo} size={18} />
        <span className="truncate text-xs text-[#878a8c]">
          {roadmap.name}
          {roadmap.roleGoal || roadmap.currentRole ? ` · ${roadmap.roleGoal || roadmap.currentRole}` : ''}
        </span>
        {roadmap.updatedAt && (
          <>
            <span className="text-xs text-[#878a8c]">·</span>
            <span className="shrink-0 text-xs text-[#878a8c]">{timeAgo(roadmap.updatedAt)}</span>
          </>
        )}
        {roadmap.contributed && (
          <span className="ml-auto shrink-0 rounded-full bg-[#fff1ec] px-2 py-0.5 text-[10px] font-semibold text-[#c2410c]">
            Shared their path
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="px-4 pt-2 text-base font-bold text-[#1c1c1c]">{title}</h3>

      {/* Body */}
      {body && <p className="line-clamp-3 px-4 pt-1 text-sm text-[#6b6e70]">{body}</p>}

      {/* Facts, then the way in */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#edeff1] px-4 py-2.5 text-xs text-[#878a8c]">
        {roadmap.steps.length > 0 && (
          <span className="flex items-center gap-1">
            <Route size={13} /> {roadmap.steps.length} step{roadmap.steps.length > 1 ? 's' : ''}
          </span>
        )}
        {roadmap.certifications.length > 0 && (
          <span className="flex items-center gap-1">
            <Award size={13} /> {roadmap.certifications.length} certification
            {roadmap.certifications.length > 1 ? 's' : ''}
          </span>
        )}
        {roadmap.course && (
          <span className="flex items-center gap-1">
            <GraduationCap size={13} /> {roadmap.course}
          </span>
        )}
        {roadmap.mutualConnections > 0 && (
          <span className="flex items-center gap-1">
            <Users size={13} /> {roadmap.mutualConnections} mutual
          </span>
        )}
        {roadmap.openToReferrals && (
          <span className="flex items-center gap-1 font-semibold text-[#c2410c]">
            <Handshake size={13} /> Open to referrals
          </span>
        )}
        <button
          onClick={onOpen}
          className="ml-auto shrink-0 font-semibold text-[#ff4500] hover:underline"
        >
          Click here to see the full roadmap
        </button>
      </div>
    </Card>
  )
}
