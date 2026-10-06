/**
 * The app's sections, shared by the desktop sidebar (LeftSidebar) and the
 * phone tab bar (MobileTabBar) so the two can never list different pages.
 */
import {
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Compass,
  GraduationCap,
  Home,
  Newspaper,
  Rocket,
  Route,
  Users,
} from 'lucide-react'

/**
 * Each section owns a hue, so the app reads as a grove rather than one green:
 * `icon` colours the icon at rest; `pill` is the selected row's springy
 * highlight (tint + edge) and `text` its label colour. All are sibling hues
 * from the Emerald Grove family in index.css; every text pairing >= 5.04:1.
 * Class names are written out in full because Tailwind only generates classes
 * it can find verbatim in the source; a template like `text-${hue}-700` would
 * ship with no styles.
 */
export const NAV = [
  { to: '/home', label: 'Home', icon: Home,
    tone: { icon: 'text-brand', pill: 'border-brand bg-brand-50', text: 'text-brand' } },
  { to: '/network', label: 'My Network', icon: Users,
    tone: { icon: 'text-lagoon-600', pill: 'border-lagoon-600 bg-lagoon-50', text: 'text-lagoon-700' } },
  { to: '/events', label: 'Events', icon: Calendar,
    tone: { icon: 'text-clay-600', pill: 'border-clay-600 bg-clay-50', text: 'text-clay-700' } },
  { to: '/jobs', label: 'Jobs & Opportunities', icon: Briefcase,
    tone: { icon: 'text-iris-600', pill: 'border-iris-600 bg-iris-50', text: 'text-iris-700' } },
  { to: '/companies', label: 'Companies', icon: Building2,
    tone: { icon: 'text-ocean-600', pill: 'border-ocean-600 bg-ocean-50', text: 'text-ocean-700' } },
  { to: '/mentorship', label: 'Mentorship', icon: GraduationCap,
    tone: { icon: 'text-saffron-600', pill: 'border-saffron-600 bg-saffron-50', text: 'text-saffron-700' } },
  { to: '/startupvarsity', label: 'StartupVarsity', icon: Rocket,
    tone: { icon: 'text-amethyst-600', pill: 'border-amethyst-600 bg-amethyst-50', text: 'text-amethyst-700' } },
  { to: '/news', label: 'News & Updates', icon: Newspaper,
    tone: { icon: 'text-rosewood-600', pill: 'border-rosewood-600 bg-rosewood-50', text: 'text-rosewood-700' } },
  { to: '/learning-resources', label: 'Learning Resources', icon: BookOpen,
    tone: { icon: 'text-jade-600', pill: 'border-jade-600 bg-jade-50', text: 'text-jade-700' } },
  { to: '/career-guidance', label: 'Career Guidance', icon: Route,
    tone: { icon: 'text-plum-600', pill: 'border-plum-600 bg-plum-50', text: 'text-plum-700' } },
  // Explore and "Start a Community" are one entry: the Explore page already
  // has its own Start a Community button, so a separate sidebar item was a
  // second door to the same room.
  { to: '/explore', label: 'Explore Communities', icon: Compass,
    tone: { icon: 'text-lagoon-600', pill: 'border-lagoon-600 bg-lagoon-50', text: 'text-lagoon-700' } },
]

export type NavItem = (typeof NAV)[number]
