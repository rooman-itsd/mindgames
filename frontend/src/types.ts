// Domain model for Root Connect — the Rooman Alumni Network.
// All app state is mock data held in React context (see store/AppStore.tsx).

export type PostType =
  | 'Update'
  | 'Hiring'
  | 'Open to Work'
  | 'Mentorship'
  | 'StartupVarsity'
  // Peer-to-peer News & Updates formats (published from the News tab).
  | 'Achievement'
  | 'Project'
  | 'Article'
  | 'Meetup'

// The four member-authored formats that appear in the News & Updates tab.
export const NEWS_TYPES: PostType[] = ['Achievement', 'Project', 'Article', 'Meetup']

// Category tags for Industry Articles & Blogs.
export const ARTICLE_CATEGORIES = [
  'AI/ML',
  'DevOps',
  'Cloud',
  'Cybersecurity',
  'Web Dev',
  'Data',
  'Career Guidance',
  'Product',
  'General',
] as const

// "What are you looking for?" tags on a Startup / Side-Project post.
export const PROJECT_SEEKING = [
  'Seeking Testers',
  'Looking for Co-founders',
  'Looking for Contributors',
  'Feedback welcome',
] as const

export const POST_TYPES: PostType[] = ['Update', 'Hiring', 'Open to Work', 'Mentorship', 'StartupVarsity']

export type Domain =
  | 'Cloud'
  | 'AI/ML'
  | 'Cybersecurity'
  | 'DevOps'
  | 'Data'
  | 'Web Dev'
  | 'Mobile'
  | 'UI/UX'

export const DOMAINS: Domain[] = [
  'Cloud',
  'AI/ML',
  'Cybersecurity',
  'DevOps',
  'Data',
  'Web Dev',
  'Mobile',
  'UI/UX',
]

export type EmploymentType =
  | 'Employed'
  | 'Freelancer'
  | 'Entrepreneur'
  | 'Looking for opportunity'
  | 'Student'
  | 'Just looking around'

export const EMPLOYMENT_TYPES: EmploymentType[] = [
  'Employed',
  'Freelancer',
  'Entrepreneur',
  'Looking for opportunity',
  'Student',
  'Just looking around',
]

// The three sub-types that count as "currently working" — shown with
// Company/Designation fields during onboarding/profile editing.
export const WORKING_EMPLOYMENT_TYPES: EmploymentType[] = ['Employed', 'Freelancer', 'Entrepreneur']

// Top-level status asked first during onboarding; drives which fields show.
// Not stored directly — it's derived from / mapped onto `employmentType`.
export type CurrentStatus = 'Working Professional' | 'Student' | 'Looking for opportunity' | 'Just looking around'

export function statusOf(employmentType: EmploymentType | ''): CurrentStatus | '' {
  if (employmentType === '') return ''
  if ((WORKING_EMPLOYMENT_TYPES as string[]).includes(employmentType)) return 'Working Professional'
  if (employmentType === 'Student') return 'Student'
  if (employmentType === 'Looking for opportunity') return 'Looking for opportunity'
  return 'Just looking around'
}

export type Visibility = 'All Alumni' | 'My Network' | 'Specific Community'

export type ProfileTag =
  | 'Mentor'
  | 'Hiring'
  | 'Open to Work'
  | 'Willing to give referral'
  | 'Need mentorship'

export const PROFILE_TAGS: ProfileTag[] = [
  'Mentor',
  'Hiring',
  'Open to Work',
  'Willing to give referral',
  'Need mentorship'
]

export type TagVerificationStatus = 'verified' | 'unverified' | 'flagged'

// ---------------------------------------------------------------------------
// Rich profile detail. These are the structures a resume parse produces and
// that the profile editors let the member correct afterwards — the uploaded
// file itself is never kept, only this extracted JSON.
// ---------------------------------------------------------------------------

export interface ExperienceEntry {
  role: string
  company: string
  period: string // like "2022 — Present"
  summary: string
}

export interface EducationEntry {
  degree: string
  institution: string
  year: string
  score?: string // CGPA / percentage, as written
}

export interface ProjectEntry {
  title: string
  description: string
  link?: string
  tech: string[]
}

export interface CertificationEntry {
  name: string
  issuer: string
  year: string
}

export interface AchievementEntry {
  title: string
  year: string
}

export interface ProfileLink {
  label: string
  url: string
}

export type WorkMode = 'Remote' | 'Hybrid' | 'Onsite'
export const WORK_MODES: WorkMode[] = ['Remote', 'Hybrid', 'Onsite']

export type MentorshipMode = 'Call' | 'Chat' | 'In-person'
export const MENTORSHIP_MODES: MentorshipMode[] = ['Call', 'Chat', 'In-person']

export type StartupIntent =
  | 'Have an idea'
  | 'Building something'
  | 'Want to join a startup'
  | 'Just curious'

export const STARTUP_INTENTS: StartupIntent[] = [
  'Have an idea',
  'Building something',
  'Want to join a startup',
  'Just curious',
]

export const STARTUP_LOOKING_FOR = [
  'Co-founder',
  'Funding',
  'Mentor',
  'Team members',
  'Early users',
] as const

// ---------------------------------------------------------------------------
// Profile banner theme — the "cover photo" colour for a member's own profile
// hero. A curated palette rather than a free colour picker: the base stays
// near-black for every theme so name/badge contrast never breaks, only the
// three accent glows change, which keeps every profile on-brand regardless
// of what a member picks. 'sunrise' reproduces the original hardcoded look
// pixel-for-pixel, so nobody who never touches this setting sees any change.
// ---------------------------------------------------------------------------

export interface BannerTheme {
  id: string
  label: string
  /** Three accent colours, outer-to-inner, laid over a fixed near-black base. */
  colors: readonly [string, string, string]
}

export const BANNER_THEMES: readonly BannerTheme[] = [
  { id: 'sunrise', label: 'Sunrise', colors: ['#ff6534', '#ff4500', '#7c2d12'] },
  { id: 'midnight', label: 'Midnight', colors: ['#3b82f6', '#0ea5e9', '#1e3a8a'] },
  { id: 'forest', label: 'Forest', colors: ['#22c55e', '#15803d', '#052e16'] },
  { id: 'plum', label: 'Plum', colors: ['#a855f7', '#7c3aed', '#2e1065'] },
  { id: 'slate', label: 'Slate', colors: ['#94a3b8', '#64748b', '#1e293b'] },
] as const

export const DEFAULT_BANNER_THEME = 'sunrise'

