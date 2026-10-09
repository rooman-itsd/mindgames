import type { DotKind } from '../../lib/agenda'

/** Dot colour per agenda kind — Emerald Grove tokens (index.css). Kept apart
 *  from AgendaParts.tsx so that file exports components only (fast refresh). */
export const DOT_CLASS: Record<DotKind, string> = {
  confirmed: 'bg-jade-600',
  waiting: 'bg-marigold',
  toConfirm: 'bg-gray-400',
  hosting: 'bg-brand',
  joined: 'bg-amethyst-600',
  open: 'bg-lagoon-600',
  group: 'bg-amethyst-600',
}
