import { useRef, useState } from 'react'
import { Camera, Trash2, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { fileToPhotoDataUrl } from '../../lib/image'
import { Button } from '../ui'
import { ProfilePhoto } from './ProfilePhoto'
import { ProfileDetailSections } from './detail/ProfileDetailSections'
import { mentorEligibility } from '../../lib/profileCompleteness'
import { missingRequired, type RequiredCheckInput } from '../../lib/profileRequired'
import { MentorVerification } from './MentorVerification'
import { ResumeAutofill } from './ResumeAutofill'
import {
  detailFromUser,
  detailToPatch,
  mergeResumeIntoDetail,
  type ProfileDetailValue,
} from '../../lib/profileDetail'
import {
  DOMAINS,
  INDUSTRIES,
  WORKING_EMPLOYMENT_TYPES,
  statusOf,
  type CurrentStatus,
  type Domain,
  type EmploymentType,
  type ResumeParseResult,
} from '../../types'

const STATUS_OPTIONS: CurrentStatus[] = [
  'Working Professional',
  'Student',
  'Looking for opportunity',
  'Just looking around',
]

// Edit the signed-in user's profile. Saves via PATCH /api/users/me (RDS).
export function EditProfileModal({ onClose }: { onClose: () => void }) {
  const { currentUser, updateProfile, notify } = useApp()
  const [saving, setSaving] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  // undefined = unchanged; string = new photo; null = remove existing photo.
  const [photo, setPhoto] = useState<string | null | undefined>(undefined)
  const shownPhoto = photo === undefined ? currentUser.photo : photo

  const [form, setForm] = useState({
    name: currentUser.name,
    designation: currentUser.designation,
    company: currentUser.company,
    college: currentUser.college ?? '',
    city: currentUser.city,
    phone: currentUser.phone ?? '',
    linkedin: currentUser.linkedin ?? '',
    bio: currentUser.bio,
    course: currentUser.course,
    batchYear: String(currentUser.batchYear || ''),
    experienceYears: String(currentUser.experienceYears || 0),
    domain: currentUser.domain as Domain,
    employmentType: currentUser.employmentType as EmploymentType,
    expertise: currentUser.expertise.join(', '),
    willingToMentor: currentUser.willingToMentor,
    interestedInStartup: currentUser.interestedInStartup,
    mentorRate: currentUser.mentorRate ? String(currentUser.mentorRate) : '',
  })

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  // The rich-profile half, edited by the shared <ProfileDetailSections>.
  const [detail, setDetail] = useState<ProfileDetailValue>(() => detailFromUser(currentUser))
  const setDetailPatch = (patch: Partial<ProfileDetailValue>) =>
    setDetail((d) => ({ ...d, ...patch }))

  const status = statusOf(form.employmentType)

  // Verification is server-side state (an admin approved the member's evidence),
  // so unlike the old self-declared rule this can't change while the form is
  // open — it is read straight off the saved profile.
  const mentor = mentorEligibility(currentUser)

  // A resume uploaded from here fills only what is still blank, so it can never
  // overwrite something the member typed or corrected earlier.
  function applyResume(r: ResumeParseResult) {
    const top = r.experience[0]
    const keep = (parsed: string | undefined, current: string) => current || parsed || ''
    setForm((f) => ({
      ...f,
      name: keep(r.name, f.name),
      phone: keep(r.phone, f.phone),
      linkedin: keep(r.linkedin, f.linkedin),
      city: keep(r.city, f.city),
      bio: keep(r.bio || r.headline, f.bio),
      course: keep(r.course, f.course),
      college: keep(r.college, f.college),
      batchYear: keep(r.batchYear?.replace(/\D/g, '').slice(0, 4), f.batchYear),
      experienceYears: keep(r.experienceYears?.replace(/\D/g, '').slice(0, 2), f.experienceYears),
      designation: keep(top?.role || r.headline, f.designation),
      company: keep(top?.company, f.company),
      domain: (f.domain || (DOMAINS.includes(r.domain as Domain) ? (r.domain as Domain) : f.domain)) as Domain,
      expertise: f.expertise || r.skills.join(', '),
    }))
    setDetail((d) => mergeResumeIntoDetail(d, r, INDUSTRIES))
  }

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

  // Ticked AND still qualifying. See the comment at the patch below.
  const offersMentorship = form.willingToMentor && mentor.eligible

  // The same required-field rules onboarding enforces, so a field you had to
  // supply at signup can't be emptied here afterwards.
  const required: RequiredCheckInput = {
    ...form,
    photo: shownPhoto,
    interests: detail.interests,
    achievements: detail.achievements,
    mentorTopics: detail.mentorTopics,
    mentorAvailability: detail.mentorAvailability,
    mentorshipMode: detail.mentorshipMode,
    seekingMentorshipIn: detail.seekingMentorshipIn,
    startupIntent: detail.startupIntent,
    startupLookingFor: detail.startupLookingFor,
    email: currentUser.email,
    willingToMentor: offersMentorship,
  }
  const stillMissing = missingRequired(required)

  async function save() {
    if (stillMissing.length > 0) {
      return notify(`Still needed: ${stillMissing.map((m) => m.label).join(', ')}`, 'error')
    }
    setSaving(true)
    try {
      await updateProfile({
        name: form.name.trim(),
        ...(photo !== undefined ? { photo } : {}),
        designation: form.designation,
        company: form.company,
        college: form.college,
        city: form.city,
        phone: form.phone,
        linkedin: form.linkedin,
        bio: form.bio,
        course: form.course,
        batchYear: Number(form.batchYear) || currentUser.batchYear,
        experienceYears: Number(form.experienceYears) || 0,
        domain: form.domain,
        employmentType: form.employmentType,
        expertise: form.expertise.split(',').map((s) => s.trim()).filter(Boolean),
        // Guarded by eligibility: if the member ticked the box and then removed
        // the degree that qualified them, sending `true` would be rejected with
        // a 403 and take the entire save down with it. Dropping to false keeps
        // the rest of their edit saveable.
        willingToMentor: offersMentorship,
        interestedInStartup: form.interestedInStartup,
        isMentor: offersMentorship,
        ...(offersMentorship && form.mentorRate ? { mentorRate: Number(form.mentorRate) } : {}),
        // `form.willingToMentor`, NOT `offersMentorship`: the drop to false
        // above is forced by missing verification, and detailToPatch clears
        // mentorTopics/mentorAvailability/mentorshipMode when this is false.
        // A legacy mentor editing their city would otherwise have lost all
        // three. The Mentor label still needs mentorVerified, so an
        // unverified member gains nothing from keeping the answer.
        ...detailToPatch(detail, {
          willingToMentor: form.willingToMentor,
          interestedInStartup: form.interestedInStartup,
          mentorVerified: !!currentUser.mentorVerified,
          openToWork: status === 'Looking for opportunity',
        }),
      })
      notify('Profile updated.')
      onClose()
    } catch (err) {
      // Surface the server's reason verbatim when it has one — the mentor
      // eligibility rejection is the case that matters, and "Could not save
      // your profile" would leave the member with no idea what to fix.
      notify(
        err instanceof Error && err.message && !err.message.startsWith('Request failed')
          ? err.message
          : 'Could not save your profile.',
        'error',
      )
      setSaving(false)
    }
  }

  const field =
    'w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand'
  const label = 'mb-1 block text-sm font-medium text-ink'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Edit Profile</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-gray-100">
            <X size={18} className="text-muted" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Autofill from a resume — the same parser onboarding uses, so
              members who signed up before these fields existed can fill them
              in one step instead of typing everything. */}
          <ResumeAutofill onParsed={applyResume} />

          {/* Profile photo */}
          <div className="flex items-center gap-4">
            <ProfilePhoto
              name={form.name || currentUser.name}
              photo={shownPhoto}
              size={64}
              canEdit
              onChange={(p) => setPhoto(p)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="!px-3 !py-1.5 text-xs"
                onClick={() => photoRef.current?.click()}
              >
                <Camera size={14} /> {shownPhoto ? 'Change photo' : 'Upload photo'}
              </Button>
              {shownPhoto && (
                <Button
                  variant="ghost"
                  className="!px-3 !py-1.5 text-xs !text-red-500 hover:!bg-red-50"
                  onClick={() => setPhoto(null)}
                >
                  <Trash2 size={14} /> Remove
                </Button>
              )}
              <input
                ref={photoRef}
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
            </div>
          </div>

          <div>
            <label className={label}>Full Name</label>
            <input className={field} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          <div>
            <label className={label}>Current Status</label>
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
          </div>

          {status === 'Working Professional' && (
            <>
              <div>
                <label className={label}>Employment Type</label>
                <select className={field} value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
                  {WORKING_EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label}>Designation</label>
                  <input className={field} value={form.designation} onChange={(e) => set('designation', e.target.value)} />
                </div>
                <div>
                  <label className={label}>Company</label>
                  <input className={field} value={form.company} onChange={(e) => set('company', e.target.value)} />
                </div>
              </div>
            </>
          )}

          {status === 'Student' && (
            <div>
              <label className={label}>College / Institution</label>
              <input className={field} value={form.college} onChange={(e) => set('college', e.target.value)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>City</label>
              <input className={field} value={form.city} onChange={(e) => set('city', e.target.value)} />
            </div>
            <div>
              <label className={label}>Phone</label>
              <input className={field} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Batch Year</label>
              <input className={field} value={form.batchYear} onChange={(e) => set('batchYear', e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </div>
            {(status === 'Working Professional' || status === 'Looking for opportunity') && (
              <div>
                <label className={label}>Experience (yrs)</label>
                <input className={field} value={form.experienceYears} onChange={(e) => set('experienceYears', e.target.value.replace(/\D/g, '').slice(0, 2))} />
              </div>
            )}
          </div>
          <div>
            <label className={label}>Course at Rooman</label>
            <input className={field} value={form.course} onChange={(e) => set('course', e.target.value)} />
          </div>
          <div>
            <label className={label}>Domain</label>
            <select className={field} value={form.domain} onChange={(e) => set('domain', e.target.value)}>
              {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>LinkedIn URL</label>
            <input className={field} value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} />
          </div>
          <div>
            <label className={label}>Bio</label>
            <textarea className={`${field} resize-none`} rows={3} value={form.bio} onChange={(e) => set('bio', e.target.value)} />
          </div>
          <div>
            <label className={label}>Skills (comma separated)</label>
            <input className={field} value={form.expertise} onChange={(e) => set('expertise', e.target.value)} />
          </div>
          {/* Mentoring is gated: a mentee books real time on the strength of
              it. Ineligible members see why, and the same rule is enforced by
              PATCH /api/users/me — the disabled checkbox is a courtesy, not
              the rule.

              Disabled whenever mentoring isn't verified, INCLUDING for a
              legacy mentor whose box is still ticked. It used to stay enabled
              in that case, so the control read as editable while the save
              forced it to false regardless. */}
          <label
            className={`flex items-center gap-2 text-sm ${mentor.eligible ? 'text-ink' : 'text-muted'}`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand disabled:cursor-not-allowed"
              checked={form.willingToMentor}
              disabled={!mentor.eligible}
              onChange={(e) => set('willingToMentor', e.target.checked)}
            />
            Willing to mentor juniors
          </label>
          {!mentor.eligible && (
            <div className="ml-6 rounded-lg border border-line bg-page p-3">
              <MentorVerification user={currentUser} />
            </div>
          )}

          {form.willingToMentor && (
            <div className="ml-6">
              <label className={label}>Mentorship rate (₹ / hour)</label>
              <input
                className={field}
                inputMode="numeric"
                placeholder="e.g. 1000"
                value={form.mentorRate}
                onChange={(e) => set('mentorRate', e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <p className="mt-1 text-xs text-muted">Shown on your mentor card. Leave empty for "Rate on request".</p>
            </div>
          )}
          {/* Private accounts are retired: profiles are visible to the
              network. What a member keeps back is per field (Contact details
              on the profile page) and per post (My connections). */}
          <p className="rounded-lg border border-line p-3 text-xs text-muted">
            Your profile is visible to everyone in the network, so people can find and help you. Your
            email and phone stay hidden unless you switch them on under Contact details, and you can post
            to your connections only by choosing <span className="font-semibold">My connections</span>.
          </p>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={form.interestedInStartup} onChange={(e) => set('interestedInStartup', e.target.checked)} />
            Interested in StartupVarsity
          </label>

          {/* Everything below is optional detail, shared verbatim with the
              onboarding wizard. Mentorship/StartupVarsity questions appear
              only while the two checkboxes above are ticked. */}
          <div className="mt-2 border-t border-line pt-3">
            <p className="mb-2 text-sm font-semibold text-ink">More about you</p>
            <ProfileDetailSections
              value={detail}
              onChange={setDetailPatch}
              willingToMentor={form.willingToMentor}
              interestedInStartup={form.interestedInStartup}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save Changes</Button>
        </div>
      </div>
    </div>
  )
}
