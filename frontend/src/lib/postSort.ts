import type { Post } from '../types'

export type SortMode = 'Best' | 'Hot' | 'New' | 'Top' | 'Rising'

export const SORT_MODES: SortMode[] = ['Best', 'Hot', 'New', 'Top', 'Rising']

export const DEFAULT_SORT: SortMode = 'Hot'

/** Narrows an arbitrary string (e.g. a URL param) to a SortMode. */
export function toSortMode(value: string | null | undefined): SortMode {
  return SORT_MODES.includes(value as SortMode) ? (value as SortMode) : DEFAULT_SORT
}

/**
 * Shared feed ordering. Used by both the Home feed and the Home right sidebar
 * so the two can never disagree about what "Hot" means.
 */
export function sortPostsBySortMode(posts: Post[], mode: SortMode): Post[] {
  const now = Date.now()

  switch (mode) {
    case 'New':
      return [...posts].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    case 'Top':
      // Ties (common at 0–1 likes) go to the newest, not to arrival order.
      return [...posts].sort((a, b) => b.likes - a.likes || +new Date(b.createdAt) - +new Date(a.createdAt))
    case 'Best':
      return [...posts].sort((a, b) => {
        const scoreA = a.likes * 2 + a.comments.length * 3
        const scoreB = b.likes * 2 + b.comments.length * 3
        return scoreB - scoreA || +new Date(b.createdAt) - +new Date(a.createdAt)
      })
    case 'Hot': {
      return [...posts].sort((a, b) => {
        const ageHoursA = (now - +new Date(a.createdAt)) / (1000 * 60 * 60)
        const ageHoursB = (now - +new Date(b.createdAt)) / (1000 * 60 * 60)
        const scoreA = a.likes / Math.pow(ageHoursA + 2, 1.5)
        const scoreB = b.likes / Math.pow(ageHoursB + 2, 1.5)
        return scoreB - scoreA || +new Date(b.createdAt) - +new Date(a.createdAt)
      })
    }
    case 'Rising': {
      const recent = posts.filter((p) => +new Date(p.createdAt) > now - 24 * 60 * 60 * 1000)
      if (recent.length === 0) return [...posts].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      return recent.sort((a, b) => {
        const ageHoursA = (now - +new Date(a.createdAt)) / (1000 * 60 * 60) + 0.01
        const ageHoursB = (now - +new Date(b.createdAt)) / (1000 * 60 * 60) + 0.01
        const scoreA = a.likes / ageHoursA
        const scoreB = b.likes / ageHoursB
        return scoreB - scoreA || +new Date(b.createdAt) - +new Date(a.createdAt)
      })
    }
    default:
      return posts
  }
}