function findBannerTheme(id?: string): BannerTheme {
  return BANNER_THEMES.find((t) => t.id === id) ?? BANNER_THEMES[0]
}

/** The three-wash radial-gradient CSS for a banner theme, ready for `style.background`. */
export function bannerThemeGradient(id?: string): string {
  const [c1, c2, c3] = findBannerTheme(id).colors
  return (
    `radial-gradient(120% 140% at 8% 0%, ${c1} 0%, transparent 55%),` +
    `radial-gradient(90% 120% at 95% 20%, ${c2} 0%, transparent 60%),` +
    `radial-gradient(80% 100% at 60% 120%, ${c3} 0%, transparent 70%)`
  )
}

/** The theme's leading accent, for the drifting glow blob's fill colour. */
export function bannerThemeGlow(id?: string): string {
  return findBannerTheme(id).colors[0]
}

// Broader than `Domain` (which is the Rooman training track). Used by the
// Companies page filter and by people-matching.
export const INDUSTRIES = [
  'IT Services',
  'Product / SaaS',
  'Fintech',
  'E-commerce',
  'Healthcare',
  'EdTech',
  'Consulting',
  'Manufacturing',
  'Telecom',
  'Government / PSU',
  'Media',
  'Other',
] as const

export interface User {
  id: string
  name: string
  // Contact details are private by default: '' / undefined on another
  // member's profile unless they opted in. Always populated on your own.
  email: string
  phone?: string
  /** Opt-ins that publish the two fields above. */
  showEmail?: boolean
  showPhone?: boolean

  // --- Sensitive personal details -----------------------------------------
  // Stored for matching, private by default, each individually lockable.
  // Absent on another member's profile unless they opened that lock.
  homeAddress?: string
  /** YYYY-MM-DD. Owner-only — never published, even when `age` is. */
  dateOfBirth?: string
  /** Derived from dateOfBirth. Publishable on its own. */
  age?: number
  salaryCurrent?: number
  salaryExpected?: number
  showAddress?: boolean
  showAge?: boolean
  showSalary?: boolean
  // Small data-URL profile photo; absent → initials avatar.
  photo?: string | null
  // Status tag shown on the profile header (legacy single tag).
  profileTag?: ProfileTag | null
  // Multiple selectable tags on profile
  profileTags?: ProfileTag[]
  // Verification status for each tag
  profileTagsVerified?: Record<ProfileTag, TagVerificationStatus>
  // Set once the user clicks the verification link emailed at signup.
  emailVerified?: boolean
  // True on an invite-created account until the member replaces the password
  // that was generated and emailed to them. Prompts, never blocks.
  mustChangePassword?: boolean
  avatar: string // initials-based color seed; rendered by <Avatar>
  batchYear: number
  course: string
  company: string
  designation: string
  // Current institution name — only meaningful when employmentType is 'Student'.
  college?: string
  experienceYears: number
  domain: Domain
  employmentType: EmploymentType
  city: string
  bio: string
  linkedin?: string
  expertise: string[]
  willingToMentor: boolean
  interestedInStartup: boolean
  connectionsCount: number
  isMentor: boolean
  mentorRate?: number // ₹ / hr
  sessionsConducted?: number
  // --- Rich profile detail (resume-parseable) ------------------------------
  // Full work history. `company`/`designation` above stay the quick-display
  // snapshot of the current role; this is the timeline shown on the profile.
  experience?: ExperienceEntry[]
  education?: EducationEntry[]
  projects?: ProjectEntry[]
  certifications?: CertificationEntry[]
  achievements?: AchievementEntry[]
  languagesKnown?: string[]
  github?: string
  portfolio?: string
  otherLinks?: ProfileLink[]
  industry?: string

  // --- Preferences ---------------------------------------------------------
  /** Cover colour on the member's own profile hero. Defaults to 'sunrise'.
   *  Ignored when bannerImage is set — an uploaded photo takes over the whole
   *  banner instead of the gradient. */
  bannerTheme?: string
  /** Custom cover photo (data URL). Overrides bannerTheme entirely when present. */
  bannerImage?: string | null
  workMode?: WorkMode
  openToRelocate?: boolean
  interests?: string[]
  openToSpeakAtEvents?: boolean
  // Rooman branch/centre the member trained at — free text, drives local meetups.
  roomanCenter?: string

  // --- Mentorship (collected only when willingToMentor is on) --------------
  // Mentoring is gated on ADMIN-VERIFIED proof — see MentorApplication below
  // and mentorEligibility() in lib/profileCompleteness. Nothing the member can
  // type into their own profile qualifies them.
  mentorVerified?: boolean
  mentorAssessmentScore?: number
  mentorAssessmentProvider?: string
  mentorTopics?: string[]
  mentorAvailability?: string
  mentorshipMode?: MentorshipMode

  // --- Referrals & hiring --------------------------------------------------
  openToReferrals?: boolean
  referralNote?: string
  hiringFor?: string[]

  // --- StartupVarsity (collected only when interestedInStartup is on) ------
  startupIntent?: StartupIntent
  startupLookingFor?: string[]

  // --- Private: stored, but only ever rendered on the owner's own profile ---
  // `phone` above is private in the same way.
  noticePeriod?: string
  preferredLocations?: string[]
  seekingMentorshipIn?: string[]

  // Verified employer: confirmed a work email → allowed to post jobs.
  employerVerified?: boolean
  workEmailDomain?: string
  // Trust score: based on connections, account age, verification status
  trustScore?: number
  // Reports against this user (for flagging)
  reportCount?: number
  isAdmin?: boolean
}

/**
 * The body of a PATCH /api/users/me.
 *
 * Wider than `Partial<User>` in exactly the five places the API accepts an
 * explicit "clear this" value that a loaded `User` never holds: '' for the
 * three enum-backed TEXT columns (which are NOT NULL DEFAULT ''), and null for
 * the two nullable salary columns.
 *
 * The route drops every `undefined` field before building its UPDATE, so a
 * cleared field has to travel as '' / null — sending `undefined` leaves the
 * old value in the database.
 */
export type ProfilePatch = Omit<
  Partial<User>,
  'workMode' | 'mentorshipMode' | 'startupIntent' | 'salaryCurrent' | 'salaryExpected'
> & {
  workMode?: WorkMode | ''
  mentorshipMode?: MentorshipMode | ''
  startupIntent?: StartupIntent | ''
  salaryCurrent?: number | null
  salaryExpected?: number | null
}

