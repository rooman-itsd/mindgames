import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CalendarClock, Check, Crown, Gauge, X } from 'lucide-react'
import { Button } from '../ui'
import { api } from '../../lib/api'
import { useApp } from '../../store/AppStore'
import { SubscriptionPlans } from './SubscriptionPlans'
import type { SubscriptionState } from '../../types'
import { SkeletonRows } from '../ui/Skeleton'

/**
 * What the crown opens.
 *
 * Someone with a plan sees what they have, what it allows and when it ends.
 * Someone without goes straight to the plans, because for them the crown is
 * a call to action rather than a status display. A member who is not a
 * mentor at all is told why this does not apply to them instead of being
 * shown a price list they cannot use.
 */
export function SubscriptionPanel({ onClose }: { onClose: () => void }) {
  const { currentUser, notify, refreshSubscription } = useApp()
  const [sub, setSub] = useState<SubscriptionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPlans, setShowPlans] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    api
      .getMySubscription()
      .then(setSub)
      .catch(() => notify('Could not load your plan.', 'error'))
      .finally(() => setLoading(false))
  }, [notify])

  async function cancel() {
    if (!window.confirm('Cancel your plan? You keep access until the current period ends.')) return
    setCancelling(true)
    try {
      setSub(await api.cancelSubscription())
      await refreshSubscription()
      notify('Plan cancelled. Access continues until the period ends.', 'info')
    } catch {
      notify('Could not cancel the plan.', 'error')
    } finally {
      setCancelling(false)
    }
  }

  if (showPlans) {
    return (
      <SubscriptionPlans
        onClose={onClose}
        onActivated={async (s) => {
          setSub(s)
          await refreshSubscription()
        }}
      />
    )
  }

  // planActive, not status === 'active': a member who cancelled but is still
  // inside the period they paid for does still have the plan, and the panel
  // was contradicting itself — header "No active plan" directly above a Facts
  // row reading "Accept sessions: Allowed".
  const active = sub?.planActive
  const expires = sub?.expiresAt ? new Date(sub.expiresAt) : null
  const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86_400_000) : null

  // Portalled for the same reason as SubscriptionPlans: opened from the
  // navbar it would otherwise render inside the fixed z-40 <header> and be
  // painted over by the sidebar.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 py-16" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div
          className={`relative px-6 py-6 text-center ${
            active
              ? 'bg-gradient-to-br from-ink via-night to-brand-900'
              : 'bg-gradient-to-br from-ink to-gray-800'
          }`}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <span
            className={`mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full ${
              active ? 'bg-gradient-to-br from-[#ffd700] to-[#ff9500] text-on-gold' : 'bg-white/10 text-white/70'
            }`}
          >
            <Crown size={22} />
          </span>
          <h2 className="text-lg font-bold text-white">
            {active ? `${sub!.plan[0].toUpperCase()}${sub!.plan.slice(1)} plan` : 'No active plan'}
          </h2>
          {active && daysLeft !== null && (
            <p className="mt-0.5 text-sm text-white/70">
              {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining` : 'Ends today'}
            </p>
          )}
        </div>

        {loading ? (
          <SkeletonRows count={3} className="px-6 py-8" />
        ) : !currentUser.isMentor ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm font-semibold text-ink">Plans are for mentors</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
              You only need a plan to accept mentorship sessions or charge for events. Taking
              sessions, chatting and your career roadmap are all free.
            </p>
            <Button variant="outline" className="mt-4" onClick={onClose}>
              Got it
            </Button>
          </div>
        ) : (
          <div className="px-6 py-5">
            {sub?.blockedReason && (
              <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                {sub.blockedReason}
              </p>
            )}

            <div className="flex flex-col gap-2.5">
              <Fact
                icon={<Check size={15} />}
                label="Accept sessions"
                value={sub?.canAcceptSessions ? 'Allowed' : 'Blocked'}
                good={!!sub?.canAcceptSessions}
              />
              <Fact
                icon={<Gauge size={15} />}
                label="Sessions this month"
                // A cap of 0 is the Free plan, where accepting isn't included
                // at all — "1 of 0" was both nonsense and alarming.
                value={
                  sub?.sessionsPerMonth === 0
                    ? `${sub?.sessionsThisMonth ?? 0} · not included`
                    : sub?.sessionsPerMonth == null
                      ? `${sub?.sessionsThisMonth ?? 0} · unlimited`
                      : `${sub?.sessionsThisMonth ?? 0} of ${sub.sessionsPerMonth}`
                }
              />
              {expires && (
                <Fact
                  icon={<CalendarClock size={15} />}
                  label={active ? 'Renews on' : 'Ended on'}
                  value={expires.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                />
              )}
              {sub?.source === 'grandfathered' && (
                <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  You were an approved mentor before plans existed, so this period is on us.
                </p>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <Button className="flex-1" icon={<Crown size={14} />} onClick={() => setShowPlans(true)}>
                {active ? 'Change plan' : 'Choose a plan'}
              </Button>
              {active && sub?.source !== 'grandfathered' && (
                <Button variant="ghost" loading={cancelling} onClick={cancel}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Fact({
  icon,
  label,
  value,
  good,
}: {
  icon: React.ReactNode
  label: string
  value: string
  good?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm text-muted">
        <span className="text-muted">{icon}</span>
        {label}
      </span>
      <span
        className={`text-sm font-bold ${
          good === undefined ? 'text-ink' : good ? 'text-green-600' : 'text-brand'
        }`}
      >
        {value}
      </span>
    </div>
  )
}
