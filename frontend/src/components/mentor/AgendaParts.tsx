import type { ReactNode } from 'react'
import { tileParts, type DotKind } from '../../lib/agenda'
import { DOT_CLASS } from './agendaDots'

/**
 * Small shared pieces of the Mentorship agenda layout: the status dot, the
 * date tile and the timeline rail. Dot colours live in agendaDots.ts.
 */

export function Dot({ kind, className = '' }: { kind: DotKind; className?: string }) {
  return <span className={`inline-block size-2 shrink-0 rounded-full ${DOT_CLASS[kind]} ${className}`} />
}

/**
 * "OCT / 14" — the day a row belongs to. `label` is the stored date text, used
 * when there's no day key (old labels without a year). `dim` for the past.
 */
export function DateTile({ dayKey, label, dim = false }: { dayKey: string | null; label?: string; dim?: boolean }) {
  const parts = tileParts(dayKey, label)
  return (
    <div
      title={parts ? undefined : label}
      className={`w-12 shrink-0 rounded-xl border border-line py-1.5 text-center ${dim ? 'bg-gray-50' : 'bg-surface'}`}
    >
      <div className={`text-[10px] font-bold uppercase tracking-wide ${dim ? 'text-muted' : 'text-saffron-700'}`}>
        {parts?.month ?? '—'}
      </div>
      <div className={`mt-0.5 text-lg leading-none font-bold ${dim ? 'text-muted' : 'text-ink'}`}>
        {parts?.day ?? '?'}
      </div>
    </div>
  )
}

/** The vertical rail a timeline's items hang off. */
export function Timeline({ children }: { children: ReactNode }) {
  return <div className="relative ml-[17px] border-l-2 border-line pl-6">{children}</div>
}

/** One stop on the rail: the dot sits on the line, the card to its right. */
export function TimelineItem({ kind, children }: { kind: DotKind; children: ReactNode }) {
  return (
    <div className="relative mb-3 last:mb-0">
      <span
        aria-hidden
        className={`absolute top-6 -left-[31px] size-3 rounded-full border-2 border-surface ring-1 ring-line ${DOT_CLASS[kind]}`}
      />
      {children}
    </div>
  )
}
