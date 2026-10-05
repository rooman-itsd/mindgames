import { alumniCount } from '../lib/format'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, MessageCircleQuestion, Route } from 'lucide-react'
import { api } from '../lib/api'
import { useApp } from '../store/AppStore'
import { Button, Card, CompanyLogo } from '../components/ui'
import { ContributeRoadmapModal } from '../components/companies/ContributeRoadmapModal'
import { RoadmapDetailModal } from '../components/companies/RoadmapDetailModal'
import { RoadmapPostCard } from '../components/companies/RoadmapPostCard'
import { roadmapFeed, useCompanyRoadmaps } from '../components/companies/useCompanyRoadmaps'
import type { CompanyDetail, CompanyRoadmap } from '../types'

// /companies/:id/roadmaps — every path into one company, as a feed.
//
// The company page keeps a short preview of this; the full list lives here so
// a company with twenty contributors does not bury the alumni grid above it.
export function CompanyRoadmaps() {
  const { id } = useParams<{ id: string }>()
  const { notify } = useApp()
  const { data, failed, reload } = useCompanyRoadmaps(id)
  const [company, setCompany] = useState<CompanyDetail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [viewing, setViewing] = useState<CompanyRoadmap | null>(null)
  const [contributing, setContributing] = useState(false)
  const [asking, setAsking] = useState(false)

  // The header needs the company's own name and logo, which the roadmaps
  // endpoint does not carry — it is about the people, not the company.
  useEffect(() => {
    if (!id) return
    api.getCompany(id).then(setCompany).catch(() => setNotFound(true))
  }, [id])

  async function askAlumni() {
    if (!id || !company) return
    setAsking(true)
    try {
      const res = await api.requestCompanyRoadmaps(id)
      notify(
        res.notified > 0
          ? `Asked ${alumniCount(res.notified)} at ${company.name} to share how they got in.`
          : `No one at ${company.name} is available to ask right now.`,
        res.notified > 0 ? 'success' : 'info',
      )
      await reload()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not send that request.', 'error')
    } finally {
      setAsking(false)
    }
  }

  if (notFound) return <Navigate to="/companies" replace />
  if (!company) return <p className="text-sm text-[#878a8c]">Loading…</p>

  const feed = roadmapFeed(data)

  return (
    <div className="flex flex-col gap-4">
      <Link
        to={`/companies/${company.id}`}
        className="flex items-center gap-1 self-start text-sm font-semibold text-[#878a8c] hover:text-[#ff4500]"
      >
        <ArrowLeft size={15} /> Back to {company.name}
      </Link>

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <CompanyLogo name={company.name} logoUrl={company.logoUrl} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-[#1c1c1c]">
            <Route size={20} className="text-[#ff4500]" />
            Roadmaps into {company.name}
          </h1>
          <p className="text-sm text-[#878a8c]">
            {feed.length > 0
              ? `${feed.length} path${feed.length > 1 ? 's' : ''} shared by people who work here`
              : 'No one here has shared their path yet'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data?.canContribute && (
            <Button variant="outline" onClick={() => setContributing(true)}>
              {data.mine?.contributed ? 'Edit my roadmap' : 'Share my roadmap'}
            </Button>
          )}
          {data && !data.alreadyAsked && data.eligibleToAsk > 0 && (
            <Button
              variant="primary"
              icon={<MessageCircleQuestion size={15} />}
              onClick={askAlumni}
              disabled={asking}
            >
              {asking ? 'Asking…' : `Ask ${alumniCount(data.eligibleToAsk)}`}
            </Button>
          )}
        </div>
      </Card>

      {failed ? (
        <Card className="py-12 text-center text-sm text-[#878a8c]">
          Roadmaps could not be loaded right now.
        </Card>
      ) : !data ? (
        <p className="text-sm text-[#878a8c]">Loading roadmaps…</p>
      ) : feed.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm text-[#878a8c]">
            No one here has shared their path yet.
            {data.eligibleToAsk > 0 && !data.alreadyAsked
              ? ' Ask the alumni above and they will be notified.'
              : ''}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {feed.map(({ roadmap, isMine }) => (
            <RoadmapPostCard
              key={roadmap.userId}
              roadmap={roadmap}
              companyName={company.name}
              companyLogoUrl={company.logoUrl}
              isMine={isMine}
              onOpen={() => setViewing(roadmap)}
            />
          ))}
        </div>
      )}

      {data?.alreadyAsked && (
        <p className="text-xs text-[#878a8c]">
          You have already asked the alumni here — new roadmaps will appear as they respond.
        </p>
      )}

      {viewing && (
        <RoadmapDetailModal
          roadmap={viewing}
          companyName={company.name}
          onClose={() => setViewing(null)}
        />
      )}
      {contributing && data && (
        <ContributeRoadmapModal
          companyId={company.id}
          companyName={company.name}
          existing={data.mine}
          onClose={() => setContributing(false)}
          onSaved={() => {
            setContributing(false)
            notify('Your roadmap is live on this company page.')
            void reload()
          }}
        />
      )}
    </div>
  )
}