// True until the member finishes the onboarding wizard. The wizard can't be
// completed without a course, so an empty course means setup never finished.
export function needsOnboarding(user: Pick<User, 'course' | 'isAdmin'>): boolean {
  return !user.isAdmin && !user.course
}

export interface Comment {
  id: string
  authorId: string
  text: string
  createdAt: string // ISO
}

export interface Post {
  id: string
  authorId: string
  type: PostType
  content: string
  image?: string
  createdAt: string // ISO
  likes: number
  likedByMe: boolean
  // Emoji reactions: counts per emoji + the current user's own reaction (if any).
  reactions?: Record<string, number>
  myReaction?: string
  saved: boolean
  comments: Comment[]
  visibility: Visibility
  communityId?: string
  // Set when this post is an update/recap tied to an event (host or admin only).
  eventId?: string
  // Tags
  domain?: Domain
  city?: string
  batch?: number
  // Hiring / role specific
  role?: string
  company?: string
  // What the poster wants every applicant to answer (Hiring posts).
  questions?: string[]
  // Whether applicants must attach a resume (Hiring posts).
  wantsResume?: boolean
  // Hiring posts: false = closed, not accepting applications.
  active?: boolean
  appliedByMe?: boolean
  applicantsCount?: number
  // Pinned Rooman announcement (set from the Admin panel)
  pinned?: boolean
  // Structured fields for the peer-to-peer News formats (Achievement, Project,
  // Article, Meetup). Which fields are set depends on `type`.
  meta?: PostMeta
}

// Format-specific fields for News posts. `content` always holds the main body
// (the article text, the announcement, etc.); these are the extra structured
// bits each format collects.
export interface PostMeta {
  // Alumni Achievement / Career Update
  jobTitle?: string
  achievementCompany?: string
  collaborators?: string[] // names of alumni who helped / collaborated
  // Startup / Side-Project Announcement
  projectName?: string
  demoLink?: string
  techStack?: string[]
  seeking?: string // one of PROJECT_SEEKING
  // Industry Article / Blog
  title?: string
  category?: string // one of ARTICLE_CATEGORIES
  // Community Event / Local Meetup
  date?: string
  location?: string
  rsvpLink?: string
  capacity?: number
}

// A member who applied to a Hiring post (poster-only view).
export interface JobApplicant {
  id: string
  name: string
  photo?: string | null
  designation: string
  company: string
  city: string
  // Question+answer pairs snapshotted at apply time.
  answers: { q: string; a: string }[]
  // Filename of the attached resume (null when none was attached).
  resumeName: string | null
  appliedAt: string // ISO
}

// An alumni meetup, webinar or reunion with RSVPs.
export interface AppEvent {
  id: string
  creatorId: string
  title: string
  description: string
  location: string
  meetingLink?: string
  startsAt: string // ISO
  // pending = awaiting admin acceptance (visible only to its host).
  status?: 'pending' | 'approved' | 'rejected'
  // Paid (ticketed) event + price in whole rupees. Payment is collected offline.
  isPaid?: boolean
  price?: number
  // Max confirmed RSVPs; undefined = unlimited. Extra RSVPs waitlist.
  capacity?: number
  // Speakers/agenda contributors, shown in the quick-view drawer.
  speakers: { name: string; bio: string }[]
  rsvpCount: number
  waitlistCount: number
  rsvpedByMe: boolean
  waitlistedByMe: boolean
  // Feedback (ratings), only collectible once the event has started.
  avgRating?: number
  feedbackCount: number
  feedbackByMe: boolean
  attendeeIds: string[]
}

// Admin review queue entry for events.
export interface PendingEvent extends AppEvent {
  creatorName: string
}

// An attendee, as shown in an event's quick-view drawer. `waitlisted` = past
// the capacity cap and not yet promoted (shown separately from confirmed).
export interface EventAttendee {
  id: string
  name: string
  designation: string
  photo?: string
  waitlisted: boolean
}

// One attendee's rating + comment (host/admin view of an event's feedback).
export interface EventFeedbackEntry {
  userId: string
  name: string
  photo?: string
  rating: number
  comment: string
  createdAt: string // ISO
}

// A computed profile achievement.
export interface Badge {
  id: string
  emoji: string
  label: string
  description: string
  earned: boolean
}

export type CommunityCategory = 'Domain' | 'City' | 'Batch' | 'General'

export interface Community {
  id: string
  name: string
  description: string
  category: CommunityCategory
  tag: string // e.g. 'Cloud', 'Bangalore', '2018'
  memberCount: number
  joined: boolean
  color: string // tailwind gradient seed
  /** pending = awaiting admin acceptance (visible only to its creator). */
  status?: 'pending' | 'approved' | 'rejected'
  createdBy?: string
}

// Admin review queue entry.
export interface PendingCommunity extends Community {
  creatorName: string
}

export interface CompanyAlumnusPreview {
  id: string
  name: string
  photo?: string
}

export interface Company {
  id: string
  name: string
  domain?: string
  logoUrl?: string
  industry: string
  alumniCount: number
  previewAlumni: CompanyAlumnusPreview[]
  savedByMe: boolean
}

export interface CompanyAlumnus {
  id: string
  name: string
  photo?: string
  role: string
  location: string
  journey: string
  mutualConnections: number
}

export interface CompanyDetail extends Company {
  alumni: CompanyAlumnus[]
}

// ---------------------------------------------------------------------------
// "Companies for you" — the company-side aggregates that GET /companies/for-you
// returns alongside each company. Mirrors mapCompanySignals in the backend's
// mappers.ts; a rename there without a rename here silently yields undefined.
//
// Everything in here describes the COMPANY, never the viewer. How well a
// company fits *you* is computed in lib/companyMatch.ts from these plus your
// own profile, so the scoring rules live in one readable place.
// ---------------------------------------------------------------------------
export interface SkillFrequency {
  skill: string
  holders: number
}

export interface NamedFrequency {
  name: string
  holders: number
}

export interface CountedValue {
  count: number
}

export interface CompanySignals {
  /** Skills held by alumni there, most-held first. */
  topSkills: SkillFrequency[]
  topCertifications: NamedFrequency[]
  cities: (CountedValue & { city: string })[]
  domains: (CountedValue & { domain: string })[]
  /** Roles named by active Hiring posts for this company. */
  hiringRoles: (CountedValue & { role: string })[]
  /** Median years of experience among alumni; undefined when nobody has said. */
  medianExperience?: number
  referralOpen: number
  mentorCount: number
  roadmapCount: number
  connectedAlumni: number
  /** Alumni the aggregates were computed from — drives match confidence. */
  sampleSize: number
}

