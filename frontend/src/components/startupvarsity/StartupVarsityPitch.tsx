import { ExternalLink } from 'lucide-react'
import { Card } from '../ui'
import { AlumniStories } from './AlumniStories'

/**
 * "Your idea. Your startup. Your team." — the StartupVarsity pitch on
 * /startupvarsity. Static copy plus two links out to the program's own site:
 * there is nothing to submit here, because the interest form lives on
 * startupvarsity.com and our app can't fill another site's form.
 *
 * Every claim below is taken from startupvarsity.com (October 2026). If their
 * figures change, update STATS here — they are not fetched.
 */
const SV_HOME = 'https://www.startupvarsity.com/'
/**
 * Their "Reach Out To Us" form: name, email, phone, subject, message.
 * Trailing slash on purpose: /contact 301-redirects to /contact/, so this skips
 * a hop. Their app doesn't scroll to #reach-out after rendering (checked
 * Oct 2026), so the form sits below the fold; the note under the buttons tells
 * members where to find it. The real fix is a hash-scroll on their site.
 */
const SV_REACH_OUT = 'https://www.startupvarsity.com/contact/#reach-out'

const STATS = [
  { label: 'Companies built', value: '100+' },
  { label: 'Jobs created', value: '2,500+' },
  { label: 'Combined turnover', value: '₹705 Cr+' },
  { label: 'Total valuation', value: '₹2,860 Cr+' },
]

const WHERE_YOU_START = [
  { q: 'Have an idea?', a: 'We help you turn it into a real company.' },
  { q: 'Have a problem, but no team?', a: 'We bring the right people: a dedicated team and three mentors.' },
  { q: 'Worried about the risk?', a: 'We absorb the early-stage risk.' },
  { q: 'Want equity?', a: 'You earn it through execution.' },
]

// A real sequence (their 90-day programme), so the order is the information.
const JOURNEY = [
  { when: 'Day 1–7', what: 'Company incorporated', detail: 'Bank account opened, capital in, team forming.' },
  { when: 'Day 8–30', what: 'Team building & product sprint' },
  { when: 'Day 31–60', what: 'Market validation' },
  { when: 'Day 61–90', what: 'First contract' },
]

/** Opens the program site in a new tab; noopener so it can't reach back into our tab. */
function OutLink({ href, className, children }: { href: string; className: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <ExternalLink size={15} aria-hidden />
      <span className="sr-only">(opens startupvarsity.com in a new tab)</span>
    </a>
  )
}

export function StartupVarsityPitch() {
  return (
    <Card className="overflow-hidden">
      <section
        aria-labelledby="sv-pitch-heading"
        className="grid gap-6 bg-gradient-to-br from-surface via-surface to-marigold-50 p-4 sm:p-6"
      >
        <div>
          <p className="text-xs font-bold tracking-wider text-brand uppercase">StartupVarsity · Where startups begin</p>
          <h2
            id="sv-pitch-heading"
            className="mt-1.5 font-display text-3xl leading-tight font-extrabold tracking-tight text-balance text-ink sm:text-4xl"
          >
            <span className="whitespace-nowrap">Your idea.</span> <span className="whitespace-nowrap">Your startup.</span>{' '}
            <span className="whitespace-nowrap">Your team.</span>
            <span className="mt-1.5 block text-xl text-brand sm:text-2xl">We help you build it.</span>
          </h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink">
            Got a startup idea, or a problem statement and no team? StartupVarsity is a startup sandbox: you build a
            real company with mentors, teammates and hands-on support, while we absorb the early-stage risk. Find out
            if it's your thing, then go ahead with your team.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="StartupVarsity so far">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-xl bg-brand-50 px-3 py-2.5 sm:px-3.5 sm:py-3">
              <dt className="text-xs text-muted">{s.label}</dt>
              <dd className="font-display text-lg font-extrabold whitespace-nowrap text-brand tabular-nums sm:text-2xl">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="mb-2.5 text-[15px] font-bold text-ink">No matter where you start</h3>
            <ul className="grid gap-2">
              {WHERE_YOU_START.map((w) => (
                <li key={w.q} className="border-l-[3px] border-marigold pl-3.5">
                  <p className="text-sm font-bold text-ink">{w.q}</p>
                  <p className="text-[13px] text-muted">{w.a}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2.5 text-[15px] font-bold text-ink">Idea to revenue in 90 days</h3>
            <ol className="grid">
              {JOURNEY.map((j, i) => (
                <li key={j.when} className="relative pb-3 pl-6 last:pb-0">
                  <span aria-hidden className="absolute top-1.5 left-1 h-2.5 w-2.5 rounded-full bg-brand" />
                  {i < JOURNEY.length - 1 && <span aria-hidden className="absolute top-5 bottom-0 left-[8.5px] w-px bg-line" />}
                  <p className="text-[11px] font-bold tracking-wider text-brand uppercase">{j.when}</p>
                  <p className="text-sm font-bold text-ink">{j.what}</p>
                  {j.detail && <p className="text-[13px] text-muted">{j.detail}</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <p className="rounded-xl bg-panel px-3.5 py-3 text-sm text-ink">
          <b>Your safety net.</b> Even if it doesn't work out, you walk away with real startup experience, and you can
          join another startup or transfer your IP.
        </p>

        <AlumniStories />

        <p className="font-display text-xl leading-tight font-extrabold text-ink">
          Don't start blindly. <span className="text-brand">Start with us.</span>
        </p>

        <div className="flex flex-wrap items-center gap-2.5">
          <OutLink
            href={SV_REACH_OUT}
            className="btn-cta inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
          >
            I'm interested · fill the form
          </OutLink>
          <OutLink
            href={SV_HOME}
            className="btn-press inline-flex items-center gap-2 rounded-full border border-brand bg-surface px-5 py-2.5 text-sm font-semibold text-brand hover:bg-brand-50"
          >
            Explore StartupVarsity
          </OutLink>
        </div>
      </section>
    </Card>
  )
}
