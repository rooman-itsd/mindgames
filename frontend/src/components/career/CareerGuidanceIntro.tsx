import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from 'lucide-react'
import { Button } from '../ui'
import { CAREER_INTRO_STEPS } from '../../lib/careerIntro'

/**
 * The "what is this feature" walkthrough.
 *
 * A stepped two-pane overlay rather than one long block of text: the four
 * questions a newcomer actually has — what it is, how it works, why it helps,
 * what to do — are four separate screens, so none of them has to be skimmed
 * to reach the next. The rail on the left doubles as the table of contents,
 * so someone who only wants "what do I do" can jump straight there.
 *
 * Dismissable at any point; the caller decides whether that dismissal is
 * remembered.
 */
export function CareerGuidanceIntro({
  onClose,
  onStart,
  startLabel = 'Start my assessment',
}: {
  onClose: () => void
  /** Optional closing CTA. Without it the last step just closes. */
  onStart?: () => void
  startLabel?: string
}) {
  const [i, setI] = useState(0)
  const last = CAREER_INTRO_STEPS.length - 1
  const step = CAREER_INTRO_STEPS[i]
  const StepIcon = step.icon

  const go = useCallback(
    (delta: number) => setI((n) => Math.min(last, Math.max(0, n + delta))),
    [last],
  )

  // Arrow keys move between steps and Escape closes, so the walkthrough can be
  // read without reaching for the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, go])

  // The overlay scrolls its own content; letting the page behind scroll too
  // makes the backdrop drift away from the dialog on mobile.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div
      className="animate-fadein fixed inset-0 z-50 grid place-items-center bg-black/50 p-3 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="career-intro-heading"
    >
      <div
        className="animate-slidein flex max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step rail. Hidden on phones, where the dots in the footer do the
            same job without eating half the width. */}
        <aside className="hidden w-56 shrink-0 flex-col bg-ink p-5 sm:flex">
          <div className="mb-6 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
              R
            </span>
            <span className="text-xs leading-tight font-bold text-white">
              Career Guidance
              <span className="block font-medium text-white/50">A quick tour</span>
            </span>
          </div>

          <nav className="flex flex-col gap-1">
            {CAREER_INTRO_STEPS.map((s, idx) => {
              const done = idx < i
              const active = idx === i
              return (
                <button
                  key={s.tab}
                  onClick={() => setI(idx)}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors ${
                    active ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white/80'
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                      active
                        ? 'bg-brand text-white'
                        : done
                          ? 'bg-white/20 text-white'
                          : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {done ? <Check size={11} /> : idx + 1}
                  </span>
                  {s.tab}
                </button>
              )
            })}
          </nav>

          <p className="mt-auto pt-5 text-[11px] leading-relaxed text-white/35">
            Takes under a minute to read. You can reopen it any time from “How this works”.
          </p>
        </aside>

        {/* Content pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand">
                <StepIcon size={20} />
              </span>
              <div>
                <h2 id="career-intro-heading" className="text-lg leading-tight font-bold text-ink">
                  {step.heading}
                </h2>
                <p className="mt-0.5 text-xs font-semibold text-muted sm:hidden">
                  Step {i + 1} of {CAREER_INTRO_STEPS.length} · {step.tab}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-full p-1 text-muted hover:bg-gray-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <div key={i} className="animate-slidein min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p className="mb-4 text-sm leading-relaxed text-ink">{step.lead}</p>
            <div className="flex flex-col gap-2.5">
              {step.points.map((p) => {
                const PointIcon = p.icon
                return (
                  <div
                    key={p.title}
                    className="flex gap-3 rounded-xl border border-line p-3 transition-colors hover:border-brand/40"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-50 text-muted">
                      <PointIcon size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink">{p.title}</p>
                      <p className="text-sm leading-relaxed text-muted">{p.body}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
            <Button
              variant="ghost"
              icon={<ArrowLeft size={14} />}
              disabled={i === 0}
              onClick={() => go(-1)}
            >
              Back
            </Button>

            <div className="flex items-center gap-1.5" aria-hidden="true">
              {CAREER_INTRO_STEPS.map((s, idx) => (
                <span
                  key={s.tab}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === i ? 'w-5 bg-brand' : 'w-1.5 bg-line'
                  }`}
                />
              ))}
            </div>

            {i === last ? (
              <Button
                variant="ai"
                icon={<Sparkles size={14} />}
                onClick={() => {
                  onClose()
                  onStart?.()
                }}
              >
                {onStart ? startLabel : 'Got it'}
              </Button>
            ) : (
              <Button icon={<ArrowRight size={14} />} onClick={() => go(1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
