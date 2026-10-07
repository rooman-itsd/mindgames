// Profile completeness, shown only on your own profile (and on the last
// onboarding step).
//
// The point of the card is not the number — it's telling the member what the
// number BUYS them. So it lists the concrete things completeness unlocks,
// separated into hard gates and ranking effects, and never dresses a ranking
// effect up as a lock.

import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronDown, Lock, Sparkles, TrendingUp } from 'lucide-react'
import { Card } from '../ui'
import { CountUp, ProgressRing } from './motion'
import { profileCompleteness, profileGates } from '../../lib/profileCompleteness'
import { MentorVerification } from './MentorVerification'
import type { User } from '../../types'

export function ProfileCompletenessMeter({
  user,
  postCount,
  variant = 'full',
  onEdit,
}: {
  user: User
  /** Posts authored by this member — one of the scored buckets. */
  postCount?: number
  /** 'compact' drops the Card chrome — used inside the onboarding wizard. */
  variant?: 'full' | 'compact'
  onEdit?: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const { percent, missing } = profileCompleteness(user, { postCount })
  const gates = profileGates(user, percent)

  const done = percent >= 100
  const enforced = gates.filter((g) => g.enforced)
  const ranking = gates.filter((g) => !g.enforced)
  const locked = enforced.filter((g) => !g.met)

  const body = (
    <>
      <div className="flex items-center gap-4">
        <ProgressRing percent={percent}>
          <span className="text-sm font-bold text-ink">
            <CountUp to={percent} />%
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">
            {done ? 'Your profile is complete 🎉' : 'Complete your profile'}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {done
              ? "You're visible everywhere in the network and ranked highest in search."
              : locked.length > 0
                ? `${locked.length} ${locked.length === 1 ? 'thing' : 'things'} still switched off because of it.`
                : 'A few details left — they improve how often you get found.'}
          </p>
          {onEdit && !done && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={onEdit}
                className="rounded-full btn-primary px-3 py-1.5 text-xs font-bold text-white"
              >
                Finish your profile
              </button>
              {/* Both buttons open Edit Profile — resume autofill lives at the
                  top of it. Members who joined before these fields existed
                  reach it here rather than having to redo onboarding. */}
              <button
                onClick={onEdit}
                className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
              >
                <Sparkles size={12} /> or autofill from your resume
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Highest-value gaps first — the three biggest, then the rest on demand. */}
      {missing.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {(showAll ? missing : missing.slice(0, 3)).map((m) => (
              <motion.li
                key={m.label}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0 truncate text-ink">{m.label}</span>
                <span className="shrink-0 rounded-full bg-page px-2 py-0.5 text-xs font-bold text-brand">
                  +{Math.max(1, Math.round(m.delta))}%
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {missing.length > 3 && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="mt-2 text-xs font-semibold text-brand hover:underline"
        >
          {showAll ? 'Show less' : `Show all ${missing.length}`}
        </button>
      )}

      {/* What the percentage actually changes. */}
      <details className="group mt-3 border-t border-line pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-ink">
          What you get at 100%
          <ChevronDown size={14} className="text-muted transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-2 flex flex-col gap-1.5">
          {enforced.map((g) => (
            <li key={g.label} className="flex items-start gap-2 text-xs">
              {g.met ? (
                <Check size={13} className="mt-0.5 shrink-0 text-green-600" />
              ) : (
                <Lock size={12} className="mt-0.5 shrink-0 text-muted" />
              )}
              <span className={g.met ? 'text-muted line-through' : 'text-ink'}>{g.label}</span>
            </li>
          ))}
          {ranking.map((g) => (
            <li key={g.label} className="flex items-start gap-2 text-xs">
              <TrendingUp size={12} className="mt-0.5 shrink-0 text-brand" />
              <span className={g.met ? 'text-muted line-through' : 'text-ink'}>{g.label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          <Lock size={10} className="mr-0.5 inline" /> is a real requirement —
          <TrendingUp size={10} className="mx-0.5 inline" /> improves how you rank, it isn't a lock.
        </p>
      </details>

      {/* Scoring is deliberately narrow, and saying so is the point: nobody
          should think the small optional fields are holding them back. */}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Only your photo and basics, bio and skills, education, projects and certifications, a
        first post and one link count toward this score. Everything else on your profile —
        industry, work mode, languages, interests, achievements, extra links — is optional and
        doesn't affect it.
      </p>

      {/* Mentoring is the one thing here that can't be self-declared — this
          panel is the submit-proof flow, not a static checklist. Hidden during
          onboarding, where no application can exist yet. */}
      {variant === 'full' && <MentorVerification user={user} />}
    </>
  )

  if (variant === 'compact') {
    return <div className="rounded-xl border border-line p-4">{body}</div>
  }
  return <Card className="p-5">{body}</Card>
}
