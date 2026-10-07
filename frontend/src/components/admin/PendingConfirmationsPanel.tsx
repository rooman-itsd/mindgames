import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, BellRing } from 'lucide-react'
import { api } from '../../lib/api'
import { canRemind, daysWaiting, REMIND_EVERY_HOURS } from '../../lib/confirmations'
import { timeAgo } from '../../lib/format'
import { useApp } from '../../store/AppStore'
import { Avatar, Button, Card } from '../ui'
import type { PendingConfirmation } from '../../types'

/**
 * Sessions the mentor completed that the mentee never confirmed. Until they
 * do, the session counts toward nobody's hours, streaks or badges — so this
 * is where an admin spots the stuck ones and nudges the mentee.
 */
export function PendingConfirmationsPanel() {
  const { notify } = useApp()
  const [rows, setRows] = useState<PendingConfirmation[]>([])
  const [loading, setLoading] = useState(true)
  const [reminding, setReminding] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await api.getPendingConfirmations())
    } catch {
      notify('Could not load sessions awaiting confirmation.', 'error')
    }
    setLoading(false)
  }, [notify])

  useEffect(() => {
    void load()
  }, [load])

  async function remind(r: PendingConfirmation) {
    setReminding(r.id)
    try {
      const { remindedAt } = await api.remindConfirmation(r.id)
      setRows((list) => list.map((x) => (x.id === r.id ? { ...x, remindedAt } : x)))
      notify(`Reminder sent to ${r.menteeName}.`, 'success')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not send the reminder.', 'error')
      void load()
    }
    setReminding(null)
  }

  const now = Date.now()

  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-ink">Sessions Awaiting Confirmation ({rows.length})</h2>
      <p className="mt-1 text-sm text-muted">
        The mentor marked these completed, but the mentee hasn't confirmed they happened. Until they
        do, the session counts toward nobody's hours or badges.
      </p>

      {!loading && rows.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="shrink-0" />
          {rows.length} session{rows.length === 1 ? ' is' : 's are'} missing from members' records. A
          reminder can go out once every {REMIND_EVERY_HOURS} hours per session.
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing waiting — every completed session is confirmed.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((r) => {
            const days = daysWaiting(r.completedAt, now)
            const allowed = canRemind(r.remindedAt, now)
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3">
                <Avatar name={r.menteeName} size={38} to={`/profile/${r.menteeId}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{r.topic}</p>
                  <p className="truncate text-xs text-muted">
                    {r.mentorName} → {r.menteeName} · {r.date}
                  </p>
                </div>
                {days !== null && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      days >= 7 ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-muted'
                    }`}
                  >
                    {days === 0 ? 'Completed today' : `Waiting ${days}d`}
                  </span>
                )}
                <span className="shrink-0 text-xs text-muted">
                  {r.remindedAt ? `Reminded ${timeAgo(r.remindedAt)}` : 'Not reminded yet'}
                </span>
                <Button
                  variant="outline"
                  className="!px-3 !py-1.5 !text-xs"
                  icon={<BellRing size={12} />}
                  loading={reminding === r.id}
                  disabled={!allowed}
                  title={allowed ? `Notify ${r.menteeName} to confirm` : `Already reminded in the last ${REMIND_EVERY_HOURS} hours`}
                  onClick={() => void remind(r)}
                >
                  Remind
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
