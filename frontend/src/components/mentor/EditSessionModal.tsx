import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, X } from 'lucide-react'
import { Button } from '../ui'
import type { MentorshipSession } from '../../types'
import { isHttpUrl } from '../../lib/links'

/**
 * Lets the mentor move a session, rename it, or change its joining link.
 *
 * The date and time inputs are the load-bearing part. A session is booked with
 * free text the mentee typed ("Thu, 12 Jun 2026" / "5:00 PM IST"), which reads
 * fine but cannot be compared against "now" — so nothing could ever be
 * scheduled from it. Picking a real date and time here is what turns the
 * session into something the 6-hour reminder can actually fire on, and the
 * server rewrites the displayed labels from it so the card and the reminder
 * can never disagree.
 *
 * Only the mentor sees this. The mentee is notified of every change rather
 * than negotiating: agreeing a slot and running it is the mentor's side, and a
 * two-way proposal would need its own accept/decline states.
 */
export function EditSessionModal({
  session,
  onClose,
  onSave,
}: {
  session: MentorshipSession
  onClose: () => void
  onSave: (changes: { topic?: string; scheduledAt?: string; meetingLink?: string }) => void
}) {
  const [topic, setTopic] = useState(session.topic)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [link, setLink] = useState(session.meetingLink ?? '')
  const [error, setError] = useState('')

  // A time needs its date and vice versa — half of a timestamp is not one.
  const halfATime = (date && !time) || (!date && time)

  function save() {
    if (halfATime) {
      setError('Pick both a date and a time, or leave both blank.')
      return
    }
    // Changeable, never removable: a confirmed session needs a way to join.
    if (!link.trim()) {
      setError('A meeting link is required — change it instead of removing it.')
      return
    }
    if (!isHttpUrl(link.trim())) {
      setError('The meeting link must be a full link, starting with https://')
      return
    }
    const changes: { topic?: string; scheduledAt?: string; meetingLink?: string } = {}
    if (topic.trim() && topic.trim() !== session.topic) changes.topic = topic.trim()
    if (link.trim() !== (session.meetingLink ?? '')) changes.meetingLink = link.trim()
    if (date && time) {
      // `new Date('2026-10-02T18:00')` is read in the viewer's own timezone,
      // which is what we want: a mentor picking 6pm means 6pm where they are.
      // Sending it as an ISO instant lets the server store the real moment
      // rather than a wall-clock string whose meaning depends on who reads it.
      const when = new Date(`${date}T${time}`)
      if (Number.isNaN(+when)) {
        setError('That date and time did not make sense.')
        return
      }
      if (+when < Date.now()) {
        setError('That time has already passed.')
        return
      }
      changes.scheduledAt = when.toISOString()
    }
    if (Object.keys(changes).length === 0) {
      setError('Nothing has changed yet.')
      return
    }
    onSave(changes)
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">Edit session</h2>
          <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">
          With {session.menteeName}. They'll be told about any change you make.
        </p>

        <label className="mb-1 block text-xs font-semibold text-ink">Topic</label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={200}
          className="mb-4 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <div className="mb-1 flex items-center gap-1.5">
          <CalendarClock size={14} className="text-brand" />
          <span className="text-xs font-semibold text-ink">Date and time</span>
        </div>
        <p className="mb-2 text-xs text-muted">
          Currently shown as “{session.date}, {session.time}”. Setting a real date and time here also
          turns on the reminder both of you get 6 hours before.
        </p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setError('') }}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            type="time"
            value={time}
            onChange={(e) => { setTime(e.target.value); setError('') }}
            className="rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>

        <label className="mb-1 block text-xs font-semibold text-ink">
          Meeting link <span className="text-red-500">*</span>
        </label>
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://meet.google.com/…"
          maxLength={500}
          className="mb-4 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />

        {error && <p className="mb-3 text-xs font-semibold text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save changes</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
