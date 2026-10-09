import {
  SUPPORT_PREFERENCES,
  type BrowseFilters,
  type CareerResource,
  type ContributeStage,
  type LearningStageLite,
  type ProjectDifficulty,
  type ShareAudience,
  type ShareKind,
  type StageOption,
} from '../types'

/**
 * Pure rules for the Learning Resources page — no React, no fetch.
 *
 * Kept out of the components so the cards, the tabs and the share form all
 * agree on the same labels and the same "which stage am I on" answer, and so
 * the rules can be checked on their own (learningHub.check.ts).
 */

/** Who a share is for, in the only two words the page uses for it. */
export const AUDIENCE_LABEL: Record<ShareAudience, string> = {
  everyone: 'Everyone',
  connections: 'My connections',
}

/** Badge text for what an alum shared. */
export const KIND_LABEL: Record<string, string> = {
  course: 'Course',
  tutorial: 'Tutorial',
  doc: 'Documentation',
  project: 'Project',
  article: 'Article',
}

/** The Filter-by panel's Resource Type options, exactly as the panel shows them. */
export const TYPE_FILTERS: { value: ShareKind; label: string }[] = [
  { value: 'course', label: 'Courses' },
  { value: 'tutorial', label: 'Tutorials' },
  { value: 'doc', label: 'Documentation' },
  { value: 'project', label: 'Projects' },
  { value: 'article', label: 'Articles & Blogs' },
]

/** The Filter-by panel's Difficulty Level options. */
export const DIFFICULTY_FILTERS: { value: ProjectDifficulty; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

/** Adds the value if absent, removes it if present — a checkbox in a filter group. */
export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/** Whether any search or filter is narrowing the All Resources list. */
export function isFiltering(f: BrowseFilters): boolean {
  return !!f.q.trim() || f.tags.length > 0 || f.types.length > 0 || f.difficulty.length > 0
}

/** "docs.aws.amazon.com/vpc/…" — the short form a card shows under a title. */
export function displayLink(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/+$/, '')
    if (!path) return host
    const first = path.split('/').filter(Boolean)[0]
    return path.split('/').filter(Boolean).length > 1 ? `${host}/${first}/…` : `${host}/${first}`
  } catch {
    return url
  }
}

/** The short label for a stored support preference, or null when unknown. */
export function supportLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return SUPPORT_PREFERENCES.find((p) => p.value === value)?.short ?? null
}

/** Stages the member works through — the roadmap's bookends ("you are here"
 *  and the goal itself) excluded. Mirrors workableStages in careerProgress.ts,
 *  for the lighter stage shape this page receives. */
export function workable<T extends { stepKey: string }>(stages: T[]): T[] {
  return stages.length >= 3 ? stages.slice(1, -1) : []
}

/** "Step 2 of 3" — where the current stage sits among the workable ones. */
export function stepPosition(
  stages: LearningStageLite[],
  currentStepKey: string | null,
): { index: number; total: number } | null {
  const list = workable(stages)
  const i = list.findIndex((s) => s.stepKey === currentStepKey)
  return i === -1 ? null : { index: i + 1, total: list.length }
}

/** Where an assigned resource came from, as the card's caption. */
export function assignmentOrigin(
  r: Pick<CareerResource, 'sessionId' | 'sessionTopic' | 'requiresSubmission' | 'afterSession' | 'stepTitle'>,
): string {
  if (r.sessionId) {
    const topic = r.sessionTopic ?? 'your session'
    // After the session it is a follow-up even when it asks for nothing back.
    return r.requiresSubmission || r.afterSession ? `Follow-up from ${topic}` : `Prep for ${topic}`
  }
  // Assigned from the mentee's roadmap, against one of their stages.
  if (r.stepTitle) return `For stage “${r.stepTitle}”`
  return 'Assigned directly'
}

/** Whether an assigned resource still needs the member to send work back. */
export function submissionState(
  r: Pick<CareerResource, 'requiresSubmission' | 'submissionUrl' | 'submissionAt'>,
): 'not_needed' | 'needed' | 'submitted' {
  if (!r.requiresSubmission) return 'not_needed'
  // submissionAt too: work sent back as files only has no link.
  return r.submissionUrl || r.submissionAt ? 'submitted' : 'needed'
}

/** Appends a fetched page to what is shown, dropping any row already there —
 *  a row can arrive twice if it was added while the member was paging. */
