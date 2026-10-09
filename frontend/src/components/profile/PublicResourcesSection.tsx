import { useEffect, useState, type ReactNode } from 'react'
import { Book, BookOpen, ExternalLink, FileText, GraduationCap, Link2, Video } from 'lucide-react'
import { api } from '../../lib/api'
import type { CareerResourceKind, PublicCareerResource } from '../../types'

/**
 * The resources a member has chosen to show on their profile.
 *
 * Shown in the profile's Resources tab: visible on anyone's profile,
 * fetched on mount, renders nothing when there is nothing to show. What comes
 * back is deliberately the small PublicCareerResource shape — no stage, no
 * session, no status — because a resource being public never means the
 * roadmap stage or session it also happens to be filed under becomes public
 * too. Those name the other party to that link.
 */

const KIND_ICON: Record<CareerResourceKind, typeof BookOpen> = {
  article: FileText,
  video: Video,
  course: GraduationCap,
  book: Book,
  doc: BookOpen,
  other: Link2,
}

/**
 * `empty`, when given, is shown instead of nothing — for the profile's
 * Resources tab, where a blank panel would read as broken.
 */
export function PublicResourcesSection({ userId, empty }: { userId: string; empty?: ReactNode }) {
  const [items, setItems] = useState<PublicCareerResource[] | null>(null)
  // A failed load is not "nothing shared" — the tab must not claim that.
  const [failed, setFailed] = useState(false)
  // Bumped by "Try again" to re-run the fetch.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    // Back to "loading" on every fetch, so moving to another profile never
    // shows the previous member's resources under the new name.
    setItems(null)
    setFailed(false)
    api.getPublicCareerResources(userId).then(
      (r) => { if (live) setItems(r) },
      () => { if (live) { setItems([]); setFailed(true) } },
    )
    return () => { live = false }
  }, [userId, attempt])

  if (!items) return empty ? <p className="text-sm text-muted">Loading…</p> : null
  if (failed && empty) {
    return (
      <p className="py-8 text-center text-sm text-red-600">
        Could not load resources.{' '}
        <button onClick={() => setAttempt((n) => n + 1)} className="font-semibold text-brand hover:underline">
          Try again
        </button>
      </p>
    )
  }
  if (items.length === 0) return empty ?? null

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">
        Recommended resources
      </p>
      <div className="flex flex-col gap-1.5">
        {items.map((r) => {
          const Icon = KIND_ICON[r.kind] ?? Link2
          return (
            <div key={r.id} className="flex items-center gap-2 rounded-lg bg-page px-3 py-2">
              <Icon size={14} className="shrink-0 text-muted" />
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-medium text-ink hover:text-brand hover:underline"
                >
                  <span className="truncate">{r.title}</span>
                  <ExternalLink size={10} className="shrink-0" />
                </a>
              ) : (
                <span className="truncate text-sm font-medium text-ink">{r.title}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
