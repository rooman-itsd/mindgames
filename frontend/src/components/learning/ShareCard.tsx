import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  Bookmark, BookmarkCheck, Clock, ExternalLink, FileText, Flag, Globe, HandHeart, Link2, Star, Trash2, Users, X,
} from 'lucide-react'
import { api } from '../../lib/api'
import { roleLine } from '../../lib/format'
import { AUDIENCE_LABEL, KIND_LABEL, displayLink, helpedByLabel, ratingSummary } from '../../lib/learningHub'
import { useApp } from '../../store/AppStore'
import { Avatar } from '../ui'
import type { LearningShare } from '../../types'
import { AskOrConnect } from './AskOrConnect'
import { KindBadge, KindIcon } from './KindIcon'

const DIFFICULTY: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

/**
 * One thing an alum shared — the page's whole unit.
 *
 * The person comes first, because that is what makes this different from a
 * list of links: their name, what they do, and their own sentence on why it
 * helped them. Then the thing itself, then the two ways to act on it — keep it
 * (Save), tell them it landed (Helped me), or ask them about it (Ask — or
 * Connect first, since messages open between connections).
 *
 * Every button is one small write. The card updates at once and puts the old
 * values back if the request fails, so a click never waits on the network.
 */
export function ShareCard({
  share,
  onChange,
  onRemoved,
  onSavedChange,
  mine = false,
}: {
  share: LearningShare
  onChange: (next: LearningShare) => void
  /** Hidden by reports, or deleted by its own author. */
  onRemoved?: (id: string) => void
  /** The viewer shared this: they get Delete instead of Helped/Ask. */
  mine?: boolean
  /** +1 / -1 once the server has confirmed a save or unsave, so the
   *  sidebar's "N saved" follows without re-reading the page. */
  onSavedChange?: (delta: 1 | -1) => void
}) {
  const { notify } = useApp()
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [rating, setRating] = useState(false)
  const ratingRef = useRef<HTMLDivElement>(null)
  const saved = !!share.mySavedResourceId

  // The star picker closes on a click outside it or Escape, like any popover.
  useEffect(() => {
    if (!rating) return
    const onDown = (e: MouseEvent) => {
      if (ratingRef.current && !ratingRef.current.contains(e.target as Node)) setRating(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRating(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [rating])
  const isProject = share.kind === 'project'

  const toggleSave = async () => {
    if (busy) return
    setBusy(true)
    const before = share
    onChange({
      ...share,
      mySavedResourceId: saved ? null : 'pending',
      savedCount: Math.max(0, share.savedCount + (saved ? -1 : 1)),
    })
    try {
      if (saved) {
        const r = await api.unsaveShare(share.id)
        onChange({ ...before, mySavedResourceId: null, savedCount: r.savedCount })
        onSavedChange?.(-1)
      } else {
        const r = await api.saveShare(share.id)
        onChange({ ...before, mySavedResourceId: r.savedResourceId, savedCount: r.savedCount })
        onSavedChange?.(1)
        notify('Saved — find it in Saved Resources.')
      }
    } catch (e) {
      onChange(before)
      notify(e instanceof Error ? e.message : 'Could not save that.', 'error')
    }
    setBusy(false)
  }

  /** "Helped me" with how much: 1–5 stars, given once and final. The server
   *  returns the share's new standing, which replaces the card's. */
  const rated = share.iHelped && share.myRating !== null
  const rate = async (stars: number) => {
    if (busy || rated) return
    setRating(false)
    setBusy(true)
    const before = share
    const firstTime = !share.iHelped
    try {
      const r = await api.markShareHelped(share.id, stars)
      onChange({
        ...before,
        iHelped: r.iHelped,
        helpedCount: r.helpedCount,
        rating: r.rating,
        ratingCount: r.ratingCount,
        myRating: r.myRating,
      })
      if (r.iHelped && firstTime) notify(`${share.sharedBy.name} has been told it helped you.`)
    } catch (e) {
      onChange(before)
      notify(e instanceof Error ? e.message : 'Could not do that.', 'error')
    }
    setBusy(false)
  }

  const report = async () => {
    if (!window.confirm('Report this as broken or unhelpful? It is hidden once a few members report it.')) return
    try {
      const r = await api.reportShare(share.id)
      notify('Thanks — reported.')
      if (r.hidden) onRemoved?.(share.id)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not report that.', 'error')
    }
  }

  const remove = async () => {
    if (!window.confirm('Remove this from the network? Members who saved it keep their own copy.')) return
    try {
      await api.deleteShare(share.id)
      onRemoved?.(share.id)
      notify('Removed.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not remove that.', 'error')
    }
  }

  return (
    <article className="flex h-full flex-col rounded-xl border border-line bg-surface p-3.5 shadow-sm">
      {/* The person, first. */}
      <div className="flex items-start gap-2.5">
        <Avatar name={share.sharedBy.name} size={36} to={`/profile/${share.sharedBy.id}`} />
        <div className="min-w-0 flex-1">
          <Link
            to={`/profile/${share.sharedBy.id}`}
            className="block truncate text-xs font-bold text-ink hover:underline"
          >
            {share.sharedBy.name}
            {share.sharedBy.isMentor && <span className="ml-1 text-[10px] font-semibold text-brand">Mentor</span>}
          </Link>
          <p className="truncate text-[11px] text-muted">{roleLine(share.sharedBy)}</p>
        </div>
        <KindBadge kind={share.kind} label={KIND_LABEL[share.kind] ?? 'Link'} />
      </div>

      {/* Your own share: who you shared it with. */}
      {mine && (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
          {share.audience === 'connections' ? <Users size={11} /> : <Globe size={11} />}
          Shared with {AUDIENCE_LABEL[share.audience]}
        </p>
      )}
      {share.hidden && (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">
          Hidden after members reported it — no longer shown to others.
        </p>
      )}

      {/* Their reason — the recommendation itself. */}
      <p className="mt-2.5 line-clamp-3 text-xs italic text-ink">“{share.whyHelped}”</p>

      {/* The thing. */}
      <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-gray-50 p-2">
        <KindIcon kind={share.kind} size={30} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs font-bold text-ink">{share.title}</p>
          {share.url && (
            <p className="flex min-w-0 items-center gap-1 text-[10px] text-muted">
              <Link2 size={9} className="shrink-0" />
              <span className="truncate">{displayLink(share.url)}</span>
            </p>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
            <span className="rounded-full bg-surface px-1.5 py-0.5 font-semibold">{DIFFICULTY[share.difficulty]}</span>
            {isProject && share.estHours != null && (
              <span className="inline-flex items-center gap-0.5">
                <Clock size={9} /> ~{share.estHours}h
              </span>
            )}
          </p>
        </div>
      </div>
      {share.skills.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {share.skills.slice(0, 4).map((s) => (
            <span key={s} className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[10px] text-ink">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-3">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
          <span className="flex min-w-0 items-center gap-1.5">
            {share.rating !== null && share.ratingCount > 0 ? (
              <span
                className="inline-flex min-w-0 items-center gap-1 truncate"
                title={`Average of ${share.ratingCount} rating${share.ratingCount === 1 ? '' : 's'}`}
              >
                <Star size={12} className="shrink-0 fill-amber-400 text-amber-400" />
                {ratingSummary(share.rating, share.helpedCount, share.ratingCount)}
              </span>
            ) : (
              <span className="truncate">{helpedByLabel(share.helpedCount)}</span>
            )}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => void toggleSave()}
              disabled={busy || share.hidden}
              aria-pressed={saved}
              aria-label={saved ? `Unsave ${share.title}` : `Save ${share.title}`}
              title={saved ? 'In Saved Resources' : 'Save to Saved Resources'}
              className={`rounded-full p-1 hover:bg-gray-50 ${saved ? 'text-brand' : ''}`}
            >
              {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
            </button>
            {mine ? (
              <button
                onClick={() => void remove()}
                aria-label={`Remove ${share.title}`}
                title="Remove from the network"
                className="rounded-full p-1 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={13} />
              </button>
            ) : (
              <button
                onClick={() => void report()}
                aria-label={`Report ${share.title}`}
                title="Report a broken or unhelpful share"
                className="rounded-full p-1 text-gray-300 hover:bg-gray-50 hover:text-red-500"
              >
                <Flag size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="mt-2 flex gap-1.5">
          {/* A brief's written problem statement opens in place; a link opens
              in a new tab. A brief can have both — the statement comes first. */}
          {isProject && share.about ? (
            <button
              onClick={() => setReading(true)}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-brand/40 py-1.5 text-xs font-semibold text-brand hover:bg-brand-50"
            >
              <FileText size={11} /> Read brief
            </button>
          ) : share.url ? (
            <a
              href={share.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-brand/40 py-1.5 text-xs font-semibold text-brand hover:bg-brand-50"
            >
              {isProject ? 'Open brief' : 'View'} <ExternalLink size={11} />
            </a>
          ) : (
            <span className="flex-1" />
          )}
          {!mine && (
            <>
              <div className="relative" ref={ratingRef}>
                <button
                  onClick={() => setRating((v) => !v)}
                  disabled={busy || share.hidden || rated}
                  aria-pressed={share.iHelped}
                  aria-expanded={rating}
                  title={
                    rated
                      ? `You rated this ${share.myRating} of 5 — ratings are final`
                      : `Tell ${share.sharedBy.name} this helped, and how much`
                  }
                  className={`flex items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                    share.iHelped
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-line text-muted hover:text-ink'
                  }`}
                >
                  <HandHeart size={13} />
                  {share.iHelped && share.myRating ? (
                    <>
                      Helped · {share.myRating}
                      <Star size={11} className="fill-current" />
                    </>
                  ) : share.iHelped ? (
                    'Helped'
                  ) : (
                    'Helped me'
                  )}
                </button>
                {rating && !rated && (
                  <div
                    role="dialog"
                    aria-label="How much did it help?"
                    className="absolute bottom-9 right-0 z-20 w-48 rounded-lg border border-line bg-surface p-2 shadow-lg"
                  >
                    <p className="text-[11px] font-semibold text-ink">How much did it help?</p>
                    <p className="mb-1 text-[10px] text-muted">Your rating is final once given.</p>
                    <div className="flex justify-between">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => void rate(n)}
                          aria-label={`${n} star${n > 1 ? 's' : ''}`}
                          className="rounded p-0.5 hover:bg-amber-50"
                        >
                          <Star
                            size={20}
                            className={n <= (share.myRating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-amber-300'}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <AskOrConnect userId={share.sharedBy.id} name={share.sharedBy.name} />
            </>
          )}
        </div>
      </div>

      {reading && share.about && <BriefModal share={share} mine={!!mine} onClose={() => setReading(false)} />}
    </article>
  )
}

/** A project brief's full problem statement, readable in place — enough for a
 *  member to start building, with the link (if any) and the alum to ask. */
function BriefModal({ share, mine, onClose }: { share: LearningShare; mine: boolean; onClose: () => void }) {
  // Escape closes it, as a dialog is expected to; the listener goes with it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-emerald-600">Project brief · {DIFFICULTY[share.difficulty]}</p>
            <h2 className="text-lg font-bold text-ink">{share.title}</h2>
            <p className="text-xs text-muted">
              From {share.sharedBy.name}
              {share.sharedBy.designation ? `, ${share.sharedBy.designation}` : ''}
              {share.estHours != null ? ` · about ${share.estHours} hours` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <p className="mt-3 text-xs italic text-ink">“{share.whyHelped}”</p>
        <h3 className="mt-4 text-xs font-bold text-ink">About the project</h3>
        <p className="mt-1 whitespace-pre-line text-sm text-ink">{share.about}</p>
        {share.skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {share.skills.map((s) => (
              <span key={s} className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[11px] text-ink">
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {share.url && (
            <a
              href={share.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand-50"
            >
              Open reference <ExternalLink size={13} />
            </a>
          )}
          {/* Not on your own brief — there is nobody to ask. */}
          {!mine && <AskOrConnect userId={share.sharedBy.id} name={share.sharedBy.name} variant="pill" onAsk={onClose} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
