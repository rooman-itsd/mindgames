import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, BookOpen, Building2, Search, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { ForYouSection } from '../components/companies/ForYouSection'
import { matchesCompanyQuery } from '../lib/search'
import { AvatarStack, Button, Card, CompanyLogo, Pill } from '../components/ui'
import type { Company } from '../types'

export function Companies() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [industry, setIndustry] = useState('All')
  const [savedOnly, setSavedOnly] = useState(false)

  useEffect(() => {
    api.getCompanies().then(setCompanies).finally(() => setLoading(false))
  }, [])

  const industries = useMemo(
    () => ['All', ...Array.from(new Set(companies.map((c) => c.industry))).sort()],
    [companies],
  )

  const filtered = useMemo(
    () =>
      companies
        .filter((c) => matchesCompanyQuery(c, search))
        .filter((c) => industry === 'All' || c.industry === industry)
        .filter((c) => !savedOnly || c.savedByMe),
    [companies, search, industry, savedOnly],
  )

  function toggleSave(id: string, saved: boolean) {
    setCompanies((list) => list.map((c) => (c.id === id ? { ...c, savedByMe: !saved } : c)))
    const call = saved ? api.unsaveCompany(id) : api.saveCompany(id)
    call.catch(() => setCompanies((list) => list.map((c) => (c.id === id ? { ...c, savedByMe: saved } : c))))
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Building2 size={24} className="text-brand" /> Companies
        </h1>
        <p className="mt-1 text-sm text-muted">
          Find your dream company, see the Rooman alumni already there, and reach out.
        </p>
      </div>

      {/* Search hero */}
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your dream company…"
          className="w-full rounded-full border border-line bg-surface py-3.5 pr-4 pl-11 text-sm text-ink shadow-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ai"
          icon={<Sparkles size={15} />}
          onClick={() => window.open('https://hiresolution.ai/career-profiler', '_blank', 'noopener,noreferrer')}
        >
          Take a test on Hire AI
        </Button>
        <Button
          variant="outline"
          icon={<BookOpen size={15} />}
          onClick={() => window.open('https://lms.rooman.com/', '_blank', 'noopener,noreferrer')}
        >
          Prepare using our Rooman LMS
        </Button>
      </div>

      {/* Ranked against the viewer's own profile. Sits above the directory
          rather than replacing it — the plain search/filter grid below is
          untouched, so nothing anyone relies on today has moved. */}
      <ForYouSection />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {industries.map((ind) => (
          <Pill key={ind} active={industry === ind} onClick={() => setIndustry(ind)}>{ind}</Pill>
        ))}
        <Pill active={savedOnly} onClick={() => setSavedOnly((v) => !v)}>
          <span className="flex items-center gap-1"><Bookmark size={13} /> Saved</span>
        </Pill>
      </div>

      {/* Grid */}
      {loading ? (
        <p className="text-sm text-muted">Loading companies…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CompanyCard key={c.id} company={c} onToggleSave={() => toggleSave(c.id, c.savedByMe)} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-xl border border-line bg-surface py-12 text-center text-sm text-muted shadow-sm">
              No companies match your search.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CompanyCard({ company, onToggleSave }: { company: Company; onToggleSave: () => void }) {
  return (
    <Card className="relative p-4">
      <button
        onClick={(e) => {
          e.preventDefault()
          onToggleSave()
        }}
        title={company.savedByMe ? 'Remove from saved' : 'Save company'}
        className="absolute top-3 right-3 rounded-full p-1.5 text-muted transition-colors hover:bg-gray-100"
      >
        <Bookmark size={16} className={company.savedByMe ? 'fill-brand text-brand' : ''} />
      </button>
      <Link to={`/companies/${company.id}`} className="flex flex-col gap-3">
        <div className="flex items-center gap-3 pr-6">
          <CompanyLogo name={company.name} logoUrl={company.logoUrl} />
          <div className="min-w-0">
            <p className="truncate font-bold text-ink">{company.name}</p>
            <span className="rounded-full bg-page px-2 py-0.5 text-xs font-medium text-muted">{company.industry}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {company.previewAlumni.length > 0 ? (
            <>
              <AvatarStack people={company.previewAlumni} total={company.alumniCount} size={26} />
              <span className="text-xs font-medium text-ink">
                {company.alumniCount} Rooman alumni here
              </span>
            </>
          ) : (
            <span className="text-xs text-muted">No Rooman alumni here yet</span>
          )}
        </div>
      </Link>
    </Card>
  )
}
