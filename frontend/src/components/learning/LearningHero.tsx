import { ArrowLeft, BookOpen, GraduationCap, Lightbulb, Sparkles } from 'lucide-react'

/** The page banner. Decorative only — no data, no requests. */
export function LearningHero({ onBack }: { onBack: () => void }) {
  return (
    <section className="flex items-center gap-4 overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 via-amber-50/60 to-surface px-5 py-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <button
          onClick={onBack}
          className="mt-2 rounded-full p-1 text-muted hover:bg-surface/70"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface text-brand shadow-sm">
          <BookOpen size={28} />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink">Learn with RooConnect</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Get the right learning resources, expert guidance, and real-world projects — from the Rooman
            alumni community.
          </p>
        </div>
      </div>

      {/* Icon composition standing in for an illustration (none supplied).
          A flex item, not absolutely positioned, so it can never sit on top of
          the text. Hidden until 2xl because the page shares its row with the
          network rail: below that, this is what pushes the title onto two
          lines, and the title matters more than the decoration. */}
      <div aria-hidden className="pointer-events-none hidden shrink-0 items-center gap-4 2xl:flex">
        <div className="flex flex-col items-end gap-1 text-right font-serif italic leading-tight text-ink/70">
          <span className="text-sm">Learn</span>
          <span className="text-sm">Grow</span>
          <span className="text-base font-semibold text-ink/80">Build Your Future</span>
        </div>
        <div className="relative h-20 w-24">
          <span className="absolute left-0 top-6 grid h-12 w-12 place-items-center rounded-2xl bg-surface text-amber-500 shadow-sm">
            <Lightbulb size={22} />
          </span>
          <span className="absolute right-0 top-0 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white shadow-md">
            <GraduationCap size={26} />
          </span>
          <Sparkles size={16} className="absolute bottom-0 right-3 text-amber-400" />
        </div>
      </div>
    </section>
  )
}