export interface CompanyWithSignals extends Company {
  signals: CompanySignals
}

// ---------------------------------------------------------------------------
// Roadmaps — how one alumnus got into a company.
// ---------------------------------------------------------------------------

/** One stop on a career timeline, derived from the member's own profile. */
export interface RoadmapStep {
  role: string
  company: string
  period: string
  summary: string
  /** True for the stop at the company whose page this is shown on. */
  atThisCompany: boolean
}

/** An extra step the contributor wrote, beyond what their timeline shows. */
export interface RoadmapStage {
  title: string
  detail: string
}

export interface CompanyRoadmap {
  userId: string
  name: string
  photo?: string
  currentRole: string
  city: string
  course: string
  batchYear: number
  experienceYears: number
  skills: string[]
  steps: RoadmapStep[]
  certifications: CertificationEntry[]
  isMentor: boolean
  mentorTopics: string[]
  openToReferrals: boolean
  mutualConnections: number
  /** True once they have written something beyond the derived timeline. */
  contributed: boolean
  roleGoal: string
  headline: string
  stages: RoadmapStage[]
  advice: string
  /** ISO timestamp of their last edit; absent for a derived-only timeline. */
  updatedAt?: string
}

export interface CompanyRoadmaps {
  /** The same aggregates the match score uses — drives the gap checklist. */
  signals: CompanySignals
  roadmaps: CompanyRoadmap[]
  /** The viewer's own, when they work here — null otherwise. */
  mine: CompanyRoadmap | null
  canContribute: boolean
  alreadyAsked: boolean
  /** How many alumni an ask would reach; 0 hides the button. */
  eligibleToAsk: number
}

// requested → (mentor accepts) upcoming → (mentor completes) past; or declined.
export type SessionStatus = 'requested' | 'upcoming' | 'declined' | 'past'

export interface MentorshipSession {
  id: string
  mentorId: string
  menteeId: string
  menteeName: string
  topic: string
  date: string // human readable
  time: string
  status: SessionStatus
  // Shared by the mentor on acceptance (Meet/Zoom/…).
  meetingLink?: string
  // Mentee's post-session rating (1-5), once given.
  rating?: number
  // Beyond the free allowance, a session is paid at the mentor's rate (₹).
  isPaid?: boolean
  price?: number
  /** Who asked for it. 'mentee' is the usual booking flow (waiting on the
   *  mentor to accept); 'mentor' is a mentor-offered slot, waiting on the
   *  mentee instead — which decides who sees Accept/Decline. */
  requestedBy?: 'mentor' | 'mentee'
  /** The mutual-confirmation pair. A session only counts toward either
   *  profile's stats once both are true; these are what tell the UI whose
   *  confirmation is still outstanding. */
  menteeConfirmed?: boolean
  mentorConfirmed?: boolean
  /** How many career_resources rows are attached to this session — lets a
   *  session list decide whether to show a "Resources" button at all,
   *  without a per-session fetch. */
  resourceCount?: number
  /** The real scheduled instant, when one was set. Older sessions only have
   *  the date/time display labels above. */
  scheduledAt?: string
}

// A mentee's first N mentorship sessions are free; the rest are paid.
// Keep in sync with FREE_SESSIONS in backend/src/routes/mentorship.routes.ts.
export const FREE_MENTORSHIP_SESSIONS = 3

export type StartupStage = 'Idea' | 'MVP' | 'Early Revenue' | 'Scaling'

export interface Startup {
  id: string
  founderId: string
  name: string
  domain: Domain
  stage: StartupStage
  teamSize: number
  description: string
  // 'network' = visible to everyone; 'admin' = confidential (admins + founder only).
  visibility?: 'network' | 'admin'
}

// Admin review view: application + founder contact details.
export interface StartupApplication extends Startup {
  founderName: string
  founderEmail: string
  founderPhone?: string
  appliedAt: string // ISO
}

export type NotificationType =
  | 'connection'
  | 'like'
  | 'comment'
  | 'job'
  | 'mentorship'
  | 'community'
  | 'announcement'
  | 'event'
  | 'message'

// What a notification is ABOUT. Mirrors the CHECK on notifications.target_type
// in schema.sql; a value here with no entry in lib/notificationLink.ts simply
// falls back to the per-type route, so the two can be extended independently.
export type NotificationTargetType =
  | 'post'
  | 'event'
  | 'community'
  | 'user'
  | 'company'
  | 'startup'
  | 'session'
  | 'conversation'
  | 'resource'
  | 'assignment'
  | 'learning_share'
  | 'learning_topic'
  | 'learning_session'

export interface AppNotification {
  id: string
  type: NotificationType
  text: string
  createdAt: string // ISO
  read: boolean
  actorId?: string
  /** Both present or both absent — see mapNotification in the backend. */
  targetType?: NotificationTargetType
  targetId?: string
}

export interface MessageThread {
  id: string
  withUserId: string
  lastMessage: string
  unread: number
  messages: {
    id: string
    fromMe: boolean
    text: string
    time: string
    createdAt: string
    editedAt?: string
    attachment?: { name: string; type: string }
  }[]
}

// Connection state between the current user and others.
export type ConnectionState = 'none' | 'pending' | 'connected'

// --- CSV import (Admin) -----------------------------------------------------
// Kept for the Admin invite uploader (see lib/csv.ts).
export interface ContactRow {
  name: string
  phone: string
  email: string
  valid: boolean
}

// --- Backend-aligned shapes (Admin + OAuth/invite flow) ---------------------
// These mirror backend/src/data.ts and are consumed by the teammate's
// invitation + auth code via lib/api.ts. Kept intact so that logic is untouched.
export type StatusTag = 'Ready to work' | 'Working' | 'Can mentor' | 'Need mentoring'

export const STATUS_TAGS: StatusTag[] = ['Ready to work', 'Working', 'Can mentor', 'Need mentoring']

export type InviteStatus = 'sent' | 'failed' | 'simulated'

/**
 * The invite email one recipient was sent. `exact` false means it was
 * reconstructed from the current template because this send predates keeping
 * a copy — the wording may differ from what actually went out.
 *
 * The password is always redacted: it's hashed at account creation and never
 * stored readable, so it can't be shown back.
 */
export interface SentInviteEmail {
  name: string
  email: string
  subject: string
  body: string
  exact: boolean
  invitedAt: string | null
  inviteStatus: InviteStatus | null
  inviteError: string | null
  inviteCount: number
  inviteLink: string
  passwordRedacted: string
}

