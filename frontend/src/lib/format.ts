// Small presentation helpers shared across the app.

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Deterministic gradient per name so avatars are stable & colourful.
const AVATAR_GRADIENTS = [
  // Banyan slots replace the two orange ones; the count stays 8 so every
  // other member keeps the colour their name already hashes to.
  'from-brand-500 to-brand-800',
  'from-sky-500 to-indigo-500',
  'from-emerald-500 to-teal-500',
  'from-violet-500 to-fuchsia-500',
  'from-marigold to-amber-600',
  'from-cyan-500 to-blue-600',
  'from-pink-500 to-rose-600',
  'from-lime-500 to-emerald-600',
]

export function avatarGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const s = Math.max(1, Math.floor((now - then) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// A user's role line: "Designation · Company", falling back to their
// college when neither is set (Student / Just looking around have no employer).
export function roleLine(u: { designation?: string; company?: string; college?: string }): string {
  const role = [u.designation, u.company].filter(Boolean).join(' · ')
  return role || u.college || ''
}

export function compact(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

// Only return a URL if it's a safe http(s) link. Blocks javascript:/data: and
// other schemes before they reach an <a href> (defense-in-depth with the
// server-side validation). Returns undefined for anything unsafe/empty.
export function safeUrl(url?: string | null): string | undefined {
  const u = url?.trim()
  return u && /^https?:\/\//i.test(u) ? u : undefined
}

// A paid session booked against a "custom" (price-on-request) alumni service
// has no amount to snapshot, so price comes back as 0 — which must not be
// shown as "Paid ₹0" (reads as free). null means "not paid, show nothing".
export function sessionPriceLabel(s: { isPaid?: boolean; price?: number }): string | null {
  if (!s.isPaid) return null
  return s.price ? `Paid ₹${s.price.toLocaleString('en-IN')}` : 'Paid (price on request)'
}

// The display labels a session is stored with, derived from a real instant.
// Must stay byte-identical to labelsFor() in backend/src/routes/mentorship.routes.ts:
// a session offered here and one edited there are listed side by side, and the
// server re-derives these same labels whenever the mentor moves a session.
//
// Pinned to Asia/Kolkata rather than the viewer's zone. The label carries a
// literal "IST", so formatting in local time would write "6:00 PM IST" for a
// mentor in London who meant 6pm their time — disagreeing with the instant
// stored beside it and with the reminder, which is scheduled in IST.
// Same formatter as backend/src/sessionLabels.ts (labelsFor) — the two apps
// can't share code, so keep them in step.
export function sessionLabels(when: Date): { dateLabel: string; timeLabel: string } {
  const opts = { timeZone: 'Asia/Kolkata' } as const
  return {
    // en-IN gives "Fri, 20 Nov, 2026"; every label already stored reads
    // "Fri, 26 Sep 2026", so the comma before the year goes.
    dateLabel: when
      .toLocaleDateString('en-IN', { ...opts, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      .replace(/,(\s\d{4})$/, '$1')
      // Newer ICU data spells September "Sept" in en-IN; stored labels say "Sep".
      .replace('Sept', 'Sep'),
    // en-IN gives a lowercase "pm"; existing labels are "8:00 PM IST".
    timeLabel: `${when
      .toLocaleTimeString('en-IN', { ...opts, hour: 'numeric', minute: '2-digit' })
      .toUpperCase()} IST`,
  }
}

// Tailwind classes for a mentorship badge pill, by tier. Shared between
// MentorWorkspace and MentorshipRecord so the two never drift — silver and
// gold are plain fills; crimson (the badges that take real volume or can't
// be earned by volume at all, like a rating others give you) gets a
// diagonal dark-red-to-black gradient via arbitrary-value classes rather
// than a flat fill, so it reads as red-and-black, not just another pastel.
export function badgeTierClasses(tier: 'silver' | 'gold' | 'crimson'): string {
  if (tier === 'silver') return 'border-slate-300 bg-slate-50 text-slate-600'
  if (tier === 'crimson') {
    return 'border-red-700 bg-[linear-gradient(135deg,#7f1d1d_0%,#200606_60%,#000_100%)] text-red-200'
  }
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

/** "1 alum" / "3 alumni". "Alumni" is plural, so a count of one needs the
 *  singular; "alum" rather than "alumnus"/"alumna" so it assumes nobody's
 *  gender. */
export function alumniCount(n: number): string {
  return n === 1 ? '1 alum' : `${n} alumni`
}
