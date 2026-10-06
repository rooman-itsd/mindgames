import { Link } from 'react-router-dom'
import { Briefcase, BookOpen, ChevronRight, Flag, Users, Zap, GraduationCap } from 'lucide-react'
import { Button, Card } from '../ui'
import type { CareerStage } from '../../types'

/** The single "do this next" prompt — the roadmap's first unfinished stage. */
export function NextStepCard({ stage, onFindAlumni }: { stage?: CareerStage; onFindAlumni: () => void }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-brand shadow-sm">
          <Flag size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">Next step</p>
          <p className="text-base font-bold text-ink">
            {stage ? `This week: ${stage.title}` : 'You’ve completed every stage — time to rebuild your roadmap.'}
          </p>
          {stage?.durationWeeks ? (
            <p className="mt-0.5 text-sm text-muted">
              Planned over about {stage.durationWeeks} weeks at your current pace.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button icon={<Users size={14} />} onClick={onFindAlumni}>
              Find alumni
            </Button>
            <Link to="/learning-resources">
              <Button variant="outline" icon={<BookOpen size={14} />}>View learning resources</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Shortcuts to what a member reaches for most: their saved resources (a
 *  Career Guidance feature), plus links out to People/Jobs/Mentors, which
 *  Career Guidance points at rather than rebuilding inside itself. */
export function QuickAccessCard({ resourceCount }: { resourceCount: number }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
          <Zap size={16} />
        </span>
        <div>
          <h2 className="text-base font-bold text-ink">Quick access</h2>
          <p className="text-xs text-muted">Jump to your key resources.</p>
        </div>
      </div>

      <div className="flex flex-col">
        <QuickLink
          to="/learning-resources"
          icon={<BookOpen size={16} />}
          title="Learning Resources"
          subtitle={
            resourceCount > 0
              ? `${resourceCount} saved — yours and what mentors shared`
              : 'Save articles, videos and more'
          }
        />
        <QuickLink
          to="/network/matches"
          icon={<Users size={16} />}
          title="Recommended People"
          subtitle="People who can help you"
        />
        <QuickLink
          to="/jobs"
          icon={<Briefcase size={16} />}
          title="Jobs for You"
          subtitle="Matching opportunities"
        />
        <QuickLink
          to="/network/mentors"
          icon={<GraduationCap size={16} />}
          title="Mentors for You"
          subtitle="Get guidance from experts"
        />
      </div>
    </Card>
  )
}

function QuickLink({
  to,
  icon,
  title,
  subtitle,
}: {
  to: string
  icon: React.ReactNode
  title: string
  subtitle: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-lg px-1.5 py-2.5 transition-colors hover:bg-gray-50"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-50 text-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-muted">{subtitle}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-muted" />
    </Link>
  )
}
