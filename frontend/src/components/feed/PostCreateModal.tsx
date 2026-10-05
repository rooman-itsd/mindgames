import { useRef, useState } from 'react'
import { BadgeCheck, Check, ChevronDown, ChevronUp, Image as ImageIcon, Mail, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { Avatar, Button } from '../ui'
import {
  DOMAINS,
  POST_TYPES,
  POST_TYPE_STYLES,
  type Domain,
  type PostType,
  type Visibility,
} from '../../types'

const VISIBILITIES: Visibility[] = ['All Alumni', 'My Network', 'Specific Community']
/** What each choice is called on screen. The stored values stay as they are
 *  (posts.visibility); members only ever read "Everyone" / "My connections". */
const VISIBILITY_LABEL: Record<Visibility, string> = {
  'All Alumni': 'Everyone',
  'My Network': 'My connections',
  'Specific Community': 'Specific Community',
}

export function PostCreateModal({
  prefill,
  onClose,
}: {
  prefill?: { type?: PostType; communityId?: string }
  onClose: () => void
}) {
  const { currentUser, createPost, communities, notify, startWorkEmailVerification, verifyWorkEmail } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<PostType>(prefill?.type ?? 'Update')
  const [content, setContent] = useState('')
  const [image, setImage] = useState<string | undefined>()
  const [domain, setDomain] = useState<Domain | ''>('')
  const [city, setCity] = useState('')
  const [batch, setBatch] = useState('')
  const [role, setRole] = useState('')
  const [company, setCompany] = useState(currentUser.company)
  const [visibility, setVisibility] = useState<Visibility>(
    prefill?.communityId ? 'Specific Community' : 'All Alumni',
  )
  const [communityId, setCommunityId] = useState(prefill?.communityId ?? '')
  // Hiring only: questions every applicant must answer (max 5).
  const [questions, setQuestions] = useState<string[]>([])
  const [questionDraft, setQuestionDraft] = useState('')
  // Hiring only: require applicants to attach a resume.
  const [wantsResume, setWantsResume] = useState(false)

  // Hiring only: the poster verifies a work email inline before posting, so a
  // listing can't be faked. Admins bypass; verified once, then reused forever.
  const employerVerified = !!currentUser.employerVerified || !!currentUser.isAdmin
  const [workEmail, setWorkEmail] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)

  const isJob = type === 'Hiring' || type === 'Open to Work'
  const needsWorkVerify = type === 'Hiring' && !employerVerified

  // Silent abuse guard only — the UI advertises no limit (backend caps at 20 too).
  const MAX_QUESTIONS = 20
  const QUESTION_SUGGESTIONS = [
    'Years of relevant experience?',
    'Current notice period?',
    'Expected CTC?',
    'Portfolio / GitHub link?',
  ]

  function addQuestion(text: string) {
    const q = text.trim().slice(0, 160)
    if (!q || questions.length >= MAX_QUESTIONS || questions.includes(q)) return
    setQuestions((list) => [...list, q])
    setQuestionDraft('')
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    setQuestions((list) => {
      const j = index + dir
      if (j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  async function sendWorkCode() {
    setVerifyBusy(true)
    setVerifyError(null)
    try {
      const r = await startWorkEmailVerification(workEmail.trim())
      setSentTo(r.email)
      setOtpSent(true)
      if (r.simulated) notify('Email is not configured on the server — check the server logs for your code.', 'info')
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Could not send the code.')
    } finally {
      setVerifyBusy(false)
    }
  }

  async function verifyWorkCode() {
    setVerifyBusy(true)
    setVerifyError(null)
    try {
      await verifyWorkEmail(otpCode.trim())
      notify('Work email verified — you can post this job now. ✅')
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Incorrect code. Try again.')
    } finally {
      setVerifyBusy(false)
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setImage(URL.createObjectURL(f))
  }

  function submit() {
    if (!content.trim() || needsWorkVerify) return
    createPost({
      type,
      content,
      image,
      domain: domain || undefined,
      city: city || undefined,
      batch: batch ? Number(batch) : undefined,
      visibility,
      communityId: visibility === 'Specific Community' ? communityId || undefined : undefined,
      role: isJob ? role || undefined : undefined,
      company: isJob ? company || undefined : undefined,
      questions: type === 'Hiring' && questions.length ? questions : undefined,
      wantsResume: type === 'Hiring' ? wantsResume : undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div className="animate-slidein my-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#edeff1] px-5 py-4">
          <h2 className="text-lg font-bold text-[#1c1c1c]">Create a post</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-[#878a8c] hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {/* Author */}
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={currentUser.name} src={currentUser.photo} size={44} />
            <div>
              <p className="font-semibold text-[#1c1c1c]">{currentUser.name}</p>
              <p className="text-xs text-[#878a8c]">{currentUser.designation}</p>
            </div>
          </div>

          {/* Post type selector */}
          <div className="mb-4 flex flex-wrap gap-2">
            {POST_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  type === t ? POST_TYPE_STYLES[t].classes + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-[#878a8c] hover:bg-gray-200'
                }`}
              >
                {POST_TYPE_STYLES[t].label}
              </button>
            ))}
          </div>

          {/* Employer verification (Hiring only) — inline, required before posting */}
          {type === 'Hiring' && !employerVerified && (
            <div className="mb-3 rounded-xl border border-[#ff4500]/30 bg-orange-50 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#1c1c1c]">
                <ShieldCheck size={16} className="text-[#ff4500]" /> Verify your work email to post this job
              </p>
              <p className="mt-1 text-xs text-[#878a8c]">
                Only people who work at a company can post jobs, so listings stay genuine. We email a
                6-digit code — personal or temporary emails aren't accepted. You only do this once.
              </p>
              {!otpSent ? (
                <div className="mt-2 flex gap-2">
                  <label className="flex flex-1 items-center gap-2 rounded-lg border border-[#edeff1] bg-white px-3 py-2 focus-within:border-[#ff4500]">
                    <Mail size={15} className="text-[#878a8c]" />
                    <input
                      type="email"
                      value={workEmail}
                      onChange={(e) => setWorkEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && workEmail.trim()) { e.preventDefault(); sendWorkCode() } }}
                      placeholder="you@yourcompany.com"
                      className="flex-1 text-sm outline-none"
                    />
                  </label>
                  <button
                    onClick={sendWorkCode}
                    disabled={!workEmail.trim() || verifyBusy}
                    className="rounded-lg bg-[#ff4500] px-3 py-2 text-sm font-semibold text-white hover:bg-[#ff6534] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {verifyBusy ? 'Sending…' : 'Send code'}
                  </button>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-xs text-[#878a8c]">Code sent to <strong className="text-[#1c1c1c]">{sentTo}</strong> — expires in 10 minutes.</p>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      inputMode="numeric"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      onKeyDown={(e) => { if (e.key === 'Enter' && otpCode.length === 6) { e.preventDefault(); verifyWorkCode() } }}
                      placeholder="Enter code"
                      className="flex-1 rounded-lg border border-[#edeff1] bg-white px-3 py-2 text-center text-sm tracking-[0.3em] outline-none focus:border-[#ff4500]"
                    />
                    <button
                      onClick={verifyWorkCode}
                      disabled={otpCode.length !== 6 || verifyBusy}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#ff4500] px-3 py-2 text-sm font-semibold text-white hover:bg-[#ff6534] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Check size={14} /> {verifyBusy ? 'Verifying…' : 'Verify'}
                    </button>
                  </div>
                  <button
                    onClick={() => { setOtpSent(false); setOtpCode(''); setVerifyError(null) }}
                    className="mt-1.5 text-xs font-medium text-[#ff4500] hover:underline"
                  >
                    Change email / resend code
                  </button>
                </>
              )}
              {verifyError && <p className="mt-1.5 text-xs text-red-500">{verifyError}</p>}
            </div>
          )}
          {type === 'Hiring' && employerVerified && currentUser.workEmailDomain && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-[#1d9bf0]">
              <BadgeCheck size={15} /> Verified employer · {currentUser.workEmailDomain}
            </div>
          )}

          {/* Job fields */}
          {isJob && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder={type === 'Hiring' ? 'Role you’re hiring for' : 'Role you’re seeking'}
                className="rounded-lg border border-[#edeff1] px-3 py-2 text-sm outline-none focus:border-[#ff4500]"
              />
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company"
                className="rounded-lg border border-[#edeff1] px-3 py-2 text-sm outline-none focus:border-[#ff4500]"
              />
            </div>
          )}

          {/* Application questions (Hiring only) */}
          {type === 'Hiring' && (
            <div className="mb-3 rounded-xl border border-dashed border-[#edeff1] bg-[#f6f7f8] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#878a8c]">
                Questions for applicants{' '}
                {questions.length > 0 && <span className="font-bold normal-case">({questions.length})</span>}{' '}
                <span className="font-normal normal-case">(optional)</span>
              </p>
              <p className="mt-1 text-xs text-[#878a8c]">
                Every applicant must answer these — their answers appear next to their name in
                your applicant list.
              </p>

              {questions.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {questions.map((q, i) => (
                    <li
                      key={q}
                      className="flex items-center gap-2 rounded-lg border border-[#edeff1] bg-white px-3 py-1.5 text-sm text-[#1c1c1c]"
                    >
                      <span className="text-xs font-bold text-[#ff4500]">{i + 1}.</span>
                      <span className="flex-1">{q}</span>
                      <button
                        onClick={() => moveQuestion(i, -1)}
                        disabled={i === 0}
                        className="rounded-full p-1 text-[#878a8c] hover:bg-gray-100 hover:text-[#1c1c1c] disabled:cursor-not-allowed disabled:opacity-30"
                        title="Move up"
                        aria-label={`Move question up: ${q}`}
                      >
                        <ChevronUp size={15} />
                      </button>
                      <button
                        onClick={() => moveQuestion(i, 1)}
                        disabled={i === questions.length - 1}
                        className="rounded-full p-1 text-[#878a8c] hover:bg-gray-100 hover:text-[#1c1c1c] disabled:cursor-not-allowed disabled:opacity-30"
                        title="Move down"
                        aria-label={`Move question down: ${q}`}
                      >
                        <ChevronDown size={15} />
                      </button>
                      <button
                        onClick={() => setQuestions((list) => list.filter((x) => x !== q))}
                        className="rounded-full p-1 text-[#878a8c] hover:bg-red-50 hover:text-red-500"
                        title="Delete this question"
                        aria-label={`Delete question: ${q}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2 flex gap-2">
                <input
                  value={questionDraft}
                  onChange={(e) => setQuestionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addQuestion(questionDraft)
                    }
                  }}
                  placeholder="e.g. How many years of React experience?"
                  className="flex-1 rounded-lg border border-[#edeff1] bg-white px-3 py-2 text-sm outline-none focus:border-[#ff4500]"
                />
                <button
                  onClick={() => addQuestion(questionDraft)}
                  disabled={!questionDraft.trim()}
                  className="flex items-center gap-1 rounded-lg bg-[#ff4500] px-3 py-2 text-sm font-semibold text-white hover:bg-[#ff6534] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={15} /> Add
                </button>
              </div>
              {QUESTION_SUGGESTIONS.some((sug) => !questions.includes(sug)) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUESTION_SUGGESTIONS.filter((s) => !questions.includes(s)).map((s) => (
                    <button
                      key={s}
                      onClick={() => addQuestion(s)}
                      className="rounded-full border border-[#edeff1] bg-white px-2.5 py-1 text-xs text-[#878a8c] hover:border-[#ff4500]/40 hover:text-[#ff4500]"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Resume collection toggle */}
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 border-t border-[#edeff1] pt-3">
                <input
                  type="checkbox"
                  checked={wantsResume}
                  onChange={(e) => setWantsResume(e.target.checked)}
                  className="h-4 w-4 accent-[#ff4500]"
                />
                <span className="text-sm text-[#1c1c1c]">
                  Ask applicants to attach their <strong>resume</strong>{' '}
                  <span className="text-xs text-[#878a8c]">(PDF or .docx, downloadable from your applicant list)</span>
                </span>
              </label>
            </div>
          )}

          {/* Body */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="What do you want to share with the network?"
            className="w-full resize-none rounded-lg border border-[#edeff1] px-3 py-2 text-sm outline-none focus:border-[#ff4500]"
          />

          {/* Image preview */}
          {image && (
            <div className="relative mt-3">
              <img src={image} alt="" className="max-h-60 w-full rounded-lg object-cover" />
              <button
                onClick={() => setImage(undefined)}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Tags */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value as Domain | '')}
              className="rounded-lg border border-[#edeff1] px-2 py-2 text-sm text-[#1c1c1c] outline-none focus:border-[#ff4500]"
            >
              <option value="">Domain</option>
              {DOMAINS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="rounded-lg border border-[#edeff1] px-3 py-2 text-sm outline-none focus:border-[#ff4500]"
            />
            <input
              value={batch}
              onChange={(e) => setBatch(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Batch"
              className="rounded-lg border border-[#edeff1] px-3 py-2 text-sm outline-none focus:border-[#ff4500]"
            />
          </div>

          {/* Visibility */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {VISIBILITIES.map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  visibility === v ? 'bg-[#ff4500] text-white' : 'bg-gray-100 text-[#878a8c] hover:bg-gray-200'
                }`}
              >
                {VISIBILITY_LABEL[v]}
              </button>
            ))}
            {visibility === 'Specific Community' && (
              <select
                value={communityId}
                onChange={(e) => setCommunityId(e.target.value)}
                className="rounded-lg border border-[#edeff1] px-2 py-1.5 text-sm outline-none focus:border-[#ff4500]"
              >
                <option value="">Choose community…</option>
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
          {/* Who will see it — the server enforces My Network (posts.routes.ts),
              and a job post's alert follows the same choice. */}
          {visibility !== 'Specific Community' && (
            <p className="mt-1.5 text-[11px] text-[#878a8c]">
              Who sees this post: {VISIBILITY_LABEL[visibility]}.
              {type === 'Hiring' &&
                ` Job alert goes to: ${VISIBILITY_LABEL[visibility]}${domain ? ` in ${domain}` : ' in the job’s domain'}.`}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#edeff1] px-5 py-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#878a8c] hover:bg-gray-100"
          >
            <ImageIcon size={18} /> Photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          <Button onClick={submit} disabled={!content.trim() || needsWorkVerify}>
            Post
          </Button>
        </div>
      </div>
    </div>
  )
}
