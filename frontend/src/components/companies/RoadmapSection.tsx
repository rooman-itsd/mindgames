import { alumniCount } from '../../lib/format'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Check, Handshake, MessageCircleQuestion, Route, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { companyGap, gapsCoveredByTopics } from '../../lib/companyMatch'
import { useApp } from '../../store/AppStore'
import { Avatar, Button, Card } from '../ui'
import { ContributeRoadmapModal } from './ContributeRoadmapModal'
import { RoadmapDetailModal } from './RoadmapDetailModal'
import { RoadmapPostCard } from './RoadmapPostCard'
import { roadmapFeed, useCompanyRoadmaps } from './useCompanyRoadmaps'
import type { CompanyRoadmap } from '../../types'

// "How alumni got into <Company>" plus "What you're missing", the two sections
// added to a company page.
//
// This shows a PREVIEW — the newest few paths — with the full list on
// /companies/:id/roadmaps. A company with twenty contributors would otherwise
// bury the alumni grid above it.
const PREVIEW_COUNT = 3

const LMS_URL = 'https://lms.rooman.com/'

export function RoadmapSection({
  companyId,
  companyName,
  companyLogoUrl,
}: {
  companyId: string
  companyName: string
  companyLogoUrl?: string
}) {
  const { currentUser, notify } = useApp()
  const { data, failed, reload } = useCompanyRoadmaps(companyId)
  const [viewing, setViewing] = useState<CompanyRoadmap | null>(null)
  const [contributing, setContributing] = useState(false)
  const [asking, setAsking] = useState(false)

  // The viewer's own roadmap comes back separately from the list and has to be
  // folded back in — otherwise sharing one appears to do nothing.
  const feed = useMemo(() => roadmapFeed(data), [data])

  const gap = useMemo(
    () => (data ? companyGap(currentUser, data.signals) : null),
    [data, currentUser],
  )

  // Mentors here whose topics cover something the member is missing. Matched
  // against the roadmap list we already have rather than a second request.
  const mentorsForGaps = useMemo(() => {
    if (!data || !gap) return []
    return data.roadmaps
      .filter((r) => r.isMentor && r.mentorTopics.length)
      .map((r) => ({ person: r, covers: gapsCoveredByTopics(gap, r.mentorTopics) }))
      .filter((m) => m.covers.length > 0)
      .slice(0, 3)
  }, [data, gap])

  const referrers = useMemo(
    () => (data ? data.roadmaps.filter((r) => r.openToReferrals).slice(0, 4) : []),
    [data],
  )

  async function askAlumni() {
    setAsking(true)
    try {
      const res = await api.requestCompanyRoadmaps(companyId)
      notify(
        res.notified > 0
          ? `Asked ${alumniCount(res.notified)} at ${companyName} to share how they got in.`
          : `No one at ${companyName} is available to ask right now.`,
        res.notified > 0 ? 'success' : 'info',
      )
      await reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not send that request.', 'error')
    } finally {
      setAsking(false)
    }
  }

  // A company page is useful without this section; a broken box on it is not.
  if (failed) return null

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Route size={18} className="text-brand" />
            How alumni got into {companyName}
          </h2>
          <div className="flex flex-wrap gap-2">
            {data?.canContribute && (
              <Button
                variant="outline"
                className="!px-3 !py-1.5 text-xs"
                onClick={() => setContributing(true)}
              >
                {data.mine?.contributed ? 'Edit my roadmap' : 'Share my roadmap'}
              </Button>
            )}
            {data && !data.alreadyAsked && data.eligibleToAsk > 0 && (
              <Button
                variant="primary"
                className="!px-3 !py-1.5 text-xs"
                icon={<MessageCircleQuestion size={13} />}
                onClick={askAlumni}
                disabled={asking}
              >
                {asking ? 'Asking…' : `Ask ${alumniCount(data.eligibleToAsk)}`}
              </Button>
            )}
          </div>
        </div>

        {!data ? (
          <p className="text-sm text-muted">Loading roadmaps…</p>
        ) : feed.length === 0 ? (
          <Card className="py-10 text-center">
            <p className="text-sm text-muted">
              No one here has shared their path yet.
              {data.eligibleToAsk > 0 && !data.alreadyAsked
                ? ' Ask the alumni above and they will be notified.'
                : ''}
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {feed.slice(0, PREVIEW_COUNT).map(({ roadmap, isMine }) => (
              <RoadmapPostCard
                key={roadmap.userId}
                roadmap={roadmap}
                companyName={companyName}
                companyLogoUrl={companyLogoUrl}
                isMine={isMine}
                onOpen={() => setViewing(roadmap)}
              />
            ))}
            <Link
              to={`/companies/${companyId}/roadmaps`}
              className="self-start text-sm font-semibold text-brand hover:underline"
            >
              {feed.length > PREVIEW_COUNT
                ? `Click here to see all ${feed.length} roadmaps →`
                : 'Click here to open the roadmaps page →'}
            </Link>
          </div>
        )}

        {data?.alreadyAsked && (
          <p className="text-xs text-muted">
            You have already asked the alumni here — they will appear above as they respond.
          </p>
        )}
      </section>

      {/* What you're missing */}
      {gap && (gap.have.length > 0 || gap.missing.length > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-ink">What you are missing for {companyName}</h2>
          <Card className="flex flex-col gap-4 p-4">
            {gap.have.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
                  You already have
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {gap.have.map((s) => (
                    <span
                      key={s.skill}
                      className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                    >
                      <Check size={11} /> {s.skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {gap.missing.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
                  Common here, missing from your profile
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {gap.missing.map((s) => (
                    <li key={s.skill} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-ink">{s.skill}</span>
                      <span className="text-[11px] text-muted">
                        {alumniCount(s.holders)} here {s.holders === 1 ? 'has' : 'have'} it
                      </span>
                      <a
                        href={LMS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                      >
                        <BookOpen size={11} /> Learn on Rooman LMS
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {gap.missingCertifications.length > 0 && (
              <p className="text-xs text-muted">
                Certifications held here that you do not list:{' '}
                <span className="font-medium text-ink">
                  {gap.missingCertifications.map((c) => c.name).join(', ')}
                </span>
              </p>
            )}

            {mentorsForGaps.length > 0 && (
              <div className="border-t border-line pt-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
                  <Users size={12} /> Mentors here who cover your gaps
                </h3>
                <ul className="flex flex-col gap-2">
                  {mentorsForGaps.map(({ person, covers }) => (
                    <li key={person.userId} className="flex items-center gap-2">
                      <Avatar name={person.name} src={person.photo} size={28} />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/profile/${person.userId}`}
                          className="text-sm font-semibold text-ink hover:underline"
                        >
                          {person.name}
                        </Link>
                        <p className="truncate text-[11px] text-muted">
                          Mentors {covers.join(', ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {referrers.length > 0 && (
              <div className="border-t border-line pt-3">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
                  <Handshake size={12} /> Open to referring you
                </h3>
                <div className="flex flex-wrap gap-2">
                  {referrers.map((r) => (
                    <Link
                      key={r.userId}
                      to={`/profile/${r.userId}`}
                      className="flex items-center gap-1.5 rounded-full border border-line py-1 pr-3 pl-1 transition-colors hover:border-brand"
                    >
                      <Avatar name={r.name} src={r.photo} size={22} />
                      <span className="text-xs font-medium text-ink">{r.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </section>
      )}

      {viewing && (
        <RoadmapDetailModal
          roadmap={viewing}
          companyName={companyName}
          onClose={() => setViewing(null)}
        />
      )}
      {contributing && data && (
        <ContributeRoadmapModal
          companyId={companyId}
          companyName={companyName}
          existing={data.mine}
          onClose={() => setContributing(false)}
          onSaved={() => {
            setContributing(false)
            notify('Your roadmap is live on this company page.')
            void reload()
          }}
        />
      )}
    </>
  )
}
