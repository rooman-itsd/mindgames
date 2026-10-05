import {
  SUPPORT_PREFERENCES,
  type BrowseFilters,
  type CareerResource,
  type LearningStageLite,
  type ProjectDifficulty,
  type ShareAudience,
  type ShareKind,
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
export function assignmentOrigin(r: Pick<CareerResource, 'sessionId' | 'sessionTopic' | 'requiresSubmission'>): string {
  if (r.sessionId) {
    const topic = r.sessionTopic ?? 'your session'
    return r.requiresSubmission ? `Follow-up from ${topic}` : `Prep for ${topic}`
  }
  return 'Assigned directly'
}

/** Whether an assigned resource still needs the member to send work back. */
export function submissionState(
  r: Pick<CareerResource, 'requiresSubmission' | 'submissionUrl'>,
): 'not_needed' | 'needed' | 'submitted' {
  if (!r.requiresSubmission) return 'not_needed'
  return r.submissionUrl ? 'submitted' : 'needed'
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

/** A rated share's one line, next to a star: "4.0 · helped 3 members". Every
 *  "Helped me" carries a rating, so the members count IS how many rated. */
export function ratingSummary(rating: number, helpedCount: number): string {
  return `${rating.toFixed(1)} · helped ${helpedCount} member${helpedCount === 1 ? '' : 's'}`
}

/** "4 members are on this step" — why sharing here is worth an alum's time. */
export function waitingLabel(count: number): string {
  if (count <= 0) return 'No one here yet'
  return count === 1 ? '1 member is on this step' : `${count} members are on this step`
}
