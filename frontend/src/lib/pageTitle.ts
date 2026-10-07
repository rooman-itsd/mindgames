/**
 * Browser-tab titles for the signed-in app. Pure: path in, label out.
 * The tab reads "<label> · Root Connect", with "(n) " in front when there are
 * unread notifications or messages — see AppLayout.
 */
const LABELS: Array<[RegExp, string]> = [
  [/^\/home$/, 'Home'],
  [/^\/network\/requests/, 'Connection requests'],
  [/^\/network\/mentors/, 'Mentors'],
  [/^\/network\/my-network/, 'My network'],
  [/^\/network/, 'People you may know'],
  [/^\/events\/my-events/, 'My events'],
  [/^\/events\/past/, 'Past events'],
  [/^\/events\/host/, 'Host an event'],
  [/^\/events/, 'Events'],
  [/^\/jobs/, 'Jobs & referrals'],
  [/^\/companies\/[^/]+\/roadmaps/, 'Company roadmaps'],
  [/^\/companies\/[^/]+/, 'Company'],
  [/^\/companies/, 'Companies'],
  [/^\/mentorship/, 'Mentorship'],
  [/^\/startupvarsity/, 'StartupVarsity'],
  [/^\/news/, 'News & updates'],
  [/^\/explore/, 'Communities'],
  [/^\/community\//, 'Community'],
  [/^\/career-guidance\/assessment/, 'Career assessment'],
  [/^\/career-guidance\/roadmap\/edit/, 'Edit roadmap'],
  [/^\/career-guidance\/services/, 'Manage services'],
  [/^\/career-guidance/, 'Career guidance'],
  [/^\/learning-resources/, 'Learning resources'],
  [/^\/profile\/[^/]+/, 'Profile'],
  [/^\/profile/, 'Your profile'],
  [/^\/settings/, 'Settings'],
  [/^\/notifications/, 'Notifications'],
]

/** Label for a signed-in path; `name` (e.g. a member's) wins for /profile/:id. */
export function pageLabel(pathname: string, name?: string): string {
  if (name && /^\/profile\/[^/]+/.test(pathname)) return name
  return LABELS.find(([re]) => re.test(pathname))?.[1] ?? 'Root Connect'
}

/** Full tab title, e.g. "(3) Jobs & referrals · Root Connect". */
export function documentTitle(label: string, unread = 0): string {
  const base = label === 'Root Connect' ? 'Root Connect' : `${label} · Root Connect`
  return unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${base}` : base
}
