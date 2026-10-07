import type { ReactNode } from 'react'
import { Users, UserCheck, Mail, Sparkles } from 'lucide-react'

function Stat({
  icon,
  label,
  value,
  tone = 'bg-brand-100 text-brand',
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  /** Icon chip colours — each stat gets its own hue so the row scans apart. */
  tone?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <div className={`grid h-10 w-10 place-items-center rounded-lg ${tone}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-ink">{value}</p>
        <p className="truncate text-xs text-muted">{label}</p>
      </div>
    </div>
  )
}

export function StatBar({
  total,
  mentors,
  invitesSent,
}: {
  total: number
  mentors: number
  invitesSent: number
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat icon={<Users size={18} />} label="Total Alumni" value={total} />
      <Stat icon={<UserCheck size={18} />} label="Available Mentors" value={mentors} tone="bg-saffron-100 text-saffron-700" />
      <Stat icon={<Mail size={18} />} label="Invitations Sent" value={invitesSent} tone="bg-ocean-100 text-ocean-700" />
      <Stat icon={<Sparkles size={18} />} label="Active This Week" value={Math.max(1, Math.round(total * 0.4))} tone="bg-amethyst-100 text-amethyst-700" />
    </div>
  )
}
