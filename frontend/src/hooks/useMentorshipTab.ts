import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * The Mentorship page's open tab, kept in the URL (?tab=sessions) rather than
 * component state. The page and its right sidebar are siblings under
 * AppLayout, so the URL is the one place both can read it from — and a link
 * can now open a tab directly. No ?tab (every existing link) means Find a
 * Mentor, exactly as before.
 */
export const MENTORSHIP_TABS = [
  { id: 'find', label: 'Find a Mentor' },
  { id: 'sessions', label: 'My Sessions' },
  { id: 'space', label: 'Mentor Space' },
  { id: 'group', label: 'Group Sessions' },
] as const

export type MentorshipTab = (typeof MENTORSHIP_TABS)[number]['id']

const isTab = (v: string | null): v is MentorshipTab => MENTORSHIP_TABS.some((t) => t.id === v)

export function useMentorshipTab(): [MentorshipTab, (tab: MentorshipTab) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: MentorshipTab = isTab(raw) ? raw : 'find'
  const setTab = useCallback(
    (next: MentorshipTab) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next === 'find') p.delete('tab')
          else p.set('tab', next)
          // A domain filter belongs to Group Sessions only.
          p.delete('domain')
          return p
        },
        // Switching tabs replaces the entry, as it did before: Back still
        // leaves the page instead of stepping through tabs.
        { replace: true },
      ),
    [setParams],
  )
  return [tab, setTab]
}
