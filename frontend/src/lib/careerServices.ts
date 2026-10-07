import {
  Briefcase, Building2, Code2, Compass, FileText, Gauge, IdCard, MessagesSquare,
  Repeat2, Rocket, Target, Laptop, Users, Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AlumniService, ServiceType } from '../types'
import { SERVICE_LABELS } from '../types'

/** Icon + accent colour per service type, so a service looks the same
 *  wherever it is rendered (matched list, full marketplace, manage panel). */
export const SERVICE_ICONS: Record<ServiceType, { icon: LucideIcon; classes: string }> = {
  career_guidance: { icon: Compass, classes: 'bg-brand-50 text-brand' },
  technical_mentoring: { icon: Code2, classes: 'bg-blue-50 text-blue-600' },
  resume_review: { icon: FileText, classes: 'bg-sky-50 text-sky-600' },
  interview_preparation: { icon: Users, classes: 'bg-indigo-50 text-indigo-600' },
  project_guidance: { icon: Laptop, classes: 'bg-violet-50 text-violet-600' },
  linkedin_review: { icon: IdCard, classes: 'bg-blue-50 text-blue-700' },
  mock_interview: { icon: MessagesSquare, classes: 'bg-teal-50 text-teal-600' },
  code_project_review: { icon: Wrench, classes: 'bg-cyan-50 text-cyan-600' },
  startup_business_guidance: { icon: Rocket, classes: 'bg-rose-50 text-rose-600' },
  domain_specific_advice: { icon: Target, classes: 'bg-emerald-50 text-emerald-600' },
  industry_guidance: { icon: Building2, classes: 'bg-amber-50 text-amber-600' },
  career_transition: { icon: Repeat2, classes: 'bg-purple-50 text-purple-600' },
  portfolio_review: { icon: Gauge, classes: 'bg-fuchsia-50 text-fuchsia-600' },
  freelance_consulting: { icon: Briefcase, classes: 'bg-lime-50 text-lime-700' },
}

/** The member-facing name: their custom title when they set one, else the
 *  standard label for the type. */
export function serviceName(s: AlumniService): string {
  return s.title?.trim() || SERVICE_LABELS[s.serviceType] || s.serviceType
}

/** "₹500/hour", "₹300/session", "Free", or "Custom" for price-on-request.
 *  Display only — there is no payment gateway (deliberately, for now). */
export function servicePrice(s: AlumniService): string {
  if (s.pricingMode === 'free') return 'Free'
  if (s.pricingMode === 'custom') return 'On request'
  return `₹${s.amount ?? 0}${s.pricingUnit ? `/${s.pricingUnit}` : ''}`
}

/**
 * The services the roadmap matched to one stage, picked by id out of a loaded
 * list (the roadmap's own stageServices, which the server has already cut to
 * live ones). An id with no match — a paused or deleted service — is skipped
 * rather than shown as a blank, and a repeated id is only returned once.
 */
export function servicesForStage(serviceIds: string[], loaded: AlumniService[]): AlumniService[] {
  const byId = new Map(loaded.map((s) => [s.id, s]))
  const out: AlumniService[] = []
  for (const id of new Set(serviceIds)) {
    const s = byId.get(id)
    if (s) out.push(s)
  }
  return out
}