export function appendPage<T extends { id: string }>(shown: T[], page: T[]): T[] {
  const seen = new Set(shown.map((x) => x.id))
  return [...shown, ...page.filter((x) => !seen.has(x.id))]
}

/** Months as the banner shows them: "8 months", "1 month". */
export function monthsLabel(months: number): string {
  return `${months} ${months === 1 ? 'month' : 'months'}`
}

/** An item's standing: how many members said it helped them. Never a score —
 *  it is a count of people, and reads as one. */
export function helpedByLabel(count: number): string {
  if (count === 0) return 'Be the first to say it helped'
  return count === 1 ? 'Helped 1 member' : `Helped ${count} members`
}

/** A rated share's one line, next to a star: "4.0 · helped 3 members". Presses
 *  from before ratings existed have no rating, so when fewer members rated than
 *  were helped the line says how many the average is from. */
export function ratingSummary(rating: number, helpedCount: number, ratingCount = helpedCount): string {
  const helped = `helped ${helpedCount} member${helpedCount === 1 ? '' : 's'}`
  if (ratingCount >= helpedCount) return `${rating.toFixed(1)} · ${helped}`
  return `${rating.toFixed(1)} from ${ratingCount} rating${ratingCount === 1 ? '' : 's'} · ${helped}`
}

/** A suggested stage (GET /learning/contribute) as a share-form choice. */
export function fromSuggested(s: ContributeStage): StageOption {
  return { topicKey: s.topicKey, title: s.title, membersWaiting: s.membersWaiting, sharesCount: s.sharesCount }
}

/** "4 members are on this step" — why sharing here is worth an alum's time. */
export function waitingLabel(count: number): string {
  if (count <= 0) return 'No one here yet'
  return count === 1 ? '1 member is on this step' : `${count} members are on this step`
}

// ---- Add resource ----------------------------------------------------------

/** Most files on one resource, and the largest one — the server's limits. */
export const MAX_RESOURCE_FILES = 10
export const MAX_RESOURCE_FILE_BYTES = 10 * 1024 * 1024
/** "Why it helped" must say something — the server's WHY_HELPED_MIN. */
export const RESOURCE_WHY_MIN = 30

/** Programs, scripts and web pages are refused (the server refuses them too). */
export function isBlockedFile(name: string): boolean {
  // Trailing dots/spaces stripped first, as the server does (Windows drops
  // them on save, so "setup.exe." is setup.exe). Same list as the server's.
  return /\.(exe|msi|msp|bat|cmd|com|scr|pif|cpl|ps1|vbs|vbe|js|jse|mjs|wsf|wsh|hta|lnk|scf|url|inf|reg|msc|jar|apk|appx|msix|dll|sh|command|html?|svg|xhtml)$/i.test(
    name.trim().replace(/[.\s]+$/, ''),
  )
}

/** Types a browser shows in place (a new tab) — the server's INLINE_TYPES;
 *  every other file is a download. */
export function opensInTab(mime: string): boolean {
  return /^(image\/(png|jpe?g|gif|webp|avif)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp4|ogg|wav|webm|aac)|application\/pdf)$/.test(mime)
}

/** 420 KB, 8.6 MB. */
export function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
}

/** Most domains on one resource — the server's MAX_TAGS. */
export const MAX_RESOURCE_DOMAINS = 8

/** Ticked domains plus the ones typed under "Others", trimmed and
 *  de-duplicated case-insensitively, in the order they were added. */
export function resourceDomains(picked: string[], typed: string[]): string[] {
  const all = [...picked, ...typed]
    .map((d) => d.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
  const seen = new Set<string>()
  return all.filter((d) => !seen.has(d.toLowerCase()) && !!seen.add(d.toLowerCase()))
}

/** What still stops the Add resource form from being sent, or null. */
export function resourceFormProblem(f: {
  domains: string[]
  title: string
  files: number
  uploading: number
  whyHelped: string
}): string | null {
  if (!f.domains.length) return 'Pick a domain.'
  if (f.title.trim().length < 3) return 'Give it a title.'
  if (!f.files && !f.uploading) return 'Attach at least one file.'
  if (f.uploading) return 'Wait for the files to finish uploading.'
  if (f.whyHelped.trim().length < RESOURCE_WHY_MIN) return `Say why it helped (at least ${RESOURCE_WHY_MIN} characters).`
  return null
}