export interface Alumni {
  id: string
  name: string
  phone: string
  email: string
  role: string
  batchYear: number
  statusTags: StatusTag[]
  /** When the last invite went out; null if never invited. */
  invitedAt: string | null
  /** Outcome of that send. null = never attempted. */
  inviteStatus: InviteStatus | null
  /** Why delivery failed, when it did. */
  inviteError: string | null
  /** How many times an invite has been sent to this address. */
  inviteCount: number
  /** Which import this person arrived in. '' = predates batch tracking. */
  batch: string
  /** The sign-in link that was emailed (address pre-filled). */
  inviteLink: string
  /** Whether an account exists for this address yet. */
  hasAccount: boolean
  /** False while they're still using the password we generated for them. */
  passwordChanged: boolean
  /** When they last signed in. null = no login was recorded (which is not the
   *  same as never — see everActive). */
  lastLoginAt: string | null
  /** Has demonstrably used the account, even with no login timestamp: you
   *  can't onboard or edit a profile without signing in. Distinguishes
   *  "signed in before we tracked it" from "genuinely never turned up". */
  everActive: boolean
}

/**
 * Admin-editable copy for the invite email (which carries an invited member's
 * generated credentials). `isCustom` false means the built-in default is in
 * force and there is nothing stored to reset.
 */
export interface InviteEmailTemplate {
  subject: string
  body: string
  isCustom: boolean
  updatedAt: string | null
  defaults: { subject: string; body: string }
  /** Substitution tokens the body understands, e.g. 'name' → {{name}}. */
  placeholders: string[]
  /** Of those, the ones an invite is unusable without. */
  required: string[]
  /** Worked example values, so the editor can preview realistic output. */
  sample: Record<string, string>
}

export interface Experience {
  role: string
  company: string
  period: string
  summary: string
}

export interface ResumeParseResult {
  name: string
  email: string
  phone: string
  linkedin: string
  city: string
  headline: string
  bio: string
  batchYear: string
  course: string
  experienceYears: string
  domain: string
  employmentType: string
  // Current college/institution name — only populated when employmentType is 'Student'.
  college: string
  experience: Experience[]
  skills: string[]
  // Rich detail. The uploaded file is discarded after parsing; this extracted
  // JSON is what gets stored on the profile, editable by the member afterwards.
  education: EducationEntry[]
  projects: ProjectEntry[]
  certifications: CertificationEntry[]
  achievements: AchievementEntry[]
  languagesKnown: string[]
  interests: string[]
  github: string
  portfolio: string
  industry: string
  // 'ai' = real Claude extraction; 'fallback' = server demo data (no API key).
  source: 'ai' | 'fallback'
}

// ---------------------------------------------------------------------------
// Mentor verification. The member claims ONE requirement, attaches evidence,
// and an admin approves or declines it.
// ---------------------------------------------------------------------------

export type MentorClaim = 'experience' | 'postgrad' | 'assessment'

export const MENTOR_CLAIM_LABELS: Record<MentorClaim, string> = {
  experience: '2+ years of professional experience',
  postgrad: 'A postgraduate degree (Masters or above)',
  assessment: 'A passed mentor assessment (60% or above)',
}

/** What we ask people to attach for each claim. */
export const MENTOR_CLAIM_PROOF_HINTS: Record<MentorClaim, string> = {
  experience: 'A work experience certificate, or the front of your office ID card.',
  postgrad: 'Your degree certificate, provisional certificate, or final marksheet.',
  assessment: 'Your assessment result or score report.',
}

/**
 * Claims a member cannot pick yet. The Hire AI assessment isn't live, so there
 * is no way for anyone to hold a result for it — the option is shown as
 * "Coming soon" rather than hidden, so the route to verification is visible.
 *
 * The backend deliberately still accepts these: an admin can already record a
 * score directly (POST /api/mentorship/assessment), and this list is only
 * about what the member-facing form offers today. Empty it to go live.
 */
export const MENTOR_CLAIMS_COMING_SOON: MentorClaim[] = ['assessment']

export interface MentorApplicationDoc {
  id: string
  name: string
  type: string
}

export interface MentorApplication {
  userId: string
  status: 'pending' | 'approved' | 'declined'
  claim?: MentorClaim
  note?: string
  /** Why an admin declined it — shown to the member so they can resubmit. */
  reviewNote?: string
  updatedAt: string
  documents: MentorApplicationDoc[]
}

// Light-theme styling for status tags (Admin directory pills).
export const STATUS_STYLES: Record<StatusTag, string> = {
  'Ready to work': 'bg-green-100 text-green-700',
  Working: 'bg-blue-100 text-blue-700',
  // Mentoring reads in marigold so it never blurs into the green "Ready to work";
  // the amber that used to sit next to it moved to violet for the same reason.
  'Can mentor': 'bg-marigold-100 text-marigold-800',
  'Need mentoring': 'bg-violet-100 text-violet-700',
}

// --- Shared styling maps ----------------------------------------------------

// Emoji reactions available on every post. Order = display order in the picker.
export const REACTIONS = ['👍', '🎉', '❤️'] as const
export type ReactionEmoji = (typeof REACTIONS)[number]

export const POST_TYPE_STYLES: Record<PostType, { label: string; classes: string }> = {
  Update: { label: 'Update', classes: 'bg-gray-100 text-gray-600' },
  Hiring: { label: 'Hiring', classes: 'bg-green-100 text-green-700' },
  'Open to Work': { label: 'Open to Work', classes: 'bg-blue-100 text-blue-700' },
  // Marigold, not the forest brand: green already means Hiring.
  Mentorship: { label: 'Mentorship', classes: 'bg-marigold-100 text-marigold-800' },
  StartupVarsity: { label: 'StartupVarsity', classes: 'bg-purple-100 text-purple-700' },
  Achievement: { label: 'Achievement', classes: 'bg-pink-100 text-pink-700' },
  Project: { label: 'Project', classes: 'bg-indigo-100 text-indigo-700' },
  Article: { label: 'Article', classes: 'bg-sky-100 text-sky-700' },
  Meetup: { label: 'Meetup', classes: 'bg-rose-100 text-rose-700' },
}

// --- Career Guidance --------------------------------------------------------
// The assessment → AI roadmap → alumni/services flow. Mirrors what
// backend/src/mappers.ts emits and what career.routes.ts accepts.

/** Must stay in sync with SERVICE_TYPES in backend/src/routes/career.routes.ts
 *  and the CHECK constraint on alumni_services.service_type. */
