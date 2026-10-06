import { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { api } from '../../lib/api'
import { Button } from '../ui'
import type { CompanyRoadmap, RoadmapStage } from '../../types'

// The form an alumnus fills in when they share how they got into a company.
//
// It asks ONLY for what their profile cannot already say. Their job history,
// course, batch and certifications are pulled from the profile they already
// maintain, so re-typing them here would create a second copy that goes stale
// the moment they update the first. What is asked for instead is the part that
// exists nowhere else: the steps that mattered, and what they would tell
// somebody trying to follow them.
//
// Limits mirror the server's zod schema exactly (companies.routes.ts) — a form
// that lets you type something the API will reject is a bug, not a safety net.
const MAX_STAGES = 8
const HEADLINE_MAX = 160
const ADVICE_MAX = 2000
const STAGE_TITLE_MAX = 120
const STAGE_DETAIL_MAX = 600

const inputClass =
  'w-full rounded-lg border border-line p-2.5 text-sm text-ink placeholder-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20'

export function ContributeRoadmapModal({
  companyId,
  companyName,
  existing,
  onClose,
  onSaved,
}: {
  companyId: string
  companyName: string
  /** The viewer's current contribution, so this edits rather than duplicates. */
  existing: CompanyRoadmap | null
  onClose: () => void
  onSaved: () => void
}) {
  const [role, setRole] = useState(existing?.roleGoal ?? '')
  const [headline, setHeadline] = useState(existing?.headline ?? '')
  const [advice, setAdvice] = useState(existing?.advice ?? '')
  const [stages, setStages] = useState<RoadmapStage[]>(existing?.stages ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateStage(index: number, patch: Partial<RoadmapStage>) {
    setStages((list) => list.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  async function save() {
    // The server rejects a stage with a blank title, so drop empty rows the
    // member added but never filled in rather than failing the whole save.
    const cleaned = stages
      .map((s) => ({ title: s.title.trim(), detail: s.detail.trim() }))
      .filter((s) => s.title)
    setSaving(true)
    setError('')
    try {
      await api.saveCompanyRoadmap(companyId, {
        role: role.trim(),
        headline: headline.trim(),
        advice: advice.trim(),
        stages: cleaned,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your roadmap.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-lg">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">
            How you got into {companyName}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <p className="mb-5 text-sm text-muted">
          Your job history and certifications are already taken from your profile — this is just
          the advice that goes with them.
        </p>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink">The role this path led to</span>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              maxLength={120}
              placeholder="e.g. Senior Data Engineer"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink">Your route in, in one line</span>
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={HEADLINE_MAX}
              placeholder="e.g. Two years at a services firm, then applied through a referral"
              className={inputClass}
            />
            <span className="self-end text-[11px] text-muted">
              {headline.length}/{HEADLINE_MAX}
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-ink">
              Steps that actually mattered
            </span>
            {stages.map((stage, i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-line p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand">
                    {i + 1}
                  </span>
                  <input
                    value={stage.title}
                    onChange={(e) => updateStage(i, { title: e.target.value })}
                    maxLength={STAGE_TITLE_MAX}
                    placeholder="e.g. Got AWS certified"
                    className={`${inputClass} !p-1.5`}
                  />
                  <button
                    onClick={() => setStages((list) => list.filter((_, x) => x !== i))}
                    title="Remove this step"
                    className="shrink-0 text-muted hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <textarea
                  value={stage.detail}
                  onChange={(e) => updateStage(i, { detail: e.target.value })}
                  maxLength={STAGE_DETAIL_MAX}
                  rows={2}
                  placeholder="What it involved, and why it made the difference (optional)"
                  className={`${inputClass} !p-2`}
                />
              </div>
            ))}
            {stages.length < MAX_STAGES && (
              <button
                onClick={() => setStages((list) => [...list, { title: '', detail: '' }])}
                className="flex items-center gap-1 self-start text-xs font-semibold text-brand hover:underline"
              >
                <Plus size={13} /> Add a step
              </button>
            )}
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink">
              Anything you would tell someone trying to get in
            </span>
            <textarea
              value={advice}
              onChange={(e) => setAdvice(e.target.value)}
              maxLength={ADVICE_MAX}
              rows={4}
              placeholder="What the interview was really like, what you wish you had known…"
              className={inputClass}
            />
            <span className="self-end text-[11px] text-muted">
              {advice.length}/{ADVICE_MAX}
            </span>
          </label>

          {error && <p className="text-xs font-medium text-red-500">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : existing?.contributed ? 'Update my roadmap' : 'Share my roadmap'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
