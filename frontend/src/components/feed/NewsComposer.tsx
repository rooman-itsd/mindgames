import { useState } from 'react'
import { Award, CalendarDays, FileText, Rocket, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { Avatar, Button } from '../ui'
import {
  ARTICLE_CATEGORIES,
  PROJECT_SEEKING,
  type PostMeta,
  type PostType,
} from '../../types'

// Composer for the peer-to-peer News & Updates formats. One modal, four
// formats — each collects a few structured fields (stored in post.meta) plus a
// shared body. News posts are always visible to All Alumni.
type NewsFormat = Extract<PostType, 'Achievement' | 'Project' | 'Article' | 'Meetup'>

const FORMATS: {
  type: NewsFormat
  label: string
  icon: React.ReactNode
  blurb: string
}[] = [
  { type: 'Achievement', label: 'Achievement', icon: <Award size={18} />, blurb: 'New role, promotion, paper or award' },
  { type: 'Project', label: 'Project', icon: <Rocket size={18} />, blurb: 'A product, startup or side-project' },
  { type: 'Article', label: 'Article', icon: <FileText size={18} />, blurb: 'A guide, tip or industry take' },
  { type: 'Meetup', label: 'Meetup', icon: <CalendarDays size={18} />, blurb: 'An informal get-together or hackathon' },
]

const field =
  'w-full rounded-lg border border-[#edeff1] px-3 py-2 text-sm text-[#1c1c1c] placeholder-[#878a8c] outline-none focus:border-[#ff4500]'
const label = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-[#878a8c]'

// ~200 wpm reading estimate, shown live on the Article format.
const readMins = (text: string) => Math.max(1, Math.round(text.trim().split(/\s+/).filter(Boolean).length / 200))

export function NewsComposer({ onClose }: { onClose: () => void }) {
  const { currentUser, createPost } = useApp()
  const [type, setType] = useState<NewsFormat>('Achievement')
  const [content, setContent] = useState('')
  const [meta, setMeta] = useState<PostMeta>({})
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof PostMeta>(k: K, v: PostMeta[K]) => setMeta((m) => ({ ...m, [k]: v }))

  // Per-format required fields → keeps posts meaningful.
  function validate(): string | null {
    if (!content.trim()) return 'Add some details before posting.'
    if (type === 'Project' && !meta.projectName?.trim()) return 'Give your project a name.'
    if (type === 'Article' && !meta.title?.trim()) return 'Give your article a title.'
    if (type === 'Meetup') {
      if (!meta.title?.trim()) return 'Give your meetup a name.'
      if (!meta.date?.trim()) return 'Add when the meetup happens.'
    }
    return null
  }

  function submit() {
    const err = validate()
    if (err) return setError(err)
    // Only send fields relevant to the chosen format.
    const clean: PostMeta = {}
    const keep = (k: keyof PostMeta) => meta[k] !== undefined && meta[k] !== '' &&
      !(Array.isArray(meta[k]) && (meta[k] as unknown[]).length === 0)
    if (type === 'Achievement') (['jobTitle', 'achievementCompany', 'collaborators'] as const).forEach((k) => keep(k) && (clean[k] = meta[k] as never))
    if (type === 'Project') (['projectName', 'demoLink', 'techStack', 'seeking'] as const).forEach((k) => keep(k) && (clean[k] = meta[k] as never))
    if (type === 'Article') (['title', 'category'] as const).forEach((k) => keep(k) && (clean[k] = meta[k] as never))
    if (type === 'Meetup') (['title', 'date', 'location', 'rsvpLink', 'capacity'] as const).forEach((k) => keep(k) && (clean[k] = meta[k] as never))

    // Normalise links: "example.com" → "https://example.com" so the http(s)-only
    // server check accepts legitimate input (and never a javascript: scheme).
    const normalizeLink = (v?: string) => {
      const t = v?.trim()
      if (!t) return undefined
      return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`
    }
    if (clean.demoLink) clean.demoLink = normalizeLink(clean.demoLink)
    if (clean.rsvpLink) clean.rsvpLink = normalizeLink(clean.rsvpLink)

    createPost({ type, content, visibility: 'All Alumni', meta: clean })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div className="animate-slidein my-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#edeff1] px-5 py-4">
          <h2 className="text-lg font-bold text-[#1c1c1c]">Share news &amp; updates</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-[#878a8c] hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {/* Author */}
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={currentUser.name} src={currentUser.photo} size={44} />
            <div>
              <p className="font-semibold text-[#1c1c1c]">{currentUser.name}</p>
              <p className="text-xs text-[#878a8c]">Posting to News &amp; Updates · Everyone</p>
            </div>
          </div>

          {/* Format picker */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FORMATS.map((f) => (
              <button
                key={f.type}
                onClick={() => { setType(f.type); setError(null) }}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors ${
                  type === f.type
                    ? 'border-[#ff4500] bg-orange-50 text-[#ff4500]'
                    : 'border-[#edeff1] text-[#878a8c] hover:border-[#ff4500]/40'
                }`}
                title={f.blurb}
              >
                {f.icon}
                <span className="text-xs font-semibold">{f.label}</span>
              </button>
            ))}
          </div>
          <p className="mb-4 text-xs text-[#878a8c]">{FORMATS.find((f) => f.type === type)!.blurb}.</p>

          {/* ---- Format-specific fields ---- */}
          {type === 'Achievement' && (
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>New title / role</label>
                <input className={field} placeholder="e.g. Lead Engineer" value={meta.jobTitle ?? ''} onChange={(e) => set('jobTitle', e.target.value)} />
              </div>
              <div>
                <label className={label}>Company / Organization</label>
                <input className={field} placeholder="e.g. Microsoft" value={meta.achievementCompany ?? ''} onChange={(e) => set('achievementCompany', e.target.value)} />
              </div>
            </div>
          )}

          {type === 'Project' && (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>Project name *</label>
                  <input className={field} placeholder="e.g. RooDeploy" value={meta.projectName ?? ''} onChange={(e) => set('projectName', e.target.value)} />
                </div>
                <div>
                  <label className={label}>Demo / repo link</label>
                  <input className={field} placeholder="https://…" value={meta.demoLink ?? ''} onChange={(e) => set('demoLink', e.target.value)} />
                </div>
              </div>
              <div className="mb-3">
                <label className={label}>Looking for</label>
                <div className="flex flex-wrap gap-1.5">
                  {PROJECT_SEEKING.map((s) => (
                    <button
                      key={s}
                      onClick={() => set('seeking', meta.seeking === s ? undefined : s)}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        meta.seeking === s ? 'bg-[#ff4500] text-white' : 'bg-gray-100 text-[#878a8c] hover:bg-gray-200'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {type === 'Article' && (
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Title *</label>
                <input className={field} placeholder="e.g. A practical guide to CI/CD" value={meta.title ?? ''} onChange={(e) => set('title', e.target.value)} />
              </div>
              <div>
                <label className={label}>Category</label>
                <select className={field} value={meta.category ?? ''} onChange={(e) => set('category', e.target.value || undefined)}>
                  <option value="">Choose…</option>
                  {ARTICLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}

          {type === 'Meetup' && (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>Meetup name *</label>
                  <input className={field} placeholder="e.g. Bengaluru Alumni Coffee" value={meta.title ?? ''} onChange={(e) => set('title', e.target.value)} />
                </div>
                <div>
                  <label className={label}>When *</label>
                  <input className={field} placeholder="e.g. Sat, Aug 9 · 6 PM" value={meta.date ?? ''} onChange={(e) => set('date', e.target.value)} />
                </div>
                <div>
                  <label className={label}>Location</label>
                  <input className={field} placeholder="e.g. Bengaluru / Online" value={meta.location ?? ''} onChange={(e) => set('location', e.target.value)} />
                </div>
                <div>
                  <label className={label}>Capacity</label>
                  <input className={field} inputMode="numeric" placeholder="e.g. 30" value={meta.capacity ?? ''} onChange={(e) => set('capacity', e.target.value ? Number(e.target.value.replace(/\D/g, '')) : undefined)} />
                </div>
              </div>
              <div className="mb-3">
                <label className={label}>RSVP link</label>
                <input className={field} placeholder="https://…" value={meta.rsvpLink ?? ''} onChange={(e) => set('rsvpLink', e.target.value)} />
              </div>
            </>
          )}

          {/* Shared body */}
          <label className={label}>
            {type === 'Article' ? 'Article body * (markdown supported)' : 'Details *'}
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={type === 'Article' ? 8 : 4}
            placeholder={
              type === 'Achievement' ? 'Share what happened and who helped along the way…'
              : type === 'Project' ? 'What does it do? What problem does it solve?'
              : type === 'Article' ? 'Write your article… **bold**, ## headings, - lists and [links](url) are supported.'
              : 'What’s the plan? Who should come along?'
            }
            className={`${field} resize-none`}
          />
          {type === 'Article' && content.trim() && (
            <p className="mt-1 text-xs text-[#878a8c]">~{readMins(content)} min read</p>
          )}

          {/* Collaborators / tech stack chip inputs */}
          {type === 'Achievement' && (
            <ChipInput className="mt-3" label="Tag alumni who helped" placeholder="Type a name, press Enter" values={meta.collaborators ?? []} onChange={(v) => set('collaborators', v)} />
          )}
          {type === 'Project' && (
            <ChipInput className="mt-3" label="Tech stack" placeholder="e.g. React, then Enter" values={meta.techStack ?? []} onChange={(v) => set('techStack', v)} />
          )}

          {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[#edeff1] px-5 py-3">
          <Button onClick={submit} disabled={!content.trim()}>Post to News</Button>
        </div>
      </div>
    </div>
  )
}

// Small tag-input: type + Enter (or comma) to add, click × to remove.
function ChipInput({
  label: lbl, placeholder, values, onChange, className = '',
}: {
  label: string
  placeholder: string
  values: string[]
  onChange: (v: string[]) => void
  className?: string
}) {
  const [draft, setDraft] = useState('')
  function add() {
    const v = draft.trim().replace(/,$/, '').trim()
    if (!v || values.includes(v) || values.length >= 20) { setDraft(''); return }
    onChange([...values, v])
    setDraft('')
  }
  return (
    <div className={className}>
      <label className={label}>{lbl}</label>
      {values.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-[#ff4500]">
              {v}
              <button onClick={() => onChange(values.filter((x) => x !== v))} className="text-[#ff4500]/70 hover:text-[#ff4500]">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className={field}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
        onBlur={add}
      />
    </div>
  )
}
