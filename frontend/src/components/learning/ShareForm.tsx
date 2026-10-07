import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { api } from '../../lib/api'
import { isHttpUrl } from '../../lib/links'
import { AUDIENCE_LABEL, DIFFICULTY_FILTERS, KIND_LABEL, TYPE_FILTERS, waitingLabel } from '../../lib/learningHub'
import { useApp } from '../../store/AppStore'
import { Button, Card } from '../ui'
import type { ContributeStage, LearningShare, ProjectDifficulty, ShareAudience, ShareKind } from '../../types'

/** A brief's "About" must be this long to stand without a link — the same
 *  rule the server and the database enforce. */
const ABOUT_MIN = 80
/** "Why it helped" — the same minimum the server enforces (WHY_HELPED_MIN). */
const WHY_MIN = 30
const MAX_TAGS = 8

/**
 * An alum sharing what helped them with everyone on a stage.
 *
 * "Why it helped you" is required, because that sentence is what makes this a
 * recommendation from a person rather than another bookmark. Skills and a
 * difficulty are required too: they are what the All Resources filters match
 * on, so an untagged share would be invisible there.
 *
 * A project brief needs something to go on — a link to it, or an "About the
 * project" long enough to be a real problem statement.
 */
export function ShareForm({
  stages,
  defaultTopicKey,
  onClose,
  onShared,
}: {
  /** The stages this member can speak to, from GET /learning/contribute. */
  stages: ContributeStage[]
  defaultTopicKey?: string | null
  onClose: () => void
  onShared: (share: LearningShare, topicKey: string) => void
}) {
  const { notify } = useApp()
  const [topicKey, setTopicKey] = useState(defaultTopicKey ?? stages[0]?.topicKey ?? '')
  const [kind, setKind] = useState<ShareKind>('article')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [whyHelped, setWhyHelped] = useState('')
  const [about, setAbout] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState<ProjectDifficulty>('beginner')
  const [estHours, setEstHours] = useState('')
  const [audience, setAudience] = useState<ShareAudience>('everyone')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (defaultTopicKey) setTopicKey(defaultTopicKey)
  }, [defaultTopicKey])

  const isProject = kind === 'project'
  const stage = stages.find((s) => s.topicKey === topicKey)

  /** Commits whatever is in the tag box (Enter or comma), de-duplicated. */
  const addTags = (raw: string) => {
    const next = raw.split(',').map((t) => t.trim()).filter(Boolean)
    if (!next.length) return
    setTags((prev) => {
      const seen = new Set(prev.map((t) => t.toLowerCase()))
      const merged = [...prev]
      for (const t of next) {
        if (merged.length >= MAX_TAGS) break
        if (!seen.has(t.toLowerCase())) {
          merged.push(t.slice(0, 40))
          seen.add(t.toLowerCase())
        }
      }
      return merged
    })
    setTagDraft('')
  }

  const submit = async () => {
    // Anything still typed in the tag box counts.
    const allTags = [...tags, ...tagDraft.split(',').map((t) => t.trim()).filter(Boolean)].slice(0, MAX_TAGS)
    const link = url.trim()
    if (!topicKey) return setError('Pick the stage this is for.')
    if (title.trim().length < 3) return setError('Give it a title.')
    if (link && !isHttpUrl(link)) return setError('Links should start with https://')
    if (!isProject && !link) return setError('Add the link you are recommending (https://…)')
    if (isProject && !link && about.trim().length < ABOUT_MIN) {
      return setError(`Add a link to the brief, or describe the project in at least ${ABOUT_MIN} characters.`)
    }
    if (whyHelped.trim().length < WHY_MIN) {
      return setError(`Say in a sentence what it taught you (at least ${WHY_MIN} characters) — it is what makes this useful.`)
    }
    if (!allTags.length) return setError('Add at least one skill it covers, so people can find it.')
    setSaving(true)
    setError('')
    try {
      const hours = Number(estHours)
      const r = await api.shareLearning({
        topicKey,
        kind,
        title: title.trim(),
        url: link || undefined,
        whyHelped: whyHelped.trim(),
        skills: allTags,
        difficulty,
        audience,
        ...(isProject
          ? {
              about: about.trim() || undefined,
              ...(Number.isFinite(hours) && hours > 0 ? { estHours: Math.round(hours) } : {}),
            }
          : {}),
      })
      notify(
        r.duplicate
          ? 'Someone already shared that link for this stage — here it is.'
          : audience === 'connections'
            ? 'Shared — thank you. Your connections can now find it in All Resources.'
            : 'Shared — thank you. It is now in All Resources for everyone.',
      )
      onShared(r.share, topicKey)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share that.')
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Share what helped you</h2>
            <p className="text-xs text-muted">Everyone can find it in All Resources, with your name on it.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <Label>Which stage</Label>
          <select
            value={topicKey}
            onChange={(e) => setTopicKey(e.target.value)}
            aria-label="Stage"
            className="rounded-lg border border-line px-3 py-2 text-sm"
          >
            {stages.map((s) => (
              <option key={s.topicKey} value={s.topicKey}>
                {s.title}
                {s.sharesCount === 0 ? ' — nothing shared yet' : ''}
              </option>
            ))}
          </select>
          {stage && stage.membersWaiting > 0 && (
            <p className="-mt-1 text-[11px] text-brand">{waitingLabel(stage.membersWaiting)}.</p>
          )}

          <Label>Type</Label>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t.value}
                onClick={() => setKind(t.value)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  kind === t.value ? 'border-brand bg-brand-50 text-brand' : 'border-line text-muted'
                }`}
              >
                {KIND_LABEL[t.value]}
              </button>
            ))}
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isProject ? 'Project title — what should they build?' : 'Title — e.g. AWS VPC deep dive'}
            aria-label="Title"
            maxLength={160}
            className="mt-1 rounded-lg border border-line px-3 py-2 text-sm"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={isProject ? 'Link to the brief, repo or doc (or describe it below)' : 'https://…'}
            aria-label="Link"
            className="rounded-lg border border-line px-3 py-2 text-sm"
          />

          {isProject && (
            <>
              <Label>About the project</Label>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder={
                  'The problem to solve, the requirements, and what "done" looks like.\n' +
                  'e.g. Build a 2-tier VPC: public subnet with a load balancer, private subnet with the app, ' +
                  'NAT for outbound only. Done = the app is reachable through the LB and not directly.'
                }
                aria-label="About the project"
                maxLength={5000}
                rows={6}
                className="rounded-lg border border-line px-3 py-2 text-sm"
              />
              <p className="-mt-1 text-[11px] text-muted">
                {url.trim()
                  ? 'Optional with a link — but it helps people decide before they open it.'
                  : `${Math.max(0, ABOUT_MIN - about.trim().length)} more characters needed without a link.`}
              </p>
            </>
          )}

          <Label>{isProject ? 'Why build this' : 'Why it helped you'}</Label>
          <textarea
            value={whyHelped}
            onChange={(e) => setWhyHelped(e.target.value)}
            placeholder={
              isProject
                ? 'What it teaches, and what it proves to an interviewer.'
                : 'What clicked after reading or watching it?'
            }
            aria-label="Why it helped you"
            maxLength={500}
            rows={2}
            className="rounded-lg border border-line px-3 py-2 text-sm"
          />
          {whyHelped.trim().length < WHY_MIN && (
            <p className="text-[11px] text-muted">
              {WHY_MIN - whyHelped.trim().length} more characters — what did it teach you?
            </p>
          )}

          <Label>Skills it covers</Label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line px-2 py-1.5">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-xs text-brand">
                {t}
                <button onClick={() => setTags((prev) => prev.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
                  <X size={10} />
                </button>
              </span>
            ))}
            {tags.length < MAX_TAGS && (
              <input
                value={tagDraft}
                onChange={(e) => {
                  if (e.target.value.includes(',')) addTags(e.target.value)
                  else setTagDraft(e.target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTags(tagDraft)
                  }
                }}
                onBlur={() => addTags(tagDraft)}
                placeholder={tags.length ? '' : 'e.g. AWS, Python, LLM/RAG — press Enter'}
                aria-label="Skills"
                className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none"
              />
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label>Difficulty</Label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as ProjectDifficulty)}
                aria-label="Difficulty"
                className="rounded-lg border border-line px-2 py-2 text-sm"
              >
                {DIFFICULTY_FILTERS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            {isProject && (
              <div className="flex flex-col gap-1">
                <Label>Hours (estimate)</Label>
                <input
                  value={estHours}
                  onChange={(e) => setEstHours(e.target.value)}
                  placeholder="e.g. 6"
                  inputMode="numeric"
                  aria-label="Estimated hours"
                  className="w-24 rounded-lg border border-line px-2 py-2 text-sm"
                />
              </div>
            )}
          </div>

          <Label>Share with</Label>
          <div className="flex gap-2" role="radiogroup" aria-label="Share with">
            {(['everyone', 'connections'] as ShareAudience[]).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={audience === a}
                onClick={() => setAudience(a)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  audience === a ? 'bg-brand text-white' : 'bg-gray-100 text-muted hover:bg-gray-200'
                }`}
              >
                {AUDIENCE_LABEL[a]}
              </button>
            ))}
          </div>

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void submit()}>
              Share with {AUDIENCE_LABEL[audience]}
            </Button>
          </div>
        </div>
      </Card>
    </div>,
    document.body,
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mt-1 text-[11px] font-semibold text-muted">{children}</label>
}
