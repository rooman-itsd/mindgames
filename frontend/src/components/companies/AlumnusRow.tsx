import { Link } from 'react-router-dom'
import { Briefcase, Handshake, MapPin, UserPlus } from 'lucide-react'
import { Avatar, Button, cx } from '../ui'
import type { CompanyAlumnus } from '../../types'

// One person in the "Rooman alumni at …" list.
//
// A row rather than a card. The card version stacked an avatar, role, location,
// a two-line bio and two full-width buttons inside a bordered box, so six
// people filled a screen and a half — and merging the duplicate company entries
// made every list longer, not shorter.
//
// Nothing is dropped in the move: name, role, location, what they wrote about
// their time there, mutual connections, Connect and Reach Out are all still
// here. They are laid out across the row instead of down a box, and the bio is
// clamped to one line instead of two.
export function AlumnusRow({
  alum,
  onConnect,
  onReachOut,
  last,
}: {
  alum: CompanyAlumnus
  onConnect: () => void
  onReachOut: () => void
  /** The final row drops its separator so the list does not end in a line. */
  last?: boolean
}) {
  return (
    <div
      className={cx(
        'flex items-start gap-3 py-3',
        !last && 'border-b border-line',
      )}
    >
      <Avatar name={alum.name} src={alum.photo} size={40} to={`/profile/${alum.id}`} />

      <div className="min-w-0 flex-1">
        <Link
          to={`/profile/${alum.id}`}
          className="font-bold text-ink hover:text-brand hover:underline"
        >
          {alum.name}
        </Link>

        {/* Role and location share one line — they never needed two. */}
        {(alum.role || alum.location) && (
          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
            {alum.role && (
              <span className="flex items-center gap-1">
                <Briefcase size={11} /> {alum.role}
              </span>
            )}
            {alum.location && (
              <span className="flex items-center gap-1">
                <MapPin size={11} /> {alum.location}
              </span>
            )}
          </p>
        )}

        {alum.journey && (
          <p className="mt-1 line-clamp-1 text-xs text-muted">{alum.journey}</p>
        )}

        {alum.mutualConnections > 0 && (
          <p className="mt-1 text-xs font-semibold text-brand">
            {alum.mutualConnections} mutual connection{alum.mutualConnections > 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Actions sit beside the person rather than under them, which is what
          made the card tall. They wrap below on a narrow screen. */}
      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
        <Button
          variant="subtle"
          className="!px-2.5 !py-1 text-xs"
          icon={<UserPlus size={12} />}
          onClick={onConnect}
        >
          Connect
        </Button>
        <Button
          variant="primary"
          className="!px-2.5 !py-1 text-xs"
          icon={<Handshake size={12} />}
          onClick={onReachOut}
        >
          Reach Out
        </Button>
      </div>
    </div>
  )
}