export const SERVICE_TYPES = [
  'career_guidance', 'resume_review', 'interview_preparation', 'technical_mentoring',
  'project_guidance', 'industry_guidance', 'career_transition', 'freelance_consulting',
  'portfolio_review', 'linkedin_review', 'mock_interview', 'code_project_review',
  'startup_business_guidance', 'domain_specific_advice',
] as const
export type ServiceType = (typeof SERVICE_TYPES)[number]

export const SERVICE_LABELS: Record<ServiceType, string> = {
  career_guidance: 'Career guidance',
  resume_review: 'Resume review',
  interview_preparation: 'Interview preparation',
  technical_mentoring: 'Technical mentoring',
  project_guidance: 'Project guidance',
  industry_guidance: 'Industry guidance',
  career_transition: 'Career transition',
  freelance_consulting: 'Freelance consulting',
  portfolio_review: 'Portfolio review',
  linkedin_review: 'LinkedIn/profile review',
  mock_interview: 'Mock interview',
  code_project_review: 'Code/project review',
  startup_business_guidance: 'Startup/business guidance',
  domain_specific_advice: 'Domain-specific advice',
}

/** The four groupings the assessment presents services under. Derived from
 *  service_type in code rather than stored per row — the grouping is a fixed
 *  property of the type, not data about an individual service. */
export const SERVICE_CATEGORIES: { label: string; types: ServiceType[] }[] = [
  { label: 'Career & Direction', types: ['career_guidance', 'industry_guidance', 'career_transition'] },
  { label: 'Getting Hired', types: ['resume_review', 'interview_preparation', 'mock_interview', 'linkedin_review', 'portfolio_review'] },
  { label: 'Skills & Projects', types: ['technical_mentoring', 'project_guidance', 'code_project_review'] },
  { label: 'Business & Independent Work', types: ['startup_business_guidance', 'freelance_consulting', 'domain_specific_advice'] },
]

export const CURRENT_SITUATIONS = [
  'Student', 'Fresher', 'Working professional', 'Looking for a job',
  'Career break', 'Freelancer', 'Entrepreneur', 'Other',
] as const

export const CAREER_GOALS = [
  { value: 'first_job', label: 'Get my first job' },
  { value: 'switch_career', label: 'Switch career' },
  { value: 'switch_domain', label: 'Switch domain' },
  { value: 'get_promoted', label: 'Get promoted' },
  { value: 'become_specialist', label: 'Become a specialist' },
  { value: 'move_into_management', label: 'Move into management' },
  { value: 'start_freelancing', label: 'Start freelancing' },
  { value: 'start_business', label: 'Start a business' },
  { value: 'explore_options', label: 'Explore career options' },
] as const

export const LEARNING_PREFERENCES = [
  'Self-learning', 'Courses', 'Hands-on projects', 'Mentorship',
  'Alumni guidance', 'Community/networking', 'Certifications', 'Real-world experience',
] as const

// `short` is what the roadmap's summary banner shows — the full label is a
// sentence, and a sentence in a three-column fact strip squeezes the rest of
// the row until the goal wraps one word per line.
export const SUPPORT_PREFERENCES = [
  { value: 'free_only', label: 'Free help only', short: 'Free help only' },
  { value: 'free_or_paid', label: 'Free or paid', short: 'Free or paid' },
  { value: 'pay_if_valuable', label: "I'm willing to pay if the value is useful", short: 'Open to paid help' },
] as const

export interface CareerAssessment {
  id: string
  status: 'draft' | 'submitted'
  currentSituation: string
  goalType: string
  targetRole: string
  targetRoleUnsure: boolean
  hoursPerWeek?: number
  timelineMonths?: number
  extraSkillsNote: string
  learningPrefs: string[]
  supportPreference: string
  helpTypes: string[]
  freeText: string
  createdAt: string
  updatedAt: string
}

export type CareerStageStatus = 'upcoming' | 'in_progress' | 'completed' | 'paused'

export interface CareerStage {
  stepKey: string
  title: string
  status: CareerStageStatus
  durationWeeks: number | null
  relevantAlumniIds: string[]
  relevantServiceIds: string[]
}

export interface CareerRoadmap {
  roadmapId: string
  version: number
  status: 'active' | 'archived'
  goal: { currentRole: string; targetRole: string | null }
  timelineMonths: number
  hoursPerWeek: number
  stages: CareerStage[]
  createdAt: string
  /** The live services matched to this roadmap's stages (paused/deleted ones
   *  already dropped). Each stage picks its own by relevantServiceIds.
   *  Optional: the response sent straight after the assessment omits it. */
  stageServices?: AlumniService[]
}

export interface AlumniService {
  id: string
  userId: string
  serviceType: ServiceType
  title: string
  description: string
  tags: string[]
  pricingMode: 'free' | 'paid' | 'custom'
  amount?: number
  pricingUnit?: 'hour' | 'session'
  active: boolean
  createdAt: string
  updatedAt: string
  providerName?: string
  providerPhoto?: string
  providerDesignation?: string
  providerCompany?: string
}

// --- Mentor workspace -------------------------------------------------------

/** Someone this mentor has an accepted session with. */
export interface Mentee {
  id: string
  name: string
  photo?: string
  designation: string
  company: string
  sessions: number
  lastSessionAt: string | null
  hasRoadmap: boolean
  goal: { currentRole?: string; targetRole?: string } | null
}

/** A mentee's roadmap as a mentor sees it — the plan plus what they asked
 *  for in their own words, which is the most useful part before a session. */
export interface MenteeRoadmap extends CareerRoadmap {
  member: { id: string; name: string; designation: string; company: string; photo?: string }
  context: { supportPreference: string; note: string; helpTypes: string[] }
}

/** Public profile record, built only from sessions both sides confirmed. */
export interface ProfileStats {
  sessionsGiven: number
  sessionsTaken: number
  hoursGiven: number
  hoursTaken: number
  avgRating: number | null
  ratingCount: number
  mentorStreakWeeks: number
  learnerStreakWeeks: number
  roadmapProgress: { total: number; completed: number } | null
  eventsAttended: number
  likesGiven: number
  likesReceived: number
  badges: {
    id: string; name: string; description: string; side: string
    /** How hard it is to earn, for display: silver/gold/crimson. */
    tier: 'silver' | 'gold' | 'crimson'
    earnedAt: string
  }[]
}

/** AI briefing a mentor reads before a session — the substance of the
 *  printable report. Generated from the student's plan and own words. */
