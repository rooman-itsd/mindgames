import { BanyanTree } from '../ui/BanyanTree'

/**
 * Backdrop behind the signed-out card screens (Login — which invites land on
 * — Forgot and Reset password): a midnight sky at the edge of dawn.
 *
 * Layers, back to front (styles in index.css under .grove-auth):
 *   sky gradient   indigo → teal → emerald horizon, marigold sunrise at the root
 *   aurora         three slow emerald / violet / teal glows
 *   stars          two tiled dot layers, one gently twinkling
 *   doodles        WhatsApp-style wallpaper of faint alumni line icons
 *   banyan tree    green parent nodes, orange tips, glowing root, gold pulses
 *   vignette+grain depth and texture
 *
 * Place it as the first child of a `relative isolate` wrapper; it sits at
 * -z-10 behind the card. All motion stops under prefers-reduced-motion.
 */
export function AuthBackdrop() {
  return (
    <div aria-hidden className="grove-auth pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <i className="auth-aurora a1" />
      <i className="auth-aurora a2" />
      <i className="auth-aurora a3" />
      <div className="auth-stars" />
      <div className="auth-stars twinkle" />
      <div className="auth-doodles" />
      <BanyanTree className="absolute inset-0 h-full w-full" />
      <div className="auth-vignette" />
      <div className="auth-grain" />
    </div>
  )
}
