import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, GraduationCap, Sparkles, Users, Wrench } from 'lucide-react'
import { Avatar, AvatarStack, Button, Card } from '../ui'
import { AlumniListModal } from './AlumniListModal'
import type { AlumniHelper } from '../../types'

/** "People from Rooman who can help you" — the alumni the roadmap itself
 *  surfaced, each carrying the stage that made them relevant. The cards are
 *  a preview; the avatar stack and "View all" open the full scrollable list,
 *  where the action offered depends on whether you're already connected. */
export function AlumniHelpSection({
  people,
  onBook,
}: {
  people: AlumniHelper[]
  onBook: (person: AlumniHelper) => void
}) {
  const [listOpen, setListOpen] = useState(false)

  return (
    <Card id="career-alumni-help" className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand">
            <Users size={20} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-ink">People from Rooman who can help you</h2>
            <p className="text-sm text-muted">
              Alumni and mentors with experience relevant to your roadmap.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {people.length > 0 && (
            <button
              onClick={() => setListOpen(true)}
              className="hidden items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1 transition-colors hover:bg-gray-50 sm:flex"
              title="See everyone who can help"
            >
              <AvatarStack people={people.map((p) => ({ id: p.id, name: p.name, photo: p.photo }))} size={24} max={4} />
              <span className="text-xs font-semibold text-ink">{people.length}</span>
            </button>
          )}
          <button
            onClick={() => setListOpen(true)}
            className="flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
          >
            View all <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {listOpen && (
        <AlumniListModal people={people} onClose={() => setListOpen(false)} onBook={onBook} />
      )}

      {people.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-muted">
          No alumni matched to your roadmap yet — as more members fill in their skills and career
          history, relevant people will appear here.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {people.map((p) => (
            <PersonCard key={p.id} person={p} onBook={onBook} />
          ))}
        </div>
      )}
    </Card>
  )
}

function PersonCard({ person, onBook }: { person: AlumniHelper; onBook: (p: AlumniHelper) => void }) {
  return (
    <div className="flex flex-col rounded-xl border border-line p-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={person.name} src={person.photo} size={40} to={`/profile/${person.id}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              to={`/profile/${person.id}`}
              className="truncate text-sm font-bold text-ink hover:underline"
            >
              {person.name}
            </Link>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                person.isMentor ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}
            >
              {person.isMentor ? 'Mentor' : 'Alumni'}
            </span>
          </div>
          <p className="truncate text-xs text-muted">
            {[person.designation, person.company].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      {person.expertise.length > 0 && (
        <p className="mt-2.5 flex items-start gap-1.5 text-xs text-muted">
          <Wrench size={12} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{person.expertise.join(', ')}</span>
        </p>
      )}

      <span
        className={`mt-2.5 flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          person.similarPath ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-muted'
        }`}
        title={person.reason ? `Relevant to: ${person.reason}` : undefined}
      >
        {person.similarPath ? <Sparkles size={11} /> : <GraduationCap size={11} />}
        {person.similarPath ? 'Similar career path' : person.reason || 'Relevant experience'}
      </span>

      <div className="mt-3 flex gap-2">
        <Link to={`/profile/${person.id}`} className="flex-1">
          <Button variant="outline" className="w-full !px-2 !text-xs">
            View profile
          </Button>
        </Link>
        <Button className="flex-1 !px-2 !text-xs" onClick={() => onBook(person)}>
          {person.isMentor ? 'Book session' : 'Get guidance'}
        </Button>
      </div>
    </div>
  )
}
