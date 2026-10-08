import { waitingLabel } from '../../lib/learningHub'
import type { StageOption } from '../../types'

/**
 * The share form's roadmap stages — optional, up to `max`, and only the
 * member's own roadmap stages (the server refuses any other). A plain
 * checkbox list: a roadmap has a handful of stages, so no search is needed.
 */
export function StagePicker({
  stages,
  value,
  onChange,
  max,
}: {
  /** The member's own roadmap stages. */
  stages: StageOption[]
  value: StageOption[]
  onChange: (stages: StageOption[]) => void
  /** Most stages one share can be filed under (the server's limit too). */
  max: number
}) {
  if (!stages.length) {
    return <p className="text-xs text-muted">Build a roadmap in Career Guidance to file resources under its stages.</p>
  }
  const picked = new Set(value.map((s) => s.topicKey))
  const full = value.length >= max
  const toggle = (s: StageOption) =>
    onChange(picked.has(s.topicKey) ? value.filter((v) => v.topicKey !== s.topicKey) : full ? value : [...value, s])

  return (
    <fieldset className="grid gap-1">
      <legend className="sr-only">Your roadmap stages</legend>
      {stages.map((s) => {
        const on = picked.has(s.topicKey)
        const blocked = !on && full
        return (
          <label
            key={s.topicKey}
            className={`flex items-start gap-2 rounded-lg px-1 py-1.5 text-sm ${blocked ? 'opacity-50' : 'cursor-pointer hover:bg-page'}`}
          >
            <input
              type="checkbox"
              checked={on}
              disabled={blocked}
              onChange={() => toggle(s)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
            />
            <span className="min-w-0">
              <span className="block text-ink">{s.title}</span>
              {s.membersWaiting > 0 && <span className="block text-[11px] text-muted">{waitingLabel(s.membersWaiting)}</span>}
            </span>
          </label>
        )
      })}
      {full && <p className="text-[11px] text-muted">That's the most for one share ({max}).</p>}
    </fieldset>
  )
}
