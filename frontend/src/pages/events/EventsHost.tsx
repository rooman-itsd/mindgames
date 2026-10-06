import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { Button, Card } from '../../components/ui'

export function EventsHost() {
  const { createEvent, notify, currentUser } = useApp()
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', date: '', time: '', location: '', meetingLink: '', description: '' })
  const [isPaid, setIsPaid] = useState(false)
  const [price, setPrice] = useState('')
  const [hasCapacity, setHasCapacity] = useState(false)
  const [capacity, setCapacity] = useState('')
  const [speakers, setSpeakers] = useState<{ name: string; bio: string }[]>([])
  const [saving, setSaving] = useState(false)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const priceValue = Math.max(0, Math.round(Number(price) || 0))
  const capacityValue = Math.round(Number(capacity) || 0)
  const canSubmit =
    form.title.trim() && form.date && form.time && (!isPaid || priceValue > 0) && (!hasCapacity || capacityValue > 0)
  const field = 'w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand'

  function addSpeaker() {
    setSpeakers((s) => [...s, { name: '', bio: '' }])
  }
  function updateSpeaker(i: number, patch: Partial<{ name: string; bio: string }>) {
    setSpeakers((s) => s.map((sp, idx) => (idx === i ? { ...sp, ...patch } : sp)))
  }
  function removeSpeaker(i: number) {
    setSpeakers((s) => s.filter((_, idx) => idx !== i))
  }

  async function submit() {
    if (!canSubmit) return
    setSaving(true)
    try {
      await createEvent({
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        meetingLink: form.meetingLink.trim() || undefined,
        startsAt: new Date(`${form.date}T${form.time}`).toISOString(),
        isPaid,
        price: isPaid ? priceValue : 0,
        capacity: hasCapacity ? Math.max(1, capacityValue) : undefined,
        speakers: speakers.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), bio: s.bio.trim() })),
      })
      navigate('../upcoming')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not create the event.', 'error')
      setSaving(false)
    }
  }

  return (
    <Card className="max-w-xl p-5">
      <div className="mb-4 flex items-center gap-2">
        <CalendarPlus size={18} className="text-brand" />
        <h2 className="font-bold text-ink">Host an event</h2>
      </div>

      <div className="space-y-3">
        <input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Event title — e.g. Bengaluru Alumni Meetup"
          className={field}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Date</label>
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Time</label>
            <input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} className={field} />
          </div>
        </div>
        <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Venue — or 'Online'" className={field} />
        <input
          value={form.meetingLink}
          onChange={(e) => set('meetingLink', e.target.value)}
          placeholder="Meeting link (optional, for online events)"
          className={field}
        />

        {/* Ticketing */}
        <div className="rounded-lg border border-line p-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} />
            <span className="text-sm font-medium text-ink">This is a paid event</span>
          </label>
          {isPaid && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted">Ticket price (₹ per attendee)</label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-muted">₹</span>
                <input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 500" className={field} />
              </div>
              <p className="mt-1 text-xs text-muted">Attendees pay offline / at the venue — RSVP just records who's coming.</p>
            </div>
          )}
        </div>

        {/* Capacity */}
        <div className="rounded-lg border border-line p-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand"
              checked={hasCapacity}
              onChange={(e) => setHasCapacity(e.target.checked)}
            />
            <span className="text-sm font-medium text-ink">Limit capacity</span>
          </label>
          {hasCapacity && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-muted">Max confirmed attendees</label>
              <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 50" className={field} />
              <p className="mt-1 text-xs text-muted">RSVPs beyond this number join a waitlist and are auto-confirmed as spots free up.</p>
            </div>
          )}
        </div>

        {/* Speakers */}
        <div className="rounded-lg border border-line p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Speakers (optional)</span>
            <button
              type="button"
              onClick={addSpeaker}
              className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              <Plus size={13} /> Add speaker
            </button>
          </div>
          {speakers.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {speakers.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <input
                      value={s.name}
                      onChange={(e) => updateSpeaker(i, { name: e.target.value })}
                      placeholder="Speaker name"
                      className={field}
                    />
                    <input
                      value={s.bio}
                      onChange={(e) => updateSpeaker(i, { bio: e.target.value })}
                      placeholder="Short bio (optional)"
                      className={field}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSpeaker(i)}
                    className="self-start rounded-full p-2 text-muted hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          placeholder="What's the agenda?"
          className={`${field} resize-none`}
        />
        <p className="text-xs text-muted">
          {currentUser.isAdmin
            ? 'Everyone on the network gets a notification, and the event appears on the Upcoming tab and the sidebar.'
            : 'Your event is sent to an admin for approval. Once approved, the whole network is notified.'}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-4">
        <Button disabled={!canSubmit || saving} onClick={submit}>
          {saving ? 'Creating…' : 'Create event'}
        </Button>
      </div>
    </Card>
  )
}
