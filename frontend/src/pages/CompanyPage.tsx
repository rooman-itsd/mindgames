import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Bookmark, Users } from 'lucide-react'
import { api } from '../lib/api'
import { Button, Card, CompanyLogo } from '../components/ui'
import { AlumnusRow } from '../components/companies/AlumnusRow'
import { RoadmapSection } from '../components/companies/RoadmapSection'
import { ReachOutModal } from '../components/referral/ReachOutModal'
import { ConnectNoteModal } from '../components/referral/ConnectNoteModal'
import type { CompanyAlumnus, CompanyDetail } from '../types'

const ALUMNI_PREVIEW = 5

export function CompanyPage() {
  const { id } = useParams<{ id: string }>()
  const [company, setCompany] = useState<CompanyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [reachOutFor, setReachOutFor] = useState<CompanyAlumnus | null>(null)
  const [connectFor, setConnectFor] = useState<CompanyAlumnus | null>(null)
  const [showAllAlumni, setShowAllAlumni] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .getCompany(id)
      .then(setCompany)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  function toggleSave() {
    if (!company) return
    const saved = company.savedByMe
    setCompany({ ...company, savedByMe: !saved })
    const call = saved ? api.unsaveCompany(company.id) : api.saveCompany(company.id)
    call.catch(() => setCompany((c) => (c ? { ...c, savedByMe: saved } : c)))
  }

  // Five is enough to see who is there without the list taking over the page —
  // and merging the duplicate company entries made every one of these longer.
  const shownAlumni =
    company && !showAllAlumni ? company.alumni.slice(0, ALUMNI_PREVIEW) : (company?.alumni ?? [])

  if (notFound) return <Navigate to="/companies" replace />
  if (loading || !company) {
    return <p className="text-sm text-muted">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <CompanyLogo name={company.name} logoUrl={company.logoUrl} size={64} />
            <div>
              <h1 className="text-xl font-bold text-ink">{company.name}</h1>
              <p className="flex items-center gap-1 text-sm text-muted">
                <Users size={14} /> {company.industry} · {company.alumniCount} Rooman alumni here
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={company.savedByMe ? 'subtle' : 'outline'}
              icon={<Bookmark size={15} className={company.savedByMe ? 'fill-brand text-brand' : ''} />}
              onClick={toggleSave}
            >
              {company.savedByMe ? 'Saved' : 'Save'}
            </Button>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-ink">
          Rooman alumni at {company.name}
          {company.alumni.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-muted">
              {company.alumni.length}
            </span>
          )}
        </h2>
        {company.alumni.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface py-12 text-center text-sm text-muted shadow-sm">
            No Rooman alumni here yet.
          </div>
        ) : (
          <div className="flex flex-col">
            {shownAlumni.map((a, i) => (
              <AlumnusRow
                key={a.id}
                alum={a}
                onConnect={() => setConnectFor(a)}
                onReachOut={() => setReachOutFor(a)}
                last={i === shownAlumni.length - 1}
              />
            ))}
            {company.alumni.length > ALUMNI_PREVIEW && (
              <button
                onClick={() => setShowAllAlumni((v) => !v)}
                className="self-start pt-3 text-sm font-semibold text-brand hover:underline"
              >
                {showAllAlumni ? 'Show fewer' : `Show all ${company.alumni.length} alumni →`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* How alumni got in, and what the viewer is missing. Placed below the
          existing alumni grid so the page reads: who is here, then how they
          got here, then what it would take for you. */}
      <RoadmapSection
        companyId={company.id}
        companyName={company.name}
        companyLogoUrl={company.logoUrl}
      />

      {reachOutFor && (
        <ReachOutModal
          user={{ id: reachOutFor.id, name: reachOutFor.name, company: company.name }}
          extended
          onClose={() => setReachOutFor(null)}
        />
      )}
      {connectFor && (
        <ConnectNoteModal
          user={{ id: connectFor.id, name: connectFor.name }}
          onClose={() => setConnectFor(null)}
        />
      )}
    </div>
  )
}
