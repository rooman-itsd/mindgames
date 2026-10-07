import { useApp } from '../../store/AppStore'
import { timeGreeting } from '../../lib/homeGreeting'

/**
 * Top of Home: just a warm hello. "Good afternoon," sits quiet in the body
 * font; the member's first name carries the moment in the display face
 * (Bricolage Grotesque) with an emerald → lagoon gradient (.greeting-name in
 * index.css, which has its own dark-mode colours).
 */
export function HomeGreeting() {
  const { currentUser } = useApp()
  const firstName = currentUser.name.split(' ')[0] || 'there'

  return (
    <section className="rounded-2xl border border-line bg-gradient-to-r from-surface via-surface to-brand-50 px-5 py-4 shadow-sm sm:px-6 sm:py-5">
      <h1 className="flex flex-wrap items-baseline gap-x-2 leading-tight">
        <span className="text-base font-medium text-muted sm:text-lg">{timeGreeting(new Date().getHours())},</span>{' '}
        <span className="greeting-name font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{firstName}</span>
      </h1>
    </section>
  )
}
