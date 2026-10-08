import { useNavigate } from 'react-router-dom'
import { Briefcase, GraduationCap, Hand, Image as ImageIcon, Trophy } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { useLayout } from '../layout/LayoutContext'
import { timeGreeting } from '../../lib/homeGreeting'
import { Avatar, Card } from '../ui'

/**
 * Home's "write a post" row (Spotlight theme): avatar, a greeting prompt with a
 * blinking caret, icon shortcuts and a Post button, all in one line so the
 * Spotlight card below gets the room. It used to be a grey rounded pill — the
 * same shape as the navbar search — so Home read as two search bars.
 *
 * The greeting lives here now (it replaced the separate HomeGreeting card), so
 * the member's name appears once. Every control opens the existing composer;
 * Achievement isn't one of the composer's types (it's a News & Updates format),
 * so the trophy goes to the News tab, whose composer starts on Achievement.
 */
export function CreatePostBox() {
  const { currentUser } = useApp()
  const { openComposer } = useLayout()
  const navigate = useNavigate()
  const firstName = currentUser.name.split(' ')[0] || 'there'

  return (
    <Card className="flex items-center gap-2.5 py-2.5 pr-2.5 pl-3">
      <Avatar name={currentUser.name} src={currentUser.photo} size={40} />
      <button
        type="button"
        onClick={() => openComposer()}
        className="min-w-0 flex-1 truncate py-1.5 text-left font-display text-[17px] font-bold text-muted transition-colors hover:text-ink"
      >
        <span aria-hidden className="composer-caret" />
        {/* Phones get the short prompt: next to the avatar, Post and the trophy there's
            room for ~165px, so even "What's new, <name>?" would clip on longer names. */}
        <span className="sm:hidden">What's new?</span>
        <span className="hidden sm:inline">
          {timeGreeting(new Date().getHours())}, {firstName}. What's new?
        </span>
      </button>
      {/* One evenly spaced group of shortcuts. On phones only the trophy stays
          (the prompt still opens the full composer with every type). */}
      <div className="flex items-center gap-0.5">
        <span className="hidden items-center gap-0.5 sm:flex">
          <Tool label="Add a photo" onClick={() => openComposer()}>
            <ImageIcon size={18} />
          </Tool>
          <Tool label="Post a job" onClick={() => openComposer({ type: 'Hiring' })}>
            <Briefcase size={18} />
          </Tool>
          <Tool label="Open to work" onClick={() => openComposer({ type: 'Open to Work' })}>
            <Hand size={18} />
          </Tool>
          <Tool label="Mentorship" onClick={() => openComposer({ type: 'Mentorship' })}>
            <GraduationCap size={18} />
          </Tool>
        </span>
        <Tool label="Share a win" onClick={() => navigate('/news', { state: { compose: true } })}>
          <Trophy size={18} />
        </Tool>
      </div>
      <button type="button" onClick={() => openComposer()} className="btn-primary shrink-0 rounded-full px-4 py-2 text-sm font-bold">
        Post
      </button>
    </Card>
  )
}

/** Icon-only shortcut: the name is the accessible label and the hover tooltip. */
function Tool({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-brand transition-colors hover:bg-brand-50"
    >
      {children}
    </button>
  )
}
