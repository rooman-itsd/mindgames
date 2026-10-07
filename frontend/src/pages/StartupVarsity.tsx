import { ExternalLink, FlaskConical, Rocket, Users2, Wallet } from 'lucide-react'
import { Card } from '../components/ui'
import { StartupVarsityPitch } from '../components/startupvarsity/StartupVarsityPitch'

// Rooman's incubation program — the official site this page links out to.
const STARTUPVARSITY_URL = 'https://www.startupvarsity.com'

// The in-app "Apply to Build Your Startup" form and the "Startups from the
// Network" list used to live here; the product owner replaced them with the
// pitch, which sends members to StartupVarsity's own form (Oct 2026). The
// /api/startups routes and store stay: the admin "Startup Applications" panel
// still reads the applications already submitted.
export function StartupVarsity() {
  return (
    <div className="flex flex-col gap-5">
      {/* Explainer */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-[#7c3aed] to-brand px-6 py-7 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Rocket size={26} />
              <h1 className="text-2xl font-bold">StartupVarsity</h1>
            </div>
            <a
              href={STARTUPVARSITY_URL}
              target="_blank"
              rel="noopener noreferrer"
              // bg-white, not bg-surface: it sits on the purple header, which
              // doesn't flip, so the pill must stay white in dark mode too.
              className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-sm font-bold text-[#7c3aed] shadow-sm transition-colors hover:bg-white"
            >
              Visit startupvarsity.com <ExternalLink size={15} />
            </a>
          </div>
          <p className="mt-2 max-w-xl text-violet-50">
            Turn your idea into a company. Build your product using Rooman's labs, mentor network and
            seed support — built for alumni founders.
          </p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <Resource icon={<FlaskConical size={20} />} title="Lab Space" body="Hardware & software labs at Rooman centers." />
          <Resource icon={<Users2 size={20} />} title="Mentors" body="Guidance from successful founder alumni." />
          <Resource icon={<Wallet size={20} />} title="Seed Support" body="Early funding & go-to-market help." />
        </div>
      </Card>

      <StartupVarsityPitch />
    </div>
  )
}

// Each resource card opens the official StartupVarsity site in a new tab.
function Resource({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <a
      href={STARTUPVARSITY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group rounded-xl border border-line p-4 transition-colors hover:border-[#7c3aed] hover:bg-purple-50/40"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700">{icon}</span>
      <p className="mt-2 flex items-center gap-1 font-semibold text-ink">
        {title}
        <ExternalLink size={12} className="text-muted opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
      <p className="text-xs text-muted">{body}</p>
    </a>
  )
}
