import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react'
import { Button, Card } from '../ui'
import { api, type CareerAssessmentInput } from '../../lib/api'
import { useApp } from '../../store/AppStore'
import { diffAssessment } from '../../lib/careerDiff'
import { ChangeSummary } from './ChangeSummary'
import {
  CAREER_GOALS,
  CURRENT_SITUATIONS,
  LEARNING_PREFERENCES,
  SERVICE_CATEGORIES,
  SERVICE_LABELS,
  SUPPORT_PREFERENCES,
  type CareerAssessment,
  type CareerRoadmap,
} from '../../types'

const STEP_TITLES = [
  'Where you are now',
  'What you want next',
  'Your skills today',
  'Time you can give',
  'How you like to grow',
  'Help from alumni',
  'Anything else',
]

const EMPTY: CareerAssessmentInput = {
  currentSituation: '',
  goalType: '',
  targetRole: '',
  targetRoleUnsure: false,
  extraSkillsNote: '',
  learningPrefs: [],
  supportPreference: '',
  helpTypes: [],
  freeText: '',
}

/** The 5–10 minute assessment. Answers autosave to the server after every
 *  step, so closing the tab halfway never loses progress, and submitting
 *  always regenerates the roadmap (a retake is a new version, not an edit). */
export function CareerAssessmentWizard({
  initial,
  previous = null,
  onCancel,
  onDone,
}: {
  initial: CareerAssessment | null
  /** The last *submitted* assessment, when there is one. Used only to show a
   *  before/after summary on the review step, so someone retaking the
   *  assessment can see what their answers change before the roadmap is
   *  rebuilt. `initial` may be an unfinished draft, which is why this is a
   *  separate prop rather than reusing it. */
  previous?: CareerAssessment | null
  onCancel: () => void
  onDone: (roadmap: CareerRoadmap) => void
}) {
  const { currentUser, notify } = useApp()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [a, setA] = useState<CareerAssessmentInput>(() =>
    initial
      ? {
          currentSituation: initial.currentSituation,
          goalType: initial.goalType,
          targetRole: initial.targetRole,
          targetRoleUnsure: initial.targetRoleUnsure,
          hoursPerWeek: initial.hoursPerWeek,
          timelineMonths: initial.timelineMonths,
          extraSkillsNote: initial.extraSkillsNote,
          learningPrefs: initial.learningPrefs,
          supportPreference: initial.supportPreference,
          helpTypes: initial.helpTypes,
          freeText: initial.freeText,
        }
      : EMPTY,
  )

  const set = <K extends keyof CareerAssessmentInput>(key: K, value: CareerAssessmentInput[K]) =>
    setA((prev) => ({ ...prev, [key]: value }))

  const toggle = (key: 'learningPrefs' | 'helpTypes', value: string) =>
    setA((prev) => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter((v) => v !== value) : [...prev[key], value],
    }))

  // What each step requires before Next is allowed. Steps 2, 4 and 6 (index
  // 2, 6) are optional by design — a member shouldn't be blocked by a
  // free-text box they have nothing to add to.
  const stepValid = (i: number): boolean => {
    if (i === 0) return !!a.currentSituation
    if (i === 1) return !!a.goalType && (a.targetRoleUnsure || a.targetRole.trim().length > 0)
    if (i === 3) return !!a.hoursPerWeek && !!a.timelineMonths
    if (i === 4) return a.learningPrefs.length > 0
    if (i === 5) return !!a.supportPreference && a.helpTypes.length > 0
    return true
  }

  const isReview = step === STEP_TITLES.length

  async function next() {
    if (!stepValid(step)) return
    setSaving(true)
    try {
      await api.saveCareerAssessment(a)
    } catch {
      notify('Could not save your progress — continuing anyway.', 'info')
    } finally {
      setSaving(false)
    }
    setStep((s) => s + 1)
  }

  async function submit() {
    setGenerating(true)
    try {
      const roadmap = await api.submitCareerAssessment(a)
      onDone(roadmap)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not build your roadmap.', 'error')
    } finally {
      setGenerating(false)
    }
  }

  if (generating) return <GeneratingState />

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted">
          <span>
            {isReview ? 'Review' : `Step ${step + 1} of ${STEP_TITLES.length}`}
          </span>
          <span>{isReview ? 'Ready to build' : STEP_TITLES[step]}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${((isReview ? STEP_TITLES.length : step) / STEP_TITLES.length) * 100}%` }}
          />
        </div>
      </div>

      {step === 0 && (
        <Question title="What best describes you right now?">
          <OptionGrid
            options={CURRENT_SITUATIONS.map((s) => ({ value: s, label: s }))}
            value={a.currentSituation}
            onChange={(v) => set('currentSituation', v)}
          />
        </Question>
      )}

      {step === 1 && (
        <>
          <Question title="What do you want to achieve next?">
            <OptionGrid
              options={CAREER_GOALS.map((g) => ({ value: g.value, label: g.label }))}
              value={a.goalType}
              onChange={(v) => set('goalType', v)}
            />
          </Question>
          <Question title="Which role are you aiming for?" hint="Type any role — it doesn't have to be on a list.">
            <input
              value={a.targetRole}
              disabled={a.targetRoleUnsure}
              onChange={(e) => set('targetRole', e.target.value)}
              placeholder="e.g. AI Engineer"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-gray-50 disabled:text-muted"
            />
            <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={a.targetRoleUnsure}
                onChange={(e) => {
                  set('targetRoleUnsure', e.target.checked)
                  if (e.target.checked) set('targetRole', '')
                }}
                className="h-4 w-4 rounded border-gray-300 accent-brand"
              />
              I’m not sure yet — help me explore
            </label>
          </Question>
        </>
      )}

      {step === 2 && (
        <Question
          title="Your skills and experience"
          hint="Taken from your profile — we won't ask you to type it all again."
        >
          <div className="rounded-xl border border-line bg-gray-50 p-4">
            <Fact label="Current role" value={[currentUser.designation, currentUser.company].filter(Boolean).join(' · ') || '—'} />
            <Fact label="Skills" value={currentUser.expertise?.join(', ') || '—'} />
            <Fact label="Experience" value={`${currentUser.experienceYears || 0} years · ${currentUser.domain || '—'}`} />
            <Fact
              label="Certifications"
              value={currentUser.certifications?.map((c) => c.name).join(', ') || '—'}
            />
            <a href="/profile" className="mt-1 inline-block text-xs font-semibold text-brand hover:underline">
              Edit in profile →
            </a>
          </div>
          <textarea
            value={a.extraSkillsNote}
            onChange={(e) => set('extraSkillsNote', e.target.value)}
            rows={3}
            placeholder="Anything not reflected in your profile? (optional)"
            className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </Question>
      )}

      {step === 3 && (
        <>
          <Question title="How much time can you realistically give each week?">
            <NumberField
              value={a.hoursPerWeek}
              onChange={(v) => set('hoursPerWeek', v)}
              suffix="hours/week"
              min={1}
              max={80}
              placeholder="8"
            />
          </Question>
          <Question title="By when do you want to get there?">
            <NumberField
              value={a.timelineMonths}
              onChange={(v) => set('timelineMonths', v)}
              suffix="months"
              min={1}
              max={60}
              placeholder="12"
            />
          </Question>
        </>
      )}

      {step === 4 && (
        <Question title="How do you prefer to grow?" hint="Pick as many as apply.">
          <OptionGrid
            multi
            options={LEARNING_PREFERENCES.map((p) => ({ value: p, label: p }))}
            values={a.learningPrefs}
            onToggle={(v) => toggle('learningPrefs', v)}
          />
        </Question>
      )}

      {step === 5 && (
        <>
          <Question title="What kind of alumni help are you open to?">
            <OptionGrid
              options={SUPPORT_PREFERENCES.map((s) => ({ value: s.value, label: s.label }))}
              value={a.supportPreference}
              onChange={(v) => set('supportPreference', v)}
            />
          </Question>
          <Question title="What kind of help do you want?" hint="Pick as many as apply.">
            <div className="flex flex-col gap-3">
              {SERVICE_CATEGORIES.map((cat) => (
                <div key={cat.label}>
                  <p className="mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">
                    {cat.label}
                  </p>
                  <OptionGrid
                    multi
                    options={cat.types.map((t) => ({ value: t, label: SERVICE_LABELS[t] }))}
                    values={a.helpTypes}
                    onToggle={(v) => toggle('helpTypes', v)}
                  />
                </div>
              ))}
            </div>
          </Question>
        </>
      )}

      {step === 6 && (
        <Question title="Anything else we should know?" hint="Optional.">
          <textarea
            value={a.freeText}
            onChange={(e) => set('freeText', e.target.value)}
            rows={4}
            placeholder="Tell us anything else about where you want your career to go…"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </Question>
      )}

      {isReview && previous && (
        <div className="mb-5">
          <ChangeSummary
            title="What this changes"
            hint="Compared with the assessment your current roadmap was built from."
            rows={diffAssessment(previous, a)}
            emptyText="Your answers match your last assessment — the roadmap will be rebuilt from the same inputs."
          />
        </div>
      )}

      {isReview && (
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-bold text-ink">Check your answers</h3>
          <ReviewRow label="Current situation" value={a.currentSituation} onEdit={() => setStep(0)} />
          <ReviewRow
            label="Goal"
            value={`${CAREER_GOALS.find((g) => g.value === a.goalType)?.label ?? '—'}${
              a.targetRoleUnsure ? ' · exploring roles' : a.targetRole ? ` · ${a.targetRole}` : ''
            }`}
            onEdit={() => setStep(1)}
          />
          <ReviewRow
            label="Time"
            value={`${a.hoursPerWeek ?? '—'} hours/week for ${a.timelineMonths ?? '—'} months`}
            onEdit={() => setStep(3)}
          />
          <ReviewRow label="Ways of growing" value={a.learningPrefs.join(', ') || '—'} onEdit={() => setStep(4)} />
          <ReviewRow
            label="Alumni help"
            value={`${SUPPORT_PREFERENCES.find((s) => s.value === a.supportPreference)?.label ?? '—'} · ${
              a.helpTypes.length
            } help types`}
            onEdit={() => setStep(5)}
          />
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button
          variant="ghost"
          icon={<ArrowLeft size={14} />}
          onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}
        >
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {isReview ? (
          <Button variant="ai" icon={<Sparkles size={14} />} onClick={submit}>
            Generate my roadmap
          </Button>
        ) : (
          <Button
            icon={<ArrowRight size={14} />}
            loading={saving}
            disabled={!stepValid(step)}
            onClick={next}
          >
            {step === STEP_TITLES.length - 1 ? 'Review' : 'Next'}
          </Button>
        )}
      </div>
    </Card>
  )
}

function GeneratingState() {
  return (
    <Card className="grid place-items-center gap-3 px-5 py-16 text-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      <p className="text-base font-bold text-ink">Building your roadmap…</p>
      <p className="max-w-sm text-sm text-muted">
        Reviewing your profile, finding alumni who took a similar path, and planning your stages.
      </p>
    </Card>
  )
}

function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {hint && <p className="mb-2.5 text-sm text-muted">{hint}</p>}
      <div className={hint ? '' : 'mt-2.5'}>{children}</div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <p className="mb-1.5 text-sm">
      <span className="font-semibold text-ink">{label}: </span>
      <span className="text-muted">{value}</span>
    </p>
  )
}

function OptionGrid({
  options,
  value,
  onChange,
  multi = false,
  values = [],
  onToggle,
}: {
  options: { value: string; label: string }[]
  value?: string
  onChange?: (v: string) => void
  multi?: boolean
  values?: string[]
  onToggle?: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = multi ? values.includes(o.value) : value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => (multi ? onToggle?.(o.value) : onChange?.(o.value))}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'border-brand bg-brand-50 text-brand'
                : 'border-line bg-surface text-ink hover:bg-gray-50'
            }`}
          >
            {active && <Check size={13} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A plain number box rather than fixed ranges — "8 hours/week" is a real
 *  answer in a way that "5–10 hours" is not. */
function NumberField({
  value,
  onChange,
  suffix,
  min,
  max,
  placeholder,
}: {
  value?: number
  onChange: (v: number | undefined) => void
  suffix: string
  min: number
  max: number
  placeholder: string
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          const n = Number(e.target.value)
          onChange(e.target.value === '' || Number.isNaN(n) ? undefined : n)
        }}
        className="w-24 rounded-lg border border-line px-3 py-2 text-center text-sm font-bold outline-none focus:border-brand"
      />
      <span className="text-sm font-medium text-muted">{suffix}</span>
    </div>
  )
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-line px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="text-sm text-ink">{value || '—'}</p>
      </div>
      <button onClick={onEdit} className="shrink-0 text-xs font-semibold text-brand hover:underline">
        Edit
      </button>
    </div>
  )
}