export interface MenteeBrief {
  summary: string
  strengths: string[]
  gaps: string[]
  focusThisSession: string[]
  questionsToAsk: string[]
  watchOuts: string[]
}

// --- Mentor subscriptions ---------------------------------------------------
// Mirrors backend/src/subscription.ts. A mentor needs an active plan to
// ACCEPT a session; a mentee's free-session allowance is unrelated to this.

export const PLAN_IDS = ['free', 'mentor', 'pro', 'institute'] as const
export type PlanId = (typeof PLAN_IDS)[number]

export interface Plan {
  id: PlanId
  name: string
  price: number
  tagline: string
  sessionsPerMonth: number | null
  serviceLimit: number | null
  invitesPerMonth: number
  platformFeePct: number
  paidEvents: boolean
  features: string[]
  highlighted?: boolean
}

export interface SubscriptionState {
  plan: PlanId
  status: 'inactive' | 'pending' | 'active' | 'expired' | 'cancelled'
  source: 'none' | 'grandfathered' | 'admin' | 'gateway'
  expiresAt: string | null
  canAcceptSessions: boolean
  /** Whether the member currently holds a plan — including a cancelled one
   *  that has not run out yet. Not the same as canAcceptSessions, which is
   *  false once the month's session cap is used up even though the plan is
   *  still very much active. Use this for "do they have a plan" UI. */
  planActive: boolean
  sessionsThisMonth: number
  sessionsPerMonth: number | null
  blockedReason?: string
}

export interface CheckoutSession {
  reference: string
  provider: string
  amount: number
  currency: string
  redirectUrl: string
  /** True when no money moved — the UI must say so rather than imply a charge. */
  simulated: boolean
  clientPayload?: { signature?: string }
}

export interface AdminSubscriptionRow {
  userId: string
  name: string
  email: string
  photo?: string
  designation: string
  company: string
  plan: PlanId
  status: string
  source: string
  expiresAt: string | null
  sessionsThisMonth: number
  subscribed: boolean
}

// One row of a mentor's subscription audit trail — what was requested,
// granted, renewed or failed, and when. Mirrors GET
// /api/subscription/admin/events/:userId.
export interface SubscriptionEvent {
  kind: 'requested' | 'activated' | 'renewed' | 'cancelled' | 'expired' | 'payment_failed'
  plan: string
  amount?: number
  provider?: string
  note: string
  createdAt: string
}

// --- Group sessions ----------------------------------------------------------
// Mirrors backend/src/routes/groupSessions.routes.ts. A mentor hosting many
// mentees at once rather than one — a separate table and flow from a 1:1
// mentorship_sessions row, because capacity/roster don't fit that shape.
// Gated on the plan's groupSessions flag (Pro/Institute), checked at creation.

export interface GroupSession {
  id: string
  mentorId: string
  mentorName: string
  mentorPhoto?: string
  topic: string
  description: string
  domain: string
  scheduledAt: string
  durationMinutes: number
  capacity: number
  attendeeCount: number
  seatsLeft: number
  meetingLink?: string
  pricingMode: 'free' | 'paid'
  pricePerSeat: number
  status: 'scheduled' | 'completed' | 'cancelled'
  /** 'invite_only' is hidden from the public browse list — only the host and
   *  the people invited to it can see or join it. */
  visibility: 'public' | 'invite_only'
  joinedByMe: boolean
  /** True for an invite_only session this member was invited to but hasn't
   *  joined yet — how they find it, since it isn't in the public list. */
  invitedByMe: boolean
  mentorConfirmed: boolean
}

export interface GroupSessionAttendee {
  id: string
  name: string
  photo?: string
  designation: string
  company: string
  joinedAt: string
  confirmed: boolean
}

export interface GroupSessionInput {
  topic: string
  description?: string
  domain?: string
  scheduledAt: string
  durationMinutes?: number
  capacity?: number
  meetingLink?: string
  pricingMode?: 'free' | 'paid'
  pricePerSeat?: number
  visibility?: 'public' | 'invite_only'
  /** Required when visibility is 'invite_only' — validated server-side
   *  against this mentor's accepted connections. */
  inviteeIds?: string[]
}

/** A person surfaced by the roadmap, with the stage that made them relevant. */
export interface AlumniHelper {
  id: string
  name: string
  photo?: string
  designation: string
  company: string
  expertise: string[]
  isMentor: boolean
  reason: string
  similarPath: boolean
}

// Learning resources — what a member is learning from on the way through
// their roadmap. Mirrors mapCareerResource in backend/src/mappers.ts.
//
// `roadmapId`/`stepKey` and `sessionId` are independent and both optional: a
// resource can name a stage, a session, both, or neither.
export type CareerResourceKind = 'article' | 'video' | 'course' | 'book' | 'doc' | 'other'
export type CareerResourceStatus = 'saved' | 'in_progress' | 'done'

export interface CareerResource {
  id: string
  userId: string
  title: string
  url?: string
  note?: string
  kind: CareerResourceKind
  status: CareerResourceStatus
  roadmapId?: string
  stepKey?: string
  /** The title of that stage — for a mentor's assignment, one of the
   *  mentee's own stages. */
  stepTitle?: string
  sessionId?: string
  /** Visible to any signed-in member on the owner's profile, independent of
   *  the stage/session links above — those stay private either way, since
   *  they name the other party to that link. */
  isPublic: boolean
  /** Set by a mentor attaching this resource to a session: the mentee must
   *  come back with a link proving they did it, via submissionUrl below. */
  requiresSubmission?: boolean
  submissionUrl?: string
  submissionAt?: string
  createdAt: string
  updatedAt: string
  /** Who saved it — only meaningful for a resource shared into a session,
   *  where the other party did not create it themselves. */
  ownerName?: string
  ownerPhoto?: string
  sessionTopic?: string
  /** Its session has finished — or, for a direct assignment, the mentee has
   *  submitted against it: what was assigned is a record, so it can't be
   *  deleted or rewritten (status and visibility can still change). */
  sessionLocked?: boolean
  /** Given at or after its session ended: a follow-up, not prep. */
  afterSession?: boolean
  /** This row is the member's saved copy of what an alum shared, and who
   *  shared it — so a saved list can still credit them. */
  shareId?: string
  /** The source share's attached files (a files-only resource has no url). */
  shareFiles?: ShareFile[]
  sharedByName?: string
  /** The member a mentor assigned this to (by session or directly). */
  assignedToId?: string
  assignedToName?: string
  /** Files the mentor attached when assigning it (private to the two). */
  attachments?: ShareFile[]
  /** Files the mentee sent back as their work (with or instead of a link). */
  submissionFiles?: ShareFile[]
}


