// Mentor verification, from the member's side.
//
// Mentoring is the one claim on the network that can't be self-declared: a
// mentee books real time on the strength of it. So the member picks ONE
// requirement they meet, attaches evidence, and an admin reviews it. Until
// that review passes, PATCH /api/users/me refuses to switch mentoring on —
// this panel is the way in, not a decoration.

import { useEffect, useRef, useState } from 'react'
import { BadgeCheck, Clock, FileText, Lock, Upload, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../store/AppStore'
import { Button } from '../ui'
import {
  MENTOR_CLAIMS_COMING_SOON,
  MENTOR_CLAIM_LABELS,
  MENTOR_CLAIM_PROOF_HINTS,
  type MentorApplication,
  type MentorClaim,
  type User,
} from '../../types'
import { mentorEligibility } from '../../lib/profileCompleteness'

// Certificates and letters are scans as often as PDFs.
const ACCEPT = '.pdf,.docx,.jpg,.jpeg,.png'
const MAX_DOCS = 5
const MAX_BYTES = 5 * 1024 * 1024

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function mimeOf(file: File): string | null {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  // Some platforms report no type — fall back to the extension.
  if (/\.pdf$/i.test(file.name)) return 'application/pdf'
  if (/\.docx$/i.test(file.name)) return DOCX_MIME
  if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg'
  if (/\.png$/i.test(file.name)) return 'image/png'
  return null
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

export function MentorVerification({ user }: { user: User }) {
  const { notify } = useApp()
  const [application, setApplication] = useState<MentorApplication | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const requirements = mentorEligibility(user).requirements

  // Arriving from a "Become a Mentor" button elsewhere in the app: bring the
  // panel into view and open the form, so the destination is obvious rather
  // than something to hunt for down the page.
  useEffect(() => {
    if (window.location.hash !== '#mentor-verification') return
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setOpen(true)
  }, [loading])

  useEffect(() => {
    let live = true
    api
      .getMyMentorApplication()
      .then((a) => live && setApplication(a))
      .catch(() => live && setApplication(null))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  if (loading) return null

  // Verified: say so and stop asking.
  if (user.mentorVerified) {
    return (
      <div className="mt-3 flex items-start gap-2 border-t border-line pt-3">
        <BadgeCheck size={15} className="mt-0.5 shrink-0 text-green-600" />
        <div>
          <p className="text-xs font-semibold text-ink">Mentor credentials verified</p>
          <p className="text-xs text-muted">
            {application?.claim
              ? `Approved on the strength of: ${MENTOR_CLAIM_LABELS[application.claim].toLowerCase()}.`
              : 'You can offer mentorship from Edit Profile.'}
          </p>
        </div>
      </div>
    )
  }

  const pending = application?.status === 'pending'
  const declined = application?.status === 'declined'

  return (
    // Anchor target: "Become a Mentor" elsewhere in the app links to
    // /profile#mentor-verification, since dropping someone on a long profile
    // page with no idea which part of it they were sent for is a dead end.
    <div id="mentor-verification" ref={panelRef} className="mt-3 scroll-mt-24 border-t border-line pt-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
        <Lock size={12} className="text-muted" />
        To offer mentorship, submit proof of any one of these
      </p>

      <ul className="mt-1.5 flex flex-col gap-1">
        {requirements.map((r) => (
          <li key={r.key} className="flex items-start gap-1.5 text-xs text-muted">
            <span aria-hidden>•</span>
            <span>
              {r.label}
              {MENTOR_CLAIMS_COMING_SOON.includes(r.key) ? (
                <span className="ml-1 rounded-full bg-page px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                  Coming soon
                </span>
              ) : (
                // Nudge toward the claim their profile already backs up.
                r.supportedByProfile && (
                  <span className="ml-1 font-medium text-brand">
                    — your profile already says this
                  </span>
                )
              )}
            </span>
          </li>
        ))}
      </ul>

      {pending ? (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-page p-3">
          <Clock size={14} className="mt-0.5 shrink-0 text-muted" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink">Under review</p>
            <p className="text-xs text-muted">
              {application?.documents.length ?? 0}{' '}
              {(application?.documents.length ?? 0) === 1 ? 'document' : 'documents'} submitted
              {application?.claim ? ` for "${MENTOR_CLAIM_LABELS[application.claim]}"` : ''}. An
              admin will review it.
            </p>
          </div>
        </div>
      ) : (
        <>
          {declined && (
            <div className="mt-2 rounded-lg border border-red-100 bg-red-50 p-3">
              <p className="text-xs font-semibold text-red-700">
                Your last submission wasn't accepted
              </p>
              {application?.reviewNote && (
                <p className="mt-0.5 text-xs text-red-700/80">{application.reviewNote}</p>
              )}
              <p className="mt-0.5 text-xs text-red-700/80">You can submit again below.</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 flex items-center gap-1.5 rounded-full btn-primary px-3 py-1.5 text-xs font-bold text-white"
          >
            <Upload size={12} />
            {declined ? 'Submit new proof' : 'Submit proof'}
          </button>
        </>
      )}

      {open && (
        <MentorProofModal
          requirements={requirements}
          onClose={() => setOpen(false)}
          onSubmitted={(a) => {
            setApplication(a)
            setOpen(false)
            notify('Proof submitted — an admin will review it shortly.', 'success')
          }}
          notify={notify}
        />
      )}
    </div>
  )
}

function MentorProofModal({
  requirements,
  onClose,
  onSubmitted,
  notify,
}: {
  requirements: { key: MentorClaim; label: string; supportedByProfile: boolean }[]
  onClose: () => void
  onSubmitted: (a: MentorApplication) => void
  notify: (m: string, k?: 'success' | 'error' | 'info') => void
}) {
  const available = requirements.filter((r) => !MENTOR_CLAIMS_COMING_SOON.includes(r.key))
  // Default to whichever available claim their profile already supports —
  // that's the one most likely to be approved, and it saves a decision.
  const [claim, setClaim] = useState<MentorClaim>(
    available.find((r) => r.supportedByProfile)?.key ?? available[0]?.key ?? 'experience',
  )
  const [files, setFiles] = useState<File[]>([])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(picked: FileList | null) {
    if (!picked) return
    const next: File[] = []
    for (const f of Array.from(picked)) {
      if (!mimeOf(f)) {
        notify(`${f.name} isn't a PDF, .docx, JPEG or PNG.`, 'error')
        continue
      }
      if (f.size > MAX_BYTES) {
        notify(`${f.name} is larger than 5MB.`, 'error')
        continue
      }
      next.push(f)
    }
    setFiles((cur) => [...cur, ...next].slice(0, MAX_DOCS))
  }

  async function submit() {
    if (files.length === 0) return notify('Attach at least one document.', 'error')
    setSaving(true)
    try {
      const documents = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          mediaType: mimeOf(f) as string,
          dataBase64: await toBase64(f),
        })),
      )
      await api.applyForMentor({ claim, note: note.trim() || undefined, documents })
      // Re-read rather than trusting the local shape, so the panel shows
      // exactly what the server recorded.
      const fresh = await api.getMyMentorApplication()
      if (fresh) onSubmitted(fresh)
      else onClose()
    } catch (err) {
      notify(
        err instanceof Error && err.message && !err.message.startsWith('Request failed')
          ? err.message
          : 'Could not submit your proof. Please try again.',
        'error',
      )
      setSaving(false)
    }
  }

  const label = 'mb-1 block text-sm font-medium text-ink'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Verify your mentor credentials</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100">
            <X size={18} className="text-muted" />
          </button>
        </div>
        <p className="mb-4 text-xs text-muted">
          Pick the one requirement you meet and attach evidence. Only Rooman admins can open these
          files — they are never shown on your profile.
        </p>

        <div className="flex flex-col gap-4">
          <div>
            <label className={label}>What are you claiming?</label>
            <div className="flex flex-col gap-2">
              {requirements.map((r) => {
                const comingSoon = MENTOR_CLAIMS_COMING_SOON.includes(r.key)
                return (
                  <button
                    key={r.key}
                    type="button"
                    disabled={comingSoon}
                    onClick={() => setClaim(r.key)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      claim === r.key && !comingSoon
                        ? 'border-brand bg-brand-50 text-ink'
                        : 'border-line text-ink hover:bg-gray-50'
                    } ${comingSoon ? 'cursor-not-allowed opacity-50 hover:bg-transparent' : ''}`}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      {r.label}
                      {comingSoon && (
                        <span className="rounded-full bg-page px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                          Coming soon
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted">
                      {comingSoon
                        ? 'The Rooman assessment is not open yet.'
                        : MENTOR_CLAIM_PROOF_HINTS[r.key]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className={label}>Documents</label>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={files.length >= MAX_DOCS}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line py-4 text-sm font-medium text-brand hover:border-brand-400 disabled:cursor-not-allowed disabled:text-muted"
            >
              <Upload size={15} />
              {files.length >= MAX_DOCS ? `Maximum ${MAX_DOCS} files` : 'Choose files'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files)
                // Allow re-picking the same file after a removal.
                e.target.value = ''
              }}
            />
            <p className="mt-1 text-xs text-muted">
              PDF, .docx, JPEG or PNG · up to {MAX_DOCS} files · 5MB each
            </p>

            {files.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-lg bg-page px-3 py-2"
                  >
                    <FileText size={14} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink">{f.name}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {Math.max(1, Math.round(f.size / 1024))} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((cur) => cur.filter((_, idx) => idx !== i))}
                      aria-label={`Remove ${f.name}`}
                      className="shrink-0 text-muted hover:text-red-500"
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className={label}>Anything the reviewer should know? (optional)</label>
            <textarea
              className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. My experience letter covers two roles at the same company."
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} disabled={files.length === 0}>
            Submit for review
          </Button>
        </div>
      </div>
    </div>
  )
}
