import { ChevronRight, Star } from 'lucide-react'
import { Button, Card } from '../ui'
import { SERVICE_ICONS, serviceName, servicePrice } from '../../lib/careerServices'
import type { AlumniService } from '../../types'

/** "Services matched to your roadmap" — the deterministic shortlist (see
 *  GET /api/career/services/matched), not the whole marketplace. The full
 *  list is one click away rather than dumped on the member up front. */
export function MatchedServices({
  services,
  showingAll,
  onToggleAll,
  onBook,
}: {
  services: AlumniService[]
  showingAll: boolean
  onToggleAll: () => void
  onBook: (service: AlumniService) => void
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
            <Star size={20} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink">
              {showingAll ? 'All alumni services' : 'Services matched to your roadmap'}
            </h2>
            <p className="text-sm text-muted">
              {showingAll
                ? 'Everything currently offered by Rooman mentors.'
                : 'Personalized help from alumni, based on your goal and skill gaps.'}
            </p>
          </div>
        </div>
        <button
          onClick={onToggleAll}
          className="flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
        >
          {showingAll ? 'Show matched only' : 'View all services'} <ChevronRight size={14} />
        </button>
      </div>

      {services.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-muted">
          No alumni services are listed yet. Approved mentors can offer them from this page.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {services.map((s) => (
            <ServiceCard key={s.id} service={s} onBook={onBook} />
          ))}
        </div>
      )}
    </Card>
  )
}

function ServiceCard({ service, onBook }: { service: AlumniService; onBook: (s: AlumniService) => void }) {
  const { icon: Icon, classes } = SERVICE_ICONS[service.serviceType] ?? SERVICE_ICONS.career_guidance
  const isFree = service.pricingMode === 'free'

  return (
    <div className="flex flex-col rounded-xl border border-line p-3.5">
      <span className={`mb-2.5 grid h-9 w-9 place-items-center rounded-lg ${classes}`}>
        <Icon size={18} />
      </span>
      <p className="text-[13px] leading-tight font-semibold text-ink">{serviceName(service)}</p>
      {service.providerName && (
        <p className="mt-0.5 truncate text-[11px] text-muted">by {service.providerName}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-ink">{servicePrice(service)}</span>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
            isFree ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-muted'
          }`}
        >
          {isFree ? 'Free' : 'Paid'}
        </span>
      </div>

      <Button variant="outline" className="mt-3 w-full !px-2 !py-1.5 !text-xs" onClick={() => onBook(service)}>
        Book
      </Button>
    </div>
  )
}