// ---- Learning hub (Learning Resources page) --------------------------------
// Mirrors mapLearningShare in backend/src/mappers.ts and learning.routes.ts.
// The page's premise: everything here was shared by a member of the network,
// so every item carries the person who shared it and a way to reach them.

/** The Resource Type filter's five values. */
export type ShareKind = 'course' | 'tutorial' | 'doc' | 'project' | 'article'
/** Who a share is for: Everyone, or the sharer's connections ("My connections"). */
export type ShareAudience = 'everyone' | 'connections'
export type ProjectDifficulty = 'beginner' | 'intermediate' | 'advanced'

/** Who shared something — enough to show them and open their profile or chat.
 *  No photo: profile photos are data URLs of up to ~400 KB and these arrive in
 *  lists, so the avatar falls back to initials. */
export interface Sharer {
  id: string
  name: string
  designation: string
  company: string
  isMentor: boolean
}

/** One thing an alum shared for a stage: a resource that helped them, or a
 *  project brief from their real work. */
export interface LearningShare {
  id: string
  kind: ShareKind
  title: string
  /** Null only for a project brief that stands on its description. */
  url: string | null
  /** Their own sentence on why it helped — what makes this a recommendation
   *  rather than a bookmark. */
  whyHelped: string
  /** A project brief's full problem statement — what to build, requirements,
   *  what done looks like. Null for everything else. */
  about: string | null
  /** Skill tags as typed ("LLM/RAG") — every share has at least one. */
  skills: string[]
  difficulty: ProjectDifficulty
  /** Project briefs only. */
  estHours: number | null
  /** How many members pressed "this helped me" — the only standing an item
   *  has on this page. */
  helpedCount: number
  /** Average 1–5 to one decimal (null until rated) and how many members
   *  rated — every "Helped me" carries a rating. Shown as ★ 4.6 (23). */
  rating: number | null
  ratingCount: number
  /** The viewer's own rating, when they pressed Helped me. */
  myRating: number | null
  /** In a stage's list only: filed under this very stage, or Related — close
   *  to it in meaning, shared for a similar stage on another roadmap. */
  match?: 'stage' | 'related'
  audience: ShareAudience
  savedCount: number
  /** Hidden after members reported it — only ever true in the sharer's own
   *  list, to tell them why it stopped appearing for others. */
  hidden: boolean
  sharedBy: Sharer
  iHelped: boolean
  /** The viewer's own saved copy, when they have saved it. */
  mySavedResourceId: string | null
  /** Files attached through Add resource (details only; download by id). */
  files?: ShareFile[]
  createdAt: string
}

/** One file attached to a resource, or an upload waiting in the form. */
export interface ShareFile {
  id: string
  name: string
  mime: string
  size: number
}

/** An alum a member can ask when nobody has shared for their stage yet. */
export interface StageHelper {
  id: string
  name: string
  designation: string
  company: string
  isMentor: boolean
  sharesCount: number
}

export interface LearningStageLite {
  stepKey: string
  title: string
  status: CareerStageStatus
}

export interface LearningRoadmapSummary {
  roadmapId: string
  goal: { currentRole: string; targetRole: string | null }
  timelineMonths: number
  hoursPerWeek: number
  stages: LearningStageLite[]
}

/** The page frame: plan, banner data and the tab counts. Each tab fetches its
 *  own list. */
export interface LearningOverview {
  roadmap: LearningRoadmapSummary | null
  currentStepKey: string | null
  supportPreference: string | null
  counts: { saved: number; assigned: number; shared: number }
}

/** One stage's shares; `alumni` is filled only when nobody has shared yet, so
 *  the member always has someone to ask. */
export interface StageShares {
  stepKey: string | null
  stageTitle?: string
  shares: LearningShare[]
  alumni: StageHelper[]
  /** Members working on this stage — "4 members are on this step". */
  memberCount: number
}

/** A stage this member can share for, and why they can. */
export interface ContributeStage {
  topicKey: string
  stepKey: string | null
  title: string
  /** 'passed' = a stage of their own roadmap they completed; 'role' = a stage
   *  leading to the role they already work in; 'mine' = a stage of their own
   *  roadmap they are on now. Anyone can share for any of them; only passed and
   *  role ones are suggested as 'members are waiting — can you help?'. */
  reason: 'passed' | 'role' | 'mine'
  membersWaiting: number
  sharesCount: number
}

/** A stage a share can be filed under in the share form — one of the
 *  member's own roadmap stages. */
export interface StageOption {
  topicKey: string
  title: string
  membersWaiting: number
  sharesCount: number
}

/** One entry in the Skill / Topic filter: the stored tag, how it displays, and
 *  how many visible shares carry it. */
export interface SkillTag {
  tag: string
  label: string
  count: number
}

/** The All Resources tab's search + Filter-by state. Empty arrays = no filter. */
export interface BrowseFilters {
  q: string
  tags: string[]
  types: ShareKind[]
  difficulty: ProjectDifficulty[]
}


/** Counted on the server over everything the caller can see. */
export interface CareerResourceSummary {
  count: number
  done: number
  byStage: Record<string, { total: number; done: number }>
}

/** A resource as shown on someone ELSE's profile — public only, and
 *  deliberately missing the stage/session/status fields above. Mirrors
 *  mapPublicCareerResource in backend/src/mappers.ts. */
export interface PublicCareerResource {
  id: string
  title: string
  url?: string
  note?: string
  kind: CareerResourceKind
  createdAt: string
}

export interface CareerResourceInput {
  title: string
  url?: string
  note?: string
  kind?: CareerResourceKind
  status?: CareerResourceStatus
  roadmapId?: string
  stepKey?: string
  sessionId?: string
  /** A mentor assigning directly to a member they have had a session with. */
  assignedTo?: string
  isPublic?: boolean
  requiresSubmission?: boolean
  /** Uploads (api.uploadLearningFile) to attach — assigned resources only. */
  fileIds?: string[]
}

/** Admin: a session the mentor completed that still waits on the mentee's
 *  "it happened" — until then it counts toward nobody's stats. Mirrors
 *  mapPendingConfirmation in backend/src/mappers.ts. */
export interface PendingConfirmation {
  id: string
  topic: string
  mentorId: string
  mentorName: string
  menteeId: string
  menteeName: string
  date: string
  completedAt?: string
  remindedAt?: string
}
