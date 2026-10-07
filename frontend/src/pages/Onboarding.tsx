import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Camera, Check } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { api } from '../lib/api'
import { fileToPhotoDataUrl } from '../lib/image'
import { Avatar } from '../components/ui'
import { ResumeUpload } from '../components/onboarding/ResumeUpload'
import { ProfileDetailSections } from '../components/profile/detail/ProfileDetailSections'
import { ProfileCompletenessMeter } from '../components/profile/ProfileCompletenessMeter'
import { mentorEligibility } from '../lib/profileCompleteness'
import { missingRequired, stepBlocked, type RequiredCheckInput } from '../lib/profileRequired'
import {
  EMPTY_DETAIL,
  detailToPatch,
  mergeResumeIntoDetail,
  type ProfileDetailValue,
} from '../lib/profileDetail'
import {
  DOMAINS,
  EMPLOYMENT_TYPES,
  INDUSTRIES,
  WORKING_EMPLOYMENT_TYPES,
  statusOf,
  type CurrentStatus,
  type Domain,
  type EmploymentType,
} from '../types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const STATUS_OPTIONS: CurrentStatus[] = [
  'Working Professional',
  'Student',
  'Looking for opportunity',
  'Just looking around',
]

const STEPS = ['Import Resume', 'Basic Info', 'Current Status', 'Profile Setup', 'Interests', 'More Detail']

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Read a File as a base64 string (without the data: URL prefix).
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function Onboarding() {
  useDocumentTitle('Set up your profile · Root Connect')
  const { updateProfile, notify, currentUser } = useApp()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(0)
  const [photo, setPhoto] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)

  const [form, setForm] = useState({
    // Prefilled from the account created at signup. Email is the login
    // identity and can't be changed here.
    name: currentUser.name === 'You' ? '' : currentUser.name,
    email: currentUser.email,
    phone: currentUser.phone ?? '',
    batchYear: '',
    course: '',
    company: '',
    designation: '',
    college: '',
    experienceYears: '',
    domain: '' as Domain | '',
    employmentType: '' as EmploymentType | '',
    linkedin: '',
    bio: '',
    city: '',
    willingToMentor: false,
    interestedInStartup: false,
    expertise: '',
  })

  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }))

  // The rich-profile half, edited on the last step by the same component Edit
  // Profile uses. `gaps` lists what a resume parse could not supply, so the
  // member is asked for exactly those rather than the whole form again.
  const [detail, setDetail] = useState<ProfileDetailValue>(EMPTY_DETAIL)
  // Whether a resume has been parsed — changes the wording of the outstanding
  // list from "still needed" to "your resume didn't cover these".
  const [parsed, setParsed] = useState(false)

  // Mentoring needs admin-verified proof, which can only be submitted from the
  // profile after signup — so the toggle is informational here and PATCH
  // /api/users/me would refuse it anyway.
  const mentor = mentorEligibility(currentUser)

  const status = statusOf(form.employmentType)

  // Everything the shared required-field rules need. Assembled once so
  // Onboarding and Edit Profile validate against the identical definition.
  const required: RequiredCheckInput = {
    ...form,
    photo,
    interests: detail.interests,
    achievements: detail.achievements,
    mentorTopics: detail.mentorTopics,
    mentorAvailability: detail.mentorAvailability,
    mentorshipMode: detail.mentorshipMode,
    seekingMentorshipIn: detail.seekingMentorshipIn,
    startupIntent: detail.startupIntent,
    startupLookingFor: detail.startupLookingFor,
  }
  const stillMissing = missingRequired(required)

  // Switching Current Status clears whatever fields no longer apply, so a
  // stale company/designation/college doesn't ride along unfilled on save.
  function pickStatus(s: CurrentStatus) {
    setForm((f) => ({
      ...f,
      employmentType:
        s === 'Working Professional' ? (statusOf(f.employmentType) === 'Working Professional' ? f.employmentType : 'Employed') : s,
      company: s === 'Working Professional' ? f.company : '',
      designation: s === 'Working Professional' ? f.designation : '',
      college: s === 'Student' ? f.college : '',
      experienceYears: s === 'Working Professional' || s === 'Looking for opportunity' ? f.experienceYears : '',
    }))
  }

  // Real AI resume parsing (Claude via the backend). Prefills every step of the
  // form from the extracted details; the user's own input always wins over a
  // field the resume didn't contain.
  async function parseResume(file: File) {
    setParsing(true)
    try {
      const dataBase64 = await toBase64(file)
      // Some platforms leave file.type empty — infer from the extension.
      const mediaType =
        file.type ||
        (/\.docx$/i.test(file.name)
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf')
      // Minimum ~600ms so the parsing animation doesn't flash; Claude usually takes longer.
      const [result] = await Promise.all([api.parseResume(dataBase64, mediaType), wait(600)])

      const top = result.experience[0]
      const pick = (parsed: string | undefined, current: string) => parsed || current
      setForm((f) => ({
        ...f,
        name: pick(result.name, f.name),
        phone: pick(result.phone, f.phone),
        batchYear: pick(result.batchYear?.replace(/\D/g, '').slice(0, 4), f.batchYear),
        course: pick(result.course, f.course),
        company: pick(top?.company, f.company),
        designation: top?.role || f.designation || result.headline,
        college: pick(result.college, f.college),
        experienceYears: pick(result.experienceYears?.replace(/\D/g, '').slice(0, 2), f.experienceYears),
        domain: DOMAINS.includes(result.domain as Domain) ? (result.domain as Domain) : f.domain,
        employmentType: EMPLOYMENT_TYPES.includes(result.employmentType as EmploymentType)
          ? (result.employmentType as EmploymentType)
          : f.employmentType,
        linkedin: pick(result.linkedin, f.linkedin),
        city: pick(result.city, f.city),
        bio: pick(result.bio || result.headline, f.bio),
        expertise: result.skills.length ? result.skills.join(', ') : f.expertise,
      }))

      const merged = mergeResumeIntoDetail(detail, result, INDUSTRIES)
      setDetail(merged)
      setParsed(true)

      if (result.source === 'fallback') {
        notify('AI parsing is not configured on the server — sample data filled in for demo.', 'info')
      } else {
        notify('Resume parsed — your details are filled in. Review each step and finish.', 'success')
      }
      // Jump straight into reviewing the prefilled details.
      setStep(1)
    } catch (err) {
      notify(
        err instanceof Error && err.message && !err.message.startsWith('Request failed')
          ? err.message
          : 'Could not parse resume. Is the backend running? You can fill it in manually.',
        'error',
      )
    } finally {
      setParsing(false)
    }
  }

  // Each step gates on its own required fields (see lib/profileRequired.ts).
  // The resume step is always skippable, and the final step can only be
  // finished once nothing is outstanding anywhere.
  const canNext = () => {
    if (step === 0) return true
    if (step === 1) return !stepBlocked(required, 'basic')
    if (step === 2) return !stepBlocked(required, 'status')
    if (step === 3) return !stepBlocked(required, 'setup')
    // Step 4 is the two opt-in toggles: nothing on it is mandatory, and the
    // questions they unlock are asked on the final step.
    if (step === 4) return true
    return stillMissing.length === 0
  }

  // Ticked AND still qualifying.
  const offersMentorship = form.willingToMentor && mentor.eligible

  async function finish() {
    setSaving(true)
    try {
      await updateProfile({
        name: form.name.trim(),
        ...(photo ? { photo } : {}),
        phone: form.phone,
        batchYear: Number(form.batchYear),
        course: form.course,
        company: form.company,
        designation: form.designation,
        college: form.college,
        experienceYears: Number(form.experienceYears) || 0,
        // No placeholder fallbacks: every one of these is required now, so a
        // blank would be a bug, and 'Web Dev' / 'Rooman alumnus.' would bury it
        // in data that looks deliberate. Domain in particular drives 25 of the
        // 100 people-matching points.
        domain: form.domain as Domain,
        employmentType: form.employmentType as EmploymentType,
        linkedin: form.linkedin,
        bio: form.bio.trim(),
        city: form.city,
        // Guarded by eligibility — see EditProfileModal for why sending a
        // mentor flag the member no longer qualifies for would fail the save.
        willingToMentor: offersMentorship,
        interestedInStartup: form.interestedInStartup,
        isMentor: offersMentorship,
        ...(offersMentorship ? { sessionsConducted: 0 } : {}),
        expertise: form.expertise.split(',').map((s) => s.trim()).filter(Boolean),
        ...detailToPatch(detail, {
          willingToMentor: offersMentorship,
          interestedInStartup: form.interestedInStartup,
          mentorVerified: !!currentUser.mentorVerified,
          openToWork: status === 'Looking for opportunity',
        }),
      })
      notify('Welcome to the Rooman Alumni Network! 🎉')
      navigate('/home')
    } catch {
      notify('Could not save your profile. Please try again.', 'error')
      setSaving(false)
    }
  }

  const next = () => (step < STEPS.length - 1 ? setStep((s) => s + 1) : finish())

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        {/* Progress */}
        <div className="mb-6 flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex flex-1 flex-col gap-1.5">
              <div className={`h-1.5 rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`} />
              <span className={`text-[11px] font-medium ${i === step ? 'text-brand' : 'text-muted'}`}>
                {s}
              </span>
            </div>
          ))}
        </div>

        <h1 className="text-2xl font-bold text-ink">{STEPS[step]}</h1>
        <p className="mb-5 text-sm text-muted">Step {step + 1} of {STEPS.length}</p>

        {/* Step content */}
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-4">
              <p className="font-semibold text-ink">
                Welcome{form.name ? `, ${form.name.split(' ')[0]}` : ''}! 👋
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink/70">
                Drop your resume and AI fills in your whole profile — batch, course, company,
                skills, everything. You review each step before it's saved. No resume handy?
                Skip and fill it in manually.
              </p>
            </div>
            <ResumeUpload parsing={parsing} onParse={parseResume} />
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <Field label="Full Name" value={form.name} onChange={(v) => set('name', v)} placeholder="Aarav Sharma" />
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Email</label>
              <input
                type="email"
                value={form.email}
                disabled
                className="w-full cursor-not-allowed rounded-lg border border-line bg-page px-3 py-2 text-sm text-muted"
              />
              <p className="mt-1 text-xs text-muted">This is your sign-in email (set at signup).</p>
            </div>
            <Field label="Phone" value={form.phone} onChange={(v) => set('phone', v)} placeholder="+91 …" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Batch Year" value={form.batchYear} onChange={(v) => set('batchYear', v.replace(/\D/g, '').slice(0, 4))} placeholder="2019" />
              <Field label="Course at Rooman" value={form.course} onChange={(v) => set('course', v)} placeholder="Full-Stack Dev" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Current Status</label>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => pickStatus(s)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      status === s
                        ? 'border-brand bg-brand-50 text-brand'
                        : 'border-line text-ink hover:bg-gray-50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">Optional — pick what applies, or skip this step entirely.</p>
            </div>

            {status === 'Working Professional' && (
              <>
                <Select
                  label="Employment Type"
                  value={form.employmentType}
                  onChange={(v) => set('employmentType', v)}
                  options={WORKING_EMPLOYMENT_TYPES}
                />
                <Field label="Current Company" value={form.company} onChange={(v) => set('company', v)} placeholder="Amazon" />
                <Field label="Designation" value={form.designation} onChange={(v) => set('designation', v)} placeholder="Software Engineer" />
                <Field label="Years of Experience" value={form.experienceYears} onChange={(v) => set('experienceYears', v.replace(/\D/g, '').slice(0, 2))} placeholder="4" />
              </>
            )}

            {status === 'Student' && (
              <Field label="College / Institution" value={form.college} onChange={(v) => set('college', v)} placeholder="Rooman Technologies" />
            )}

            {status === 'Looking for opportunity' && (
              <Field label="Years of Experience" value={form.experienceYears} onChange={(v) => set('experienceYears', v.replace(/\D/g, '').slice(0, 2))} placeholder="4" />
            )}

            <Select label="Expertise Domain" value={form.domain} onChange={(v) => set('domain', v)} options={DOMAINS} />
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <button
                onClick={() => fileRef.current?.click()}
                className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-line bg-page"
              >
                {photo ? (
                  <img src={photo} alt="" className="h-full w-full object-cover" />
                ) : form.name ? (
                  <Avatar name={form.name} size={76} />
                ) : (
                  <Camera size={24} className="text-muted" />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try {
                    setPhoto(await fileToPhotoDataUrl(f))
                  } catch {
                    notify('Could not read that image — try a different file.', 'error')
                  }
                }}
              />
              <div>
                <p className="text-sm font-semibold text-ink">Profile Photo</p>
                <p className="text-xs text-muted">Click the circle to upload (optional)</p>
              </div>
            </div>
            <Field label="LinkedIn URL" value={form.linkedin} onChange={(v) => set('linkedin', v)} placeholder="https://linkedin.com/in/…" />
            <Field label="City" value={form.city} onChange={(v) => set('city', v)} placeholder="Bengaluru" />
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Short Bio</label>
              <textarea
                value={form.bio}
                onChange={(e) => set('bio', e.target.value)}
                rows={3}
                placeholder="Tell the network about yourself…"
                className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <Field label="Key Skills (comma separated)" value={form.expertise} onChange={(v) => set('expertise', v)} placeholder="React, AWS, Node.js" />
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-3">
            <Toggle
              label="Willing to mentor juniors?"
              hint={
                mentor.eligible
                  ? 'Get listed as a mentor and conduct paid sessions.'
                  : 'Needs verified proof of 2+ years of experience, a postgraduate degree, or a passed assessment — submit it from your profile once you are set up.'
              }
              value={form.willingToMentor}
              disabled={!mentor.eligible}
              onChange={(v) => set('willingToMentor', v)}
            />
            <Toggle
              label="Interested in StartupVarsity?"
              hint="Access labs, mentors and seed support to build your product."
              value={form.interestedInStartup}
              onChange={(v) => set('interestedInStartup', v)}
            />
            <p className="text-xs text-muted">
              Say yes and the next step asks a couple of follow-ups — that's what makes mentor
              booking and startup matching actually work.
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              {parsed
                ? "Your resume filled in everything it could. Anything still listed below it couldn't find — add it here."
                : 'A fuller profile is what gets you found for referrals, mentorship and jobs.'}
            </p>
            {/* A preview of what the score WILL be once this is saved. Built
                field by field rather than by spreading `detail`, whose form
                values are strings where User wants numbers. */}
            <ProfileCompletenessMeter
              user={{
                ...currentUser,
                name: form.name,
                photo: photo ?? currentUser.photo,
                city: form.city,
                batchYear: Number(form.batchYear) || 0,
                course: form.course,
                company: form.company,
                designation: form.designation,
                college: form.college,
                bio: form.bio,
                linkedin: form.linkedin,
                employmentType: (form.employmentType || '') as EmploymentType,
                experienceYears: Number(form.experienceYears) || 0,
                expertise: form.expertise.split(',').map((x) => x.trim()).filter(Boolean),
                willingToMentor: form.willingToMentor,
                interestedInStartup: form.interestedInStartup,
                // Scored detail fields only.
                education: detail.education,
                projects: detail.projects,
                certifications: detail.certifications,
                experience: detail.experience,
                github: detail.github || undefined,
                portfolio: detail.portfolio || undefined,
                mentorTopics: detail.mentorTopics,
                mentorAvailability: detail.mentorAvailability || undefined,
                noticePeriod: detail.noticePeriod || undefined,
                preferredLocations: detail.preferredLocations,
                workMode: detail.workMode || undefined,
              }}
              postCount={0}
              variant="compact"
            />
            <ProfileDetailSections
              value={detail}
              onChange={(patch) => setDetail((d) => ({ ...d, ...patch }))}
              willingToMentor={form.willingToMentor}
              interestedInStartup={form.interestedInStartup}
            />
          </div>
        )}

        {/* A disabled Continue with no explanation is the classic dead end, so
            the outstanding fields for THIS step are named. The final step lists
            anything left anywhere. */}
        {(() => {
          const stepKey = (['basic', 'status', 'setup', 'interests'] as const)[step - 1]
          const outstanding =
            step === STEPS.length - 1
              ? stillMissing
              : stepKey
                ? stillMissing.filter((m) => m.step === stepKey)
                : []
          if (outstanding.length === 0) return null
          return (
            <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50 p-3">
              <p className="text-xs font-semibold text-ink">
                {parsed ? "Not on your resume — please add" : 'Still needed'}
              </p>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {outstanding.map((m) => (
                  <li key={m.label} className="text-xs text-muted">
                    • {m.label}
                  </li>
                ))}
              </ul>
            </div>
          )
        })()}

        {/* Footer */}
        <div className="mt-7 flex items-center justify-between">
          <button
            onClick={() => (step === 0 ? navigate('/') : setStep((s) => s - 1))}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button
            onClick={next}
            disabled={!canNext() || saving || (step === 0 && parsing)}
            className="flex items-center gap-2 rounded-full btn-primary px-6 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step === STEPS.length - 1 ? (
              <>{saving ? 'Saving…' : 'Finish'} <Check size={16} /></>
            ) : step === 0 ? (
              <>Skip — fill manually <ArrowRight size={16} /></>
            ) : (
              <>Continue <ArrowRight size={16} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
      />
    </div>
  )
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: T) => void
  options: readonly T[]
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  )
}

function Toggle({
  label,
  hint,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  hint: string
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      disabled={disabled && !value}
      className={`flex items-center justify-between rounded-xl border p-4 text-left transition-colors ${
        value ? 'border-brand bg-brand-50' : 'border-line hover:bg-gray-50'
      } ${disabled && !value ? 'cursor-not-allowed opacity-60 hover:bg-transparent' : ''}`}
    >
      <div>
        <p className="font-semibold text-ink">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? 'bg-brand' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface transition-all ${value ? 'left-[22px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  )
}
