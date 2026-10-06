import { Calendar } from 'lucide-react'
import type { ReactNode } from 'react'

export function EventsEmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface py-16 text-center shadow-sm">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand">
        <Calendar size={28} />
      </span>
      <p className="font-semibold text-ink">{title}</p>
      {children}
    </div>
  )
}
