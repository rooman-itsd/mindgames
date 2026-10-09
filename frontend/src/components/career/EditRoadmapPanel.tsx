import { useState } from 'react'
import { ArrowDown, ArrowUp, Pause, Play, Plus, Trash2, X } from 'lucide-react'
import { Button, Card } from '../ui'
import { api } from '../../lib/api'
import { useApp } from '../../store/AppStore'
import { diffRoadmap } from '../../lib/careerDiff'
import { isUnnamedStage, newMemberStageKey } from '../../lib/careerProgress'
import { ChangeSummary } from './ChangeSummary'
import type { CareerRoadmap, CareerStage, CareerStageStatus } from '../../types'

type EditableStage = Pick<CareerStage, 'stepKey' | 'title' | 'status' | 'durationWeeks'>

/** The plan is the member's to shape: rename a stage, reorder, drop one that
 *  doesn't apply, pause one, or add their own. Regenerating from the
 *  assessment is a separate action that creates a new version instead. */
export function EditRoadmapPanel({
  roadmap,
  onClose,
  onSaved,
  hideHeading = false,
}: {
  roadmap: CareerRoadmap
  onClose: () => void
  onSaved: (r: CareerRoadmap) => void
  /** Set when the surrounding screen already carries the title and a way out,
   *  so the panel doesn't repeat "Edit your roadmap" and offer a second close. */
  hideHeading?: boolean
}) {
  const { notify } = useApp()
  const [stages, setStages] = useState<EditableStage[]>(
    roadmap.stages.map((s) => ({
      stepKey: s.stepKey,
      title: s.title,
      status: s.status,
      durationWeeks: s.durationWeeks,
    })),
  )
  const [saving, setSaving] = useState(false)
  // The stage just added, so its empty name box takes focus straight away.
  const [addedKey, setAddedKey] = useState<string | null>(null)

  // The saved plan, captured once from the roadmap prop. Everything the member
  // does below is compared against this, so the panel can say exactly what
  // "Save" is about to change.
  const original: EditableStage[] = roadmap.stages.map((s) => ({
    stepKey: s.stepKey,
    title: s.title,
    status: s.status,
    durationWeeks: s.durationWeeks,
  }))
  const changes = diffRoadmap(original, stages)

  // The first stage is the "you are here" marker and the last is the target.
  // The timeline labels them by position, so they stay at the ends: they
  // can't be moved or removed, and nothing can be moved past them.
  const last = stages.length - 1
  const pinned = (i: number) => stages.length >= 2 && (i === 0 || i === last)

  const update = (i: number, patch: Partial<EditableStage>) =>
    setStages((list) => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const move = (i: number, delta: number) =>
    setStages((list) => {
      const next = [...list]
      const target = i + delta
      if (target < 0 || target >= next.length) return list
      ;[next[i], next[target]] = [next[target], next[i]]
      return next
    })

  const remove = (i: number) => setStages((list) => list.filter((_, idx) => idx !== i))

  // Starts with no name: a stage the member adds must be named by them, or
  // it reads like the AI put a meaningless "New stage" in their plan.
  const add = () => {
    const stepKey = newMemberStageKey()
    setAddedKey(stepKey)
    setStages((list) => [
      ...list.slice(0, Math.max(list.length - 1, 0)),
      {
        stepKey,
        title: '',
        status: 'upcoming' as CareerStageStatus,
        durationWeeks: 4,
      },
      ...list.slice(Math.max(list.length - 1, 0)),
    ])
  }

  async function save() {
    if (stages.some((s) => isUnnamedStage(s.title))) {
      notify('Give every stage a name of its own before saving.', 'error')
      return
    }
    if (changes.length === 0) {
      notify('Nothing to save — your plan is unchanged.', 'info')
      return
    }
    setSaving(true)
    try {
      onSaved(await api.editCareerRoadmap(stages))
      notify('Roadmap updated.', 'success')
      onClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save your roadmap.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {!hideHeading && <h2 className="text-lg font-bold text-ink">Edit your roadmap</h2>}
          <p className="text-sm text-muted">
            Rename, reorder, pause or remove stages. To change your goal, timeline or hours, edit
            your assessment instead — that rebuilds the plan as a new version.
          </p>
        </div>
        {!hideHeading && (
          <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {stages.map((s, i) => (
          <div key={s.stepKey} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gray-100 text-xs font-bold text-muted">
              {i + 1}
            </span>
            <input
              value={s.title}
              onChange={(e) => update(i, { title: e.target.value })}
              autoFocus={s.stepKey === addedKey}
              placeholder="Name this stage (required)"
              aria-invalid={isUnnamedStage(s.title)}
              className={`min-w-[160px] flex-1 rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:border-brand ${
                isUnnamedStage(s.title) ? 'border-red-300' : 'border-line'
              }`}
            />
            <input
              type="number"
              min={1}
              value={s.durationWeeks ?? ''}
              placeholder="—"
              onChange={(e) =>
                update(i, { durationWeeks: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="w-16 rounded-lg border border-line px-2 py-1.5 text-center text-sm outline-none focus:border-brand"
              title="Weeks"
            />
            <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={pinned(i) || pinned(i - 1)}>
              <ArrowUp size={14} />
            </IconBtn>
            <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={pinned(i) || pinned(i + 1) || i === last}>
              <ArrowDown size={14} />
            </IconBtn>
            <IconBtn
              label={s.status === 'paused' ? 'Resume stage' : 'Pause stage'}
              onClick={() => update(i, { status: s.status === 'paused' ? 'upcoming' : 'paused' })}
            >
              {s.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
            </IconBtn>
            <IconBtn label="Remove stage" onClick={() => remove(i)} disabled={stages.length === 1 || pinned(i)}>
              <Trash2 size={14} />
            </IconBtn>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <ChangeSummary
          hint="Compared with the plan you have saved right now."
          rows={changes.map((c) => ({
            label: c.stage,
            before: c.before,
            after: c.after,
            tag: c.kind,
          }))}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="outline" icon={<Plus size={14} />} onClick={add}>
          Add a stage
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={changes.length === 0} onClick={save}>
            Save roadmap
          </Button>
        </div>
      </div>
    </Card>
  )
}

function IconBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}
