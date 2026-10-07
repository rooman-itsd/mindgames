// The rich-profile input block, rendered identically by the onboarding wizard
// and by Edit Profile. Both mount this below their own long-standing fields —
// nothing pre-existing was moved into here.
//
// Mentorship and StartupVarsity are gated on the parent form's opt-in
// checkboxes: their questions don't exist until the member says yes.

import {
  INDUSTRIES,
  MENTORSHIP_MODES,
  STARTUP_INTENTS,
  STARTUP_LOOKING_FOR,
  WORK_MODES,
  type MentorshipMode,
  type StartupIntent,
  type WorkMode,
} from '../../../types'
import type { ProfileDetailValue } from '../../../lib/profileDetail'
import {
  CheckboxField,
  DetailSection,
  EntryListEditor,
  PrivateHint,
  SelectField,
  LockRow,
  TagField,
  TextField,
  fieldCx,
  labelCx,
} from './primitives'

export function ProfileDetailSections({
  value,
  onChange,
  willingToMentor,
  interestedInStartup,
}: {
  value: ProfileDetailValue
  onChange: (patch: Partial<ProfileDetailValue>) => void
  willingToMentor: boolean
  interestedInStartup: boolean
}) {
  const v = value
  const set = onChange

  return (
    <div className="flex flex-col gap-2">
      <DetailSection
        title="Work experience"
        hint="Your full history — this is what puts you on your companies' alumni lists."
        count={v.experience.length}
      >
        <EntryListEditor
          entries={v.experience}
          onChange={(experience) => set({ experience })}
          blank={() => ({ role: '', company: '', period: '', summary: '' })}
          summary={(e) => [e.role, e.company].filter(Boolean).join(' · ')}
          addLabel="Add a role"
          max={25}
          fields={(e, patch) => (
            <>
              <TextField label="Role" value={e.role} onChange={(role) => patch({ role })} placeholder="Software Engineer" />
              <TextField label="Company" value={e.company} onChange={(company) => patch({ company })} placeholder="Amazon" />
              <TextField label="Period" value={e.period} onChange={(period) => patch({ period })} placeholder="2022 — Present" />
              <div>
                <label className={labelCx}>What you did</label>
                <textarea
                  className={`${fieldCx} resize-none`}
                  rows={2}
                  value={e.summary}
                  onChange={(ev) => patch({ summary: ev.target.value })}
                  placeholder="One line on what you built or achieved."
                />
              </div>
            </>
          )}
        />
      </DetailSection>

      <DetailSection title="Education" count={v.education.length}>
        <EntryListEditor
          entries={v.education}
          onChange={(education) => set({ education })}
          blank={() => ({ degree: '', institution: '', year: '', score: '' })}
          summary={(e) => [e.degree, e.institution].filter(Boolean).join(' · ')}
          addLabel="Add a degree"
          max={15}
          fields={(e, patch) => (
            <>
              <TextField label="Degree / Diploma" value={e.degree} onChange={(degree) => patch({ degree })} placeholder="B.E. Computer Science" />
              <TextField label="Institution" value={e.institution} onChange={(institution) => patch({ institution })} />
              <TextField label="Year" value={e.year} onChange={(year) => patch({ year })} placeholder="2019" />
              <TextField label="Score (optional)" value={e.score ?? ''} onChange={(score) => patch({ score })} placeholder="8.4 CGPA" />
            </>
          )}
        />
      </DetailSection>

      <DetailSection
        title="Projects"
        hint="The best way to show what you can do if you're just starting out."
        count={v.projects.length}
      >
        <EntryListEditor
          entries={v.projects}
          onChange={(projects) => set({ projects })}
          blank={() => ({ title: '', description: '', link: '', tech: [] })}
          summary={(p) => p.title}
          addLabel="Add a project"
          max={25}
          fields={(p, patch) => (
            <>
              <TextField label="Title" value={p.title} onChange={(title) => patch({ title })} />
              <div>
                <label className={labelCx}>Description</label>
                <textarea
                  className={`${fieldCx} resize-none`}
                  rows={2}
                  value={p.description}
                  onChange={(ev) => patch({ description: ev.target.value })}
                  placeholder="What it does, and who it's for."
                />
              </div>
              <TextField label="Link (optional)" value={p.link ?? ''} onChange={(link) => patch({ link })} placeholder="https://github.com/…" />
              <TagField label="Tech used" values={p.tech} onChange={(tech) => patch({ tech })} placeholder="React, Node.js" max={20} />
            </>
          )}
        />
      </DetailSection>

      <DetailSection title="Certifications" count={v.certifications.length}>
        <EntryListEditor
          entries={v.certifications}
          onChange={(certifications) => set({ certifications })}
          blank={() => ({ name: '', issuer: '', year: '' })}
          summary={(c) => [c.name, c.issuer].filter(Boolean).join(' · ')}
          addLabel="Add a certification"
          max={30}
          fields={(c, patch) => (
            <>
              <TextField label="Name" value={c.name} onChange={(name) => patch({ name })} placeholder="AWS Solutions Architect" />
              <TextField label="Issued by" value={c.issuer} onChange={(issuer) => patch({ issuer })} placeholder="Amazon Web Services" />
              <TextField label="Year" value={c.year} onChange={(year) => patch({ year })} placeholder="2023" />
            </>
          )}
        />
      </DetailSection>

      <DetailSection title="Achievements" hint="Awards, competition wins, publications." count={v.achievements.length}>
        <EntryListEditor
          entries={v.achievements}
          onChange={(achievements) => set({ achievements })}
          blank={() => ({ title: '', year: '' })}
          summary={(a) => a.title}
          addLabel="Add an achievement"
          max={30}
          fields={(a, patch) => (
            <>
              <TextField label="What you achieved" value={a.title} onChange={(title) => patch({ title })} />
              <TextField label="Year" value={a.year} onChange={(year) => patch({ year })} placeholder="2024" />
            </>
          )}
        />
      </DetailSection>

      <DetailSection title="Links" count={[v.github, v.portfolio].filter(Boolean).length + v.otherLinks.length}>
        <TextField label="GitHub" value={v.github} onChange={(github) => set({ github })} placeholder="https://github.com/…" />
        <TextField label="Portfolio / website" value={v.portfolio} onChange={(portfolio) => set({ portfolio })} placeholder="https://…" />
        <div>
          <label className={labelCx}>Other links</label>
          <EntryListEditor
            entries={v.otherLinks}
            onChange={(otherLinks) => set({ otherLinks })}
            blank={() => ({ label: '', url: '' })}
            summary={(l) => l.label || l.url}
            addLabel="Add a link"
            max={10}
            fields={(l, patch) => (
              <>
                <TextField label="Label" value={l.label} onChange={(label) => patch({ label })} placeholder="Blog" />
                <TextField label="URL" value={l.url} onChange={(url) => patch({ url })} placeholder="https://…" />
              </>
            )}
          />
        </div>
      </DetailSection>

      <DetailSection title="About your work & preferences">
        <SelectField label="Industry" value={v.industry} onChange={(industry) => set({ industry })} options={INDUSTRIES} />
        <SelectField
          label="Preferred work mode"
          value={v.workMode}
          onChange={(workMode: WorkMode) => set({ workMode })}
          options={WORK_MODES}
        />
        <TextField
          label="Rooman centre you trained at"
          value={v.roomanCenter}
          onChange={(roomanCenter) => set({ roomanCenter })}
          placeholder="e.g. Bengaluru — Jayanagar"
        />
        <TagField
          label="Languages you speak"
          values={v.languagesKnown}
          onChange={(languagesKnown) => set({ languagesKnown })}
          placeholder="English, Hindi, Kannada"
          max={15}
        />
        <TagField
          label="Interests outside work"
          values={v.interests}
          onChange={(interests) => set({ interests })}
          placeholder="Cricket, photography, open source"
        />
        <CheckboxField label="Open to relocating" checked={v.openToRelocate} onChange={(openToRelocate) => set({ openToRelocate })} />
        <CheckboxField
          label="Happy to speak at alumni events"
          checked={v.openToSpeakAtEvents}
          onChange={(openToSpeakAtEvents) => set({ openToSpeakAtEvents })}
        />
      </DetailSection>

      {willingToMentor && (
        <DetailSection
          title="Mentorship details"
          hint="Juniors can only book you once they know what you'll cover and when you're free."
          defaultOpen
        >
          <TagField
            label="Topics you can mentor on"
            values={v.mentorTopics}
            onChange={(mentorTopics) => set({ mentorTopics })}
            placeholder="Interview prep, System design, Career switch"
          />
          <TextField
            label="How much time you have"
            value={v.mentorAvailability}
            onChange={(mentorAvailability) => set({ mentorAvailability })}
            placeholder="e.g. 2 hrs/week, weekday evenings"
          />
          <SelectField
            label="How you prefer to mentor"
            value={v.mentorshipMode}
            onChange={(mentorshipMode: MentorshipMode) => set({ mentorshipMode })}
            options={MENTORSHIP_MODES}
          />
        </DetailSection>
      )}

      {interestedInStartup && (
        <DetailSection title="StartupVarsity" hint="Used to match you with other founders and joiners." defaultOpen>
          <SelectField
            label="Where you are right now"
            value={v.startupIntent}
            onChange={(startupIntent: StartupIntent) => set({ startupIntent })}
            options={STARTUP_INTENTS}
          />
          <TagField
            label="What you're looking for"
            values={v.startupLookingFor}
            onChange={(startupLookingFor) => set({ startupLookingFor })}
            placeholder={STARTUP_LOOKING_FOR.join(', ')}
            max={10}
          />
        </DetailSection>
      )}

      <DetailSection title="Referrals & hiring">
        <CheckboxField
          label="Willing to give referrals at my company"
          checked={v.openToReferrals}
          onChange={(openToReferrals) => set({ openToReferrals })}
        />
        {v.openToReferrals && (
          <div>
            <label className={labelCx}>Note for people asking (optional)</label>
            <textarea
              className={`${fieldCx} resize-none`}
              rows={2}
              value={v.referralNote}
              onChange={(e) => set({ referralNote: e.target.value })}
              placeholder="Happy to refer for backend roles — send me your resume and the job link."
            />
          </div>
        )}
        <TagField
          label="Roles I'm hiring for"
          values={v.hiringFor}
          onChange={(hiringFor) => set({ hiringFor })}
          placeholder="Backend Engineer, QA Intern"
        />
      </DetailSection>

      <DetailSection title="Contact details" hint="Both are hidden from other members by default.">
        <PrivateHint>
          Your phone number and email are private unless you switch them on here. We never ask for
          your home address, age or salary.
        </PrivateHint>
        <CheckboxField
          label="Show my phone number on my profile"
          checked={v.showPhone}
          onChange={(showPhone) => set({ showPhone })}
        />
        <CheckboxField
          label="Show my email address on my profile"
          checked={v.showEmail}
          onChange={(showEmail) => set({ showEmail })}
        />
      </DetailSection>

      {/* Each sensitive field has its own lock, so a member can share their
          city and salary expectation with recruiters while keeping their
          address and age to themselves. All three start locked. */}
      <DetailSection
        title="Personal details"
        hint="All locked by default. Unlock only what you want other members to see."
      >
        <PrivateHint>Stored for matching. Nothing here is shown unless you unlock it.</PrivateHint>

        <TextField
          label="Home address"
          value={v.homeAddress}
          onChange={(homeAddress) => set({ homeAddress })}
          placeholder="Flat, street, area"
        />
        <LockRow
          label="Show my address to other members"
          locked={!v.showAddress}
          onChange={(open) => set({ showAddress: open })}
        />

        <div>
          <label className={labelCx}>Date of birth</label>
          <input
            type="date"
            className={fieldCx}
            value={v.dateOfBirth}
            onChange={(e) => set({ dateOfBirth: e.target.value })}
          />
          <p className="mt-1 text-xs text-muted">
            Only your age is ever shown, never the exact date.
          </p>
        </div>
        <LockRow
          label="Show my age to other members"
          locked={!v.showAge}
          onChange={(open) => set({ showAge: open })}
        />

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Current salary (₹/year)"
            value={v.salaryCurrent}
            onChange={(salaryCurrent) => set({ salaryCurrent: salaryCurrent.replace(/\D/g, '').slice(0, 9) })}
            placeholder="e.g. 900000"
          />
          <TextField
            label="Expected salary (₹/year)"
            value={v.salaryExpected}
            onChange={(salaryExpected) => set({ salaryExpected: salaryExpected.replace(/\D/g, '').slice(0, 9) })}
            placeholder="e.g. 1400000"
          />
        </div>
        <LockRow
          label="Show my salary details to other members"
          locked={!v.showSalary}
          onChange={(open) => set({ showSalary: open })}
        />
      </DetailSection>

      <DetailSection title="Private to you">
        <PrivateHint>Stored for matching, never shown on your public profile.</PrivateHint>
        <TextField
          label="Notice period / when you could join"
          value={v.noticePeriod}
          onChange={(noticePeriod) => set({ noticePeriod })}
          placeholder="e.g. 2 months"
        />
        <TagField
          label="Preferred locations"
          values={v.preferredLocations}
          onChange={(preferredLocations) => set({ preferredLocations })}
          placeholder="Bengaluru, Hyderabad, Remote"
          max={10}
        />
        <TagField
          label="What you want mentorship in"
          values={v.seekingMentorshipIn}
          onChange={(seekingMentorshipIn) => set({ seekingMentorshipIn })}
          placeholder="Cloud architecture, Managing a team"
        />
      </DetailSection>
    </div>
  )
}
