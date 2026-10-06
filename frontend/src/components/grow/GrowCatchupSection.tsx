import { useState, useMemo } from 'react'
import { TrendingUp, Zap } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { Card, Button } from '../ui'
import { roleLine } from '../../lib/format'
import type { User } from '../../types'
import { EmptyState } from '../ui/EmptyState'
import { PartyPopper } from 'lucide-react'

type Tab = 'whatsnew' | 'catchup'

interface ActivityItem {
  user: User
  type: 'new-mentor' | 'hiring' | 'recent-achievement' | 'birthday' | 'work-anniversary' | 'haven-seen'
  description: string
  action: string
  icon: string
}

export function GrowCatchupSection() {
  const { users, currentUser, connectionIds } = useApp()
  const [activeTab, setActiveTab] = useState<Tab>('whatsnew')

  // Activity items for WHAT'S NEW tab
  const whatsNewItems = useMemo(() => {
    const items: ActivityItem[] = []

    users.forEach((user) => {
      if (user.id === currentUser.id) return
      if (!connectionIds.includes(user.id)) return // Only show connected users

      // New mentors in your domain
      if (user.willingToMentor && user.domain === currentUser.domain) {
        items.push({
          user,
          type: 'new-mentor',
          description: `Now offering mentorship in ${user.domain}`,
          action: 'Book Session',
          icon: '🎓',
        })
      }

      // People willing to give referrals (hiring)
      if (user.profileTags?.includes('Willing to give referral') || user.profileTags?.includes('Hiring')) {
        items.push({
          user,
          type: 'hiring',
          description: 'Open for referrals · Can help with opportunities',
          action: 'Request Referral',
          icon: '🤝',
        })
      }
    })

    return items.slice(0, 5)
  }, [users, currentUser.id, currentUser.domain, connectionIds])

  // Activity items for CATCH UP tab
  const catchupItems = useMemo(() => {
    const items: ActivityItem[] = []
    const today = new Date()
    const month = today.getMonth()
    const day = today.getDate()

    users.forEach((user) => {
      if (user.id === currentUser.id) return
      if (!connectionIds.includes(user.id)) return // Only show connected users

      // Birthdays (next 30 days)
      const userBirthMonth = new Date(user.batchYear, month).getMonth()
      const userBirthDay = Math.floor(Math.random() * 28) + 1 // Mock birthday
      const daysUntilBirthday = calculateDaysUntilDate(month, day, userBirthMonth, userBirthDay)

      if (daysUntilBirthday >= 0 && daysUntilBirthday <= 30) {
        items.push({
          user,
          type: 'birthday',
          description: daysUntilBirthday === 0 ? 'Birthday today! 🎉' : `Birthday in ${daysUntilBirthday} days`,
          action: 'Send Wishes',
          icon: '🎂',
        })
      }

      // Work anniversaries (milestone years)
      const yearsWorked = new Date().getFullYear() - user.batchYear
      if ([5, 10, 15, 20].includes(yearsWorked)) {
        items.push({
          user,
          type: 'work-anniversary',
          description: `${yearsWorked} years in the industry! 🎊`,
          action: 'Congratulate',
          icon: '⭐',
        })
      }
    })

    return items.slice(0, 5)
  }, [users, currentUser.id, currentUser.domain, currentUser.city, connectionIds, currentUser.experienceYears, currentUser.batchYear])

  const displayItems = activeTab === 'whatsnew' ? whatsNewItems : catchupItems

  if (displayItems.length === 0) {
    return (
      <EmptyState
        icon={<PartyPopper size={28} />}
        title="You're all caught up 🎉"
        body="New posts and wins from your network will show up here."
        action={{ label: 'Explore communities', to: '/explore' }}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 rounded-lg border border-line bg-surface p-2">
        <button
          onClick={() => setActiveTab('whatsnew')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === 'whatsnew'
              ? 'bg-brand text-white'
              : 'text-muted hover:text-ink'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <TrendingUp size={16} />
            What's New
          </span>
        </button>
        <button
          onClick={() => setActiveTab('catchup')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === 'catchup'
              ? 'bg-brand text-white'
              : 'text-muted hover:text-ink'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Zap size={16} />
            Catch Up
          </span>
        </button>
      </div>

      {/* Activity Cards */}
      <div className="space-y-3">
        {displayItems.map((item) => (
          <Card key={`${item.user.id}-${item.type}`} className="p-4">
            <div className="flex gap-3">
              <div className="text-2xl">{item.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-ink">{item.user.name}</h3>
                    <p className="text-xs text-muted mt-0.5">{roleLine(item.user)}</p>
                    <p className="text-xs text-ink font-medium mt-1">{item.description}</p>
                  </div>
                  <Button variant="outline" className="!px-3 !py-1 text-xs">
                    {item.action}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Sync Contacts CTA */}
      <Card className="border-2 border-dashed border-brand/30 bg-brand-50 p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">📱</div>
          <div className="flex-1">
            <h4 className="font-semibold text-ink">Find More Connections</h4>
            <p className="text-xs text-muted mt-1">
              Add your phone number to match with people from your contacts.
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}

// Helper: Calculate days until a specific month/day
function calculateDaysUntilDate(
  _currentMonth: number,
  _currentDay: number,
  targetMonth: number,
  targetDay: number
): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const currentYear = today.getFullYear()
  let targetDate = new Date(currentYear, targetMonth, targetDay)
  targetDate.setHours(0, 0, 0, 0)

  if (targetDate < today) {
    targetDate = new Date(currentYear + 1, targetMonth, targetDay)
  }

  const diff = targetDate.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
