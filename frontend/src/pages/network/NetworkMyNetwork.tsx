import { useOutletContext } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { useLayout } from '../../components/layout/LayoutContext'
import { Avatar, Button, Card, SectionTitle } from '../../components/ui'
import { roleLine } from '../../lib/format'
import type { NetworkOutletContext } from './NetworkLayout'
import { EmptyState } from '../../components/ui/EmptyState'
import { Users } from 'lucide-react'

export function NetworkMyNetwork() {
  const { users, connectionIds } = useApp()
  const { openChatWith } = useLayout()
  const { openQuickView } = useOutletContext<NetworkOutletContext>()
  const get = (id: string) => users.find((u) => u.id === id)!
  const connections = connectionIds.map(get).filter(Boolean)

  return (
    <section>
      <SectionTitle>Your Connections ({connections.length})</SectionTitle>
      {connections.length === 0 && (
        <EmptyState
          icon={<Users size={28} />}
          title="Your network starts here"
          body="Connect with batchmates, mentors and people at companies you like."
          action={{ label: 'Find people', to: '/network/matches' }}
        />
      )}
      <div className="flex flex-col gap-3">
        {connections.map((u) => (
          <Card key={u.id} className="flex items-center gap-3 p-4">
            <button onClick={() => openQuickView(u.id)}>
              <Avatar name={u.name} src={u.photo} size={48} />
            </button>
            <div className="min-w-0 flex-1">
              <button
                onClick={() => openQuickView(u.id)}
                className="font-semibold text-ink hover:underline"
              >
                {u.name}
              </button>
              {roleLine(u) && <p className="truncate text-xs text-muted">{roleLine(u)}</p>}
            </div>
            <Button variant="subtle" className="!px-3 !py-1.5 text-xs" onClick={() => openChatWith(u.id)}>
              <MessageSquare size={15} /> Message
            </Button>
          </Card>
        ))}
      </div>
    </section>
  )
}
