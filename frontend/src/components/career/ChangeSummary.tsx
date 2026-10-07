import { ArrowRight, CheckCircle2 } from 'lucide-react'

export interface ChangeRow {
  label: string
  before: string
  after: string
  /** Optional short badge, e.g. the kind of roadmap change. */
  tag?: string
}

/** Renders "what you are about to change" as old → new pairs.
 *
 *  Both career edit flows rewrite something the member already has, so the
 *  screen shows the previous value beside the new one rather than only the
 *  new one — otherwise "Save" asks them to confirm a change they can no
 *  longer see the other half of. */
export function ChangeSummary({
  title = 'What you’re changing',
  hint,
  rows,
  emptyText = 'Nothing changed yet — your plan stays exactly as it is.',
}: {
  title?: string
  hint?: string
  rows: ChangeRow[]
  emptyText?: string
}) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="text-sm font-bold text-ink">{title}</p>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            rows.length > 0 ? 'bg-brand-50 text-brand' : 'bg-gray-100 text-muted'
          }`}
        >
          {rows.length} {rows.length === 1 ? 'change' : 'changes'}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted">
          <CheckCircle2 size={16} className="shrink-0 text-muted" />
          {emptyText}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r, i) => (
            <li key={`${r.label}-${i}`} className="px-4 py-3">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold tracking-wide text-ink uppercase">{r.label}</p>
                {r.tag && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-muted uppercase">
                    {r.tag}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-start gap-2 text-sm">
                <span className="rounded-lg bg-gray-50 px-2.5 py-1 text-muted line-through decoration-gray-300">
                  {r.before}
                </span>
                <ArrowRight size={14} className="mt-1.5 shrink-0 text-muted" />
                <span className="rounded-lg bg-brand-50 px-2.5 py-1 font-semibold text-brand">
                  {r.after}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
