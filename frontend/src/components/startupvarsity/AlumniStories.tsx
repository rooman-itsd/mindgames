import { motion, useReducedMotion } from 'motion/react'
import { Avatar } from '../ui'

/**
 * "Three starting points" — alumni stories under the safety net on
 * /startupvarsity, one per way in that the pitch lists (an idea; a problem and
 * no team; the risk) — each card says where they began and where they landed.
 *
 * SAMPLE CONTENT: the people are the demo personas from seed-data.ts and the
 * quotes are placeholders written from startupvarsity.com's own program terms
 * (incorporation in week one, validated problem statements, CTO/CBO
 * co-founders, sprint reviews). Until STORIES holds real, consented quotes the
 * section renders in development only (SHOW_SAMPLE_STORIES) — invented
 * endorsements must not reach live members.
 *
 * Theme tokens throughout (brand-50 band, surface cards), so dark mode gets
 * dark cards on a deep-green band instead of white glare.
 */
const SHOW_SAMPLE_STORIES = import.meta.env.DEV

/** A quote is lead + key + tail: the key line is the one the card highlights.
 *  Kept to ~20 words — three cards share the 820px page column, ~200px each. */
const STORIES = [
  {
    from: 'Had an idea',
    to: 'Founder',
    lead: 'Two years with an idea and no team. ',
    key: 'In week one, it was a registered company.',
    tail: ' By day 74, twelve stores were paying.',
    name: 'Priya Nair',
    meta: 'Founder · Batch 2020',
  },
  {
    from: 'A problem, no team',
    to: 'Co-founder · CTO',
    lead: 'No idea of my own. ',
    key: 'We took a validated problem and I came in as CTO.',
    tail: ' Stipends came after sprint review, so we shipped.',
    name: 'Rohan Verma',
    meta: 'CTO · Batch 2024',
  },
  {
    from: 'Startup didn’t work out',
    to: 'Joined another startup',
    lead: 'Our idea ',
    key: 'didn’t survive market validation.',
    tail: ' I kept what I’d built and joined another startup as data lead.',
    name: 'Ananya Gupta',
    meta: 'Data lead · Batch 2022',
  },
]

/** Seconds between one card rising in and the next. */
const STAGGER = 0.12

export function AlumniStories() {
  const reduceMotion = useReducedMotion()
  if (!SHOW_SAMPLE_STORIES) return null
  return (
    // @container: columns follow this section's own width, not the screen's —
    // the sidebars decide how much room it really gets.
    <section aria-labelledby="sv-stories-heading" className="@container rounded-2xl bg-brand-50 p-4 sm:p-5">
      <h3 id="sv-stories-heading" className="mb-3 text-[15px] font-bold text-brand">
        They were where you are. Here’s what happened next.
      </h3>
      {/* Three columns from @xl (576px). Each card is a subgrid of the list's
          three rows — chips / quote / person — so those line up across cards
          even when one quote runs a line longer. Narrower, cards stack. */}
      <ul className="grid gap-2.5 @xl:grid-cols-3 @xl:grid-rows-[auto_1fr_auto] @xl:gap-x-2.5 @xl:gap-y-0">
        {STORIES.map((s, i) => (
          // Rises in when scrolled into view (once), one card after another,
          // and lifts a little on hover. Reduced motion: shown as-is.
          <motion.li
            key={s.name}
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.45, ease: 'easeOut', delay: i * STAGGER }}
            whileHover={reduceMotion ? undefined : { y: -4 }}
            className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3.5 text-ink shadow-sm transition-shadow hover:shadow-md @xl:row-span-3 @xl:grid @xl:grid-rows-subgrid @xl:gap-y-2.5"
          >
            {/* Two lines in every card — from, then → to — so the chips are
                the same height everywhere instead of wrapping unevenly. */}
            <p className="flex flex-col items-start gap-1 text-[11.5px] font-bold">
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand">{s.from}</span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span aria-label="to" className="text-muted">→</span>
                <span className="rounded-full bg-marigold px-2 py-0.5 text-[#2a1d00]">{s.to}</span>
              </span>
            </p>
            <blockquote className="text-[13.5px] leading-relaxed">
              “{s.lead}
              {/* The highlighter "draws" left to right once the card is in view.
                  bg-transparent: browsers paint <mark> solid yellow by default. */}
              <motion.mark
                initial={reduceMotion ? false : { backgroundSize: '0% 100%' }}
                whileInView={{ backgroundSize: '100% 100%' }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.7, ease: 'easeInOut', delay: 0.35 + i * STAGGER }}
                className="bg-transparent bg-[linear-gradient(transparent_58%,rgb(242_168_29/0.4)_58%)] bg-no-repeat font-semibold text-ink"
                style={{ backgroundSize: '100% 100%' }}
              >
                {s.key}
              </motion.mark>
              {s.tail}”
            </blockquote>
            <div className="flex items-center gap-2 border-t border-line pt-2.5">
              <Avatar name={s.name} size={34} />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-bold">{s.name}</span>
                <span className="block text-xs text-muted">{s.meta}</span>
              </span>
            </div>
          </motion.li>
        ))}
      </ul>
    </section>
  )
}
