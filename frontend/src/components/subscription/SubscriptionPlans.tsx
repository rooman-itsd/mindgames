import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Crown, ShieldCheck, Sparkles, X } from 'lucide-react'
import { Button } from '../ui'
import { api } from '../../lib/api'
import { useApp } from '../../store/AppStore'
import type { Plan, PlanId, SubscriptionState } from '../../types'
import { SkeletonCards } from '../ui/Skeleton'

/**
 * The paywall. Opened when the backend answers 402 — accepting a session or
 * charging for an event — and from the crown in the navbar.
 *
 * The checkout it runs is real: it asks the server for a signed reference and
 * confirms it on the same route a gateway will use. Only the money is absent,
 * and `simulated` is surfaced rather than hidden, so nothing here can be
 * mistaken for a real charge.
 */
export function SubscriptionPlans({
  reason,
  onClose,
  onActivated,
}: {
  /** Why the paywall opened, shown at the top. Absent when opened from the crown. */
  reason?: string
  onClose: () => void
  onActivated?: (s: SubscriptionState) => void
}) {
  const { notify } = useApp()
  const [plans, setPlans] = useState<Plan[]>([])
  const [live, setLive] = useState(true)
  const [current, setCurrent] = useState<SubscriptionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<PlanId | null>(null)
  const [months, setMonths] = useState(1)

  useEffect(() => {
    Promise.all([api.getPlans(), api.getMySubscription()])
      .then(([p, s]) => {
        setPlans(p.plans)
        setLive(p.payments.live)
        setCurrent(s)
      })
      .catch(() => notify('Could not load the plans.', 'error'))
      .finally(() => setLoading(false))
  }, [notify])

  async function choose(plan: PlanId) {
    if (plan === 'free') return
    setBusy(plan)
    try {
      const session = await api.startCheckout(plan, months)
      // A real gateway would take over here. The stub hands back a signed
      // reference we confirm immediately, which exercises the same
      // verification path the live callback will use.
      const state = await api.confirmCheckout(session.reference, session.clientPayload?.signature)
      setCurrent(state)
      onActivated?.(state)
      notify(
        session.simulated
          ? `${plan} plan activated (simulated — no payment was taken).`
          : `Your ${plan} plan is active.`,
        'success',
      )
      onClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Checkout failed.', 'error')
    } finally {
      setBusy(null)
    }
  }

  // Portalled to <body>. Opened from the navbar, this rendered inside
  // <header>, which is fixed with z-40 and therefore its own stacking
  // context — so z-50 here was trapped under it and the left sidebar (also
  // z-40, later in the DOM) painted straight over the pricing table.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 py-8" onClick={onClose}>
      <div
        className="w-full max-w-5xl overflow-hidden rounded-2xl bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dark header, gold accent — the "upgrade" moment reads differently
            from the rest of the app on purpose. */}
        <div className="relative bg-gradient-to-br from-ink via-night to-brand-900 px-6 py-8 text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X size={20} />
          </button>

          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#ffd700] to-[#ff9500] text-on-gold shadow-lg">
            <Crown size={24} />
          </span>
          <h2 className="text-2xl font-bold text-white">Mentor plans</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-white/70">
            Accepting mentorship sessions and charging for events needs an active plan.
            Free community events and your profile stay free, always.
          </p>

          {reason && (
            <p className="mx-auto mt-4 w-fit rounded-full border border-[#ffd700]/30 bg-[#ffd700]/10 px-4 py-1.5 text-sm font-medium text-[#ffd700]">
              {reason}
            </p>
          )}

          {/* Billing period — the only toggle, kept simple. */}
          <div className="mt-5 inline-flex rounded-full bg-white/10 p-1">
            {[1, 3, 12].map((m) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  months === m ? 'bg-surface text-ink' : 'text-white/70 hover:text-white'
                }`}
              >
                {m === 1 ? 'Monthly' : m === 3 ? '3 months' : '1 year'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <SkeletonCards count={3} className="p-6" />
        ) : (
          <>
            <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
              {plans.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  months={months}
                  // planActive, so a mentor who cancelled but still has paid
                  // days sees the plan they are actually on marked as current.
                  isCurrent={current?.plan === p.id && (current?.planActive ?? false)}
                  busy={busy === p.id}
                  disabled={busy !== null}
                  onChoose={() => choose(p.id)}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 border-t border-line bg-gray-50 px-6 py-4 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-green-600" />
                Cancel any time — access runs to the end of the period
              </span>
              {!live && (
                <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700">
                  <Sparkles size={13} />
                  Payments are simulated — no card is charged
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function PlanCard({
  plan,
  months,
  isCurrent,
  busy,
  disabled,
  onChoose,
}: {
  plan: Plan
  months: number
  isCurrent: boolean
  busy: boolean
  disabled: boolean
  onChoose: () => void
}) {
  const total = plan.price * months
  const free = plan.price === 0

  return (
    <div
      className={`relative flex flex-col rounded-xl border p-5 transition-shadow ${
        plan.highlighted
          ? 'border-brand bg-brand-50 shadow-md ring-1 ring-brand/20'
          : 'border-line bg-surface hover:shadow-sm'
      }`}
    >
      {plan.highlighted && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-hover to-brand px-3 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
          Best value
        </span>
      )}

      <p className={`text-xs font-bold tracking-widest uppercase ${plan.highlighted ? 'text-brand' : 'text-muted'}`}>
        {plan.name}
      </p>

      <p className="mt-2 flex items-baseline gap-1">
        <span className="text-lg font-bold text-ink">₹</span>
        <span className="text-3xl font-bold text-ink">{free ? 0 : total.toLocaleString('en-IN')}</span>
      </p>
      <p className="text-xs text-muted">
        {free ? 'always free' : months === 1 ? 'per month' : `for ${months} months`}
      </p>

      <p className="mt-2 min-h-[32px] text-xs text-muted">{plan.tagline}</p>

      <ul className="mt-4 mb-5 flex flex-1 flex-col gap-2">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-ink">
            <Check size={13} className={`mt-0.5 shrink-0 ${plan.highlighted ? 'text-brand' : 'text-green-600'}`} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <span className="rounded-full border border-line bg-gray-50 py-2 text-center text-sm font-semibold text-muted">
          Current plan
        </span>
      ) : free ? (
        <span className="rounded-full border border-line py-2 text-center text-sm font-semibold text-muted">
          Included
        </span>
      ) : (
        <Button
          variant={plan.highlighted ? 'primary' : 'outline'}
          className="w-full"
          loading={busy}
          disabled={disabled && !busy}
          onClick={onChoose}
        >
          Choose {plan.name}
        </Button>
      )}
    </div>
  )
}
