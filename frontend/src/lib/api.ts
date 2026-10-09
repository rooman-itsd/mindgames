import type {
  Alumni,
  AlumniHelper,
  AlumniService,
  AppEvent,
  AppNotification,
  Badge,
  AdminSubscriptionRow,
  CareerAssessment,
  CareerRoadmap,
  CareerResource,
  CareerResourceInput,
  CareerResourceSummary,
  ContributeStage,
  LearningShare,
  ShareFile,
  LearningOverview,
  ShareAudience,
  ShareKind,
  BrowseFilters,
  SkillTag,
  StageShares,
  ProjectDifficulty,
  PublicCareerResource,
  CareerStageStatus,
  CheckoutSession,
  Mentee,
  GroupSession,
  GroupSessionAttendee,
  GroupSessionInput,
  MenteeBrief,
  MenteeRoadmap,
  Plan,
  PlanId,
  ProfileStats,
  ServiceType,
  SubscriptionEvent,
  SubscriptionState,
  Comment,
  Community,
  Company,
  CompanyDetail,
  CompanyRoadmaps,
  CompanyWithSignals,
  RoadmapStage,
  ContactRow,
  InviteEmailTemplate,
  InviteStatus,
  SentInviteEmail,
  EventAttendee,
  EventFeedbackEntry,
  JobApplicant,
  MentorshipSession,
  MessageThread,
  PendingCommunity,
  PendingEvent,
  Post,
  ProfilePatch,
  MentorApplication,
  MentorClaim,
  PendingConfirmation,
  ResumeParseResult,
  Startup,
  StartupApplication,
  User,
} from '../types'

export type ChatMessage = MessageThread['messages'][number]

// ---- Token storage ---------------------------------------------------------
const TOKEN_KEY = 'rooman.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable (private mode) */
  }
}

/** An HTTP failure that keeps its status code. `status === 402` means the
 *  action needs a paid plan, which the UI answers by opening the plans. */
export class HttpError extends Error {
  // Declared rather than a constructor parameter property: this project
  // compiles with erasableSyntaxOnly, which disallows those.
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/** True when the server said this action needs a subscription. */
export const isPaymentRequired = (err: unknown): err is HttpError =>
  err instanceof HttpError && err.status === 402

// ---- Low-level fetch --------------------------------------------------------
/** "?after=<id>&afterAt=<createdAt>" for a keyset-paged list, or "" for its
 *  first page. The timestamp lets the server keep its place when the row the
 *  client last saw has been deleted in the meantime. */
/** What a "Helped me" press or un-press returns: the share's new standing. */
type HelpedResult = {
  helpedCount: number
  rating: number | null
  ratingCount: number
  iHelped: boolean
  myRating: number | null
}

function afterQuery(after?: { id: string; createdAt: string }): string {
  return after ? `?${new URLSearchParams({ after: after.id, afterAt: after.createdAt })}` : ''
}

/** A failed response as an HttpError. The status is carried on the error, not
 *  just folded into the message: callers need to tell a payment-required 402
 *  (open the plans) from an ordinary failure (show a toast), and a message
 *  string cannot express that without matching on wording. */
async function toHttpError(res: Response): Promise<HttpError> {
  const body = await res.json().catch(() => ({}))
  return new HttpError(body.error || `Request failed (${res.status})`, res.status)
}

async function http<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) throw await toHttpError(res)
  // 204 / empty bodies
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---- Response shapes -------------------------------------------------------
export interface AuthResponse {
  token: string
  user: User
}

export interface ConnectionGraph {
  connectionIds: string[]
  sentRequestIds: string[]
  pendingRequestIds: string[]
  connectionNotes?: Record<string, string>
}

export type Provider = 'google' | 'linkedin'

// ---- API surface -----------------------------------------------------------
export const api = {
  // auth
  // Registration is a 3-step flow.
  // Step 1: email the new member a 6-digit code to verify the address.
  // `devCode` is only present in demo mode (SMTP unconfigured / non-prod).
  signupStart: (email: string) =>
    http<{ ok: boolean; email: string; simulated: boolean; devCode?: string }>('/api/auth/signup/start', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  // Step 2: confirm the code, receive a short-lived signup ticket.
  signupVerify: (email: string, code: string) =>
    http<{ ok: boolean; ticket: string }>('/api/auth/signup/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),
  // Step 3: create the account. Email comes from the verified ticket.
  signup: (ticket: string, name: string, password: string) =>
    http<AuthResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ ticket, name, password }),
    }),

  login: (email: string, password: string) =>
    http<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  social: (provider: Provider) =>
    http<AuthResponse>(`/api/auth/social/${provider}`, { method: 'POST' }),

  getAuthConfig: () => http<{ googleClientId: string | null }>('/api/auth/config'),

  googleAuth: (accessToken: string) =>
    http<AuthResponse>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ accessToken }),
    }),

  me: () => http<{ user: User }>('/api/auth/me').then((r) => r.user),

  forgotPassword: (email: string) =>
    http<{ ok: boolean; message: string; devResetLink?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    http<{ ok: boolean }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  verifyEmail: (token: string) =>
    http<{ ok: boolean }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  resendVerification: () =>
    http<{ ok: boolean; alreadyVerified?: boolean; devVerifyLink?: string }>(
      '/api/auth/resend-verification',
      { method: 'POST' },
    ),

  changePassword: (currentPassword: string, newPassword: string) =>
    http<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword }),
    }),

  requestEmailChange: (newEmail: string, reason?: string) =>
    http<{ ok: boolean }>('/api/users/me/request-email-change', {
      method: 'POST',
      body: JSON.stringify({ newEmail, reason }),
    }),

  // users
  getUsers: () => http<User[]>('/api/users'),
  getUser: (id: string) => http<User>(`/api/users/${id}`),
  updateProfile: (patch: ProfilePatch) =>
    http<User>('/api/users/me', { method: 'PATCH', body: JSON.stringify(patch) }),
  // Employer (work-email) verification — required once before posting a job.
  startWorkEmailVerification: (email: string) =>
    http<{ ok: boolean; email: string; simulated: boolean }>('/api/users/me/work-email/start', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  verifyWorkEmail: (code: string) =>
    http<User>('/api/users/me/work-email/verify', { method: 'POST', body: JSON.stringify({ code }) }),

  // posts / feed
  getFeed: () => http<Post[]>('/api/posts'),
  createPost: (input: Partial<Post>) =>
    http<Post>('/api/posts', { method: 'POST', body: JSON.stringify(input) }),
  updatePost: (id: string, patch: Partial<Post>) =>
    http<Post>(`/api/posts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  likePost: (id: string) =>
    http<{ likes: number; likedByMe: boolean }>(`/api/posts/${id}/like`, { method: 'POST' }),
  unlikePost: (id: string) =>
    http<{ likes: number; likedByMe: boolean }>(`/api/posts/${id}/like`, { method: 'DELETE' }),
  savePost: (id: string) =>
    http<{ saved: boolean }>(`/api/posts/${id}/save`, { method: 'POST' }),
  unsavePost: (id: string) =>
    http<{ saved: boolean }>(`/api/posts/${id}/save`, { method: 'DELETE' }),
  addComment: (postId: string, text: string) =>
    http<Comment>(`/api/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  // Emoji reactions: set/change (POST) or clear (DELETE). Both return the fresh
  // per-emoji counts + the caller's current reaction.
  react: (id: string, emoji: string) =>
    http<{ reactions: Record<string, number>; myReaction: string | null }>(`/api/posts/${id}/react`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }),
  unreact: (id: string) =>
    http<{ reactions: Record<string, number>; myReaction: string | null }>(`/api/posts/${id}/react`, {
      method: 'DELETE',
    }),

  // jobs (Hiring posts)
  applyToJob: (
    postId: string,
    answers?: string[],
    resume?: { name: string; dataBase64: string; mediaType: string },
  ) =>
    http<{ applied: boolean; applicantsCount: number }>(`/api/posts/${postId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ answers: answers ?? [], resume }),
    }),
  getApplicants: (postId: string) => http<JobApplicant[]>(`/api/posts/${postId}/applicants`),
  // Binary download — bypasses the JSON helper; caller turns the blob into a file.
  downloadApplicantResume: async (postId: string, applicantId: string): Promise<Blob> => {
    const token = getToken()
    const res = await fetch(`/api/posts/${postId}/applicants/${applicantId}/resume`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Download failed (${res.status})`)
    }
    return res.blob()
  },

  // connections
  getConnections: () => http<ConnectionGraph>('/api/connections'),
  connect: (id: string, note?: string) =>
    http<{ ok: boolean; state: 'pending' | 'connected' }>(`/api/connections/${id}`, {
      method: 'POST',
      body: JSON.stringify({ note: note || undefined }),
    }),
  acceptConnection: (id: string) =>
    http<{ ok: boolean; state: string }>(`/api/connections/${id}/accept`, { method: 'POST' }),
  ignoreConnection: (id: string) =>
    http<{ ok: boolean; state: string }>(`/api/connections/${id}/ignore`, { method: 'POST' }),
  cancelSentRequest: (id: string) =>
    http<{ ok: boolean; state: string }>(`/api/connections/${id}`, { method: 'DELETE' }),

  // messages / chats
  getThreads: () => http<MessageThread[]>('/api/messages/threads'),
  startThread: (userId: string) =>
    http<MessageThread>('/api/messages/thread', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  sendMessage: (
    conversationId: string,
    text: string,
    attachment?: { name: string; dataBase64: string; mediaType: string },
  ) =>
    http<ChatMessage>(`/api/messages/${conversationId}`, {
      method: 'POST',
      body: JSON.stringify({ text: text || undefined, attachment }),
    }),
  markThreadRead: (conversationId: string) =>
    http<{ ok: boolean }>(`/api/messages/${conversationId}/read`, { method: 'POST' }),
  editMessage: (conversationId: string, messageId: string, text: string) =>
    http<ChatMessage>(`/api/messages/${conversationId}/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    }),
  // Binary download — bypasses the JSON helper; caller turns the blob into a file.
  downloadAttachment: async (messageId: string): Promise<Blob> => {
    const token = getToken()
    const res = await fetch(`/api/messages/attachments/${messageId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Download failed (${res.status})`)
    }
    return res.blob()
  },

  // communities
  getCommunities: () => http<Community[]>('/api/communities'),
  createCommunity: (c: { name: string; description: string; category: Community['category']; tag: string }) =>
    http<Community>('/api/communities', { method: 'POST', body: JSON.stringify(c) }),
  joinCommunity: (id: string) =>
    http<Community>(`/api/communities/${id}/join`, { method: 'POST' }),
  leaveCommunity: (id: string) =>
    http<Community>(`/api/communities/${id}/join`, { method: 'DELETE' }),
  getPendingCommunities: () => http<PendingCommunity[]>('/api/communities/pending'),
  approveCommunity: (id: string) =>
    http<{ ok: boolean }>(`/api/communities/${id}/approve`, { method: 'POST' }),
  rejectCommunity: (id: string) =>
    http<{ ok: boolean }>(`/api/communities/${id}/reject`, { method: 'POST' }),

  // companies
  getCompanies: () => http<Company[]>('/api/companies'),
  getCompany: (id: string) => http<CompanyDetail>(`/api/companies/${id}`),
  saveCompany: (id: string) =>
    http<{ saved: boolean }>(`/api/companies/${id}/save`, { method: 'POST' }),
  unsaveCompany: (id: string) =>
    http<{ saved: boolean }>(`/api/companies/${id}/save`, { method: 'DELETE' }),

  // Companies for you: the directory plus the aggregate signals lib/companyMatch.ts
  // scores against. Separate from getCompanies so the plain directory stays cheap.
  getCompaniesForYou: () => http<CompanyWithSignals[]>('/api/companies/for-you'),
  getCompanyRoadmaps: (id: string) => http<CompanyRoadmaps>(`/api/companies/${id}/roadmaps`),
  saveCompanyRoadmap: (id: string, body: { role: string; headline: string; advice: string; stages: RoadmapStage[] }) =>
    http<{ saved: boolean }>(`/api/companies/${id}/roadmap`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  requestCompanyRoadmaps: (id: string) =>
    http<{ requested: boolean; notified: number }>(`/api/companies/${id}/roadmap/request`, {
      method: 'POST',
    }),

  // mentorship
  getSessions: () => http<MentorshipSession[]>('/api/mentorship/sessions'),
  // serviceId is set when the booking came from a Career Guidance alumni
  // service — the session then snapshots that service's own price instead of
  // the mentee's free-session allowance. Omitted everywhere else, unchanged.
  bookSession: (mentorId: string, topic: string, date: string, time: string, serviceId?: string) =>
    http<MentorshipSession>('/api/mentorship/sessions', {
      method: 'POST',
      body: JSON.stringify({ mentorId, topic, date, time, serviceId }),
    }),
  /** The reverse of bookSession: a mentor offers a connection a 1:1 slot,
   *  which that member then accepts or declines. */
  offerSession: (
    menteeId: string, topic: string, date: string, time: string,
    meetingLink?: string, scheduledAt?: string,
    resourceLink?: string, resourceTitle?: string,
  ) =>
    http<MentorshipSession>('/api/mentorship/sessions/offer', {
      method: 'POST',
      body: JSON.stringify({ menteeId, topic, date, time, meetingLink, scheduledAt, resourceLink, resourceTitle }),
    }),
  /** Either side calls off a requested or upcoming session. */
  cancelSession: (id: string) =>
    http<MentorshipSession>(`/api/mentorship/sessions/${id}/cancel`, { method: 'POST' }),
  /** Mentor adds or changes the join link on a session; '' clears it. */
  setSessionMeetingLink: (id: string, meetingLink: string) =>
    http<MentorshipSession>(`/api/mentorship/sessions/${id}/meeting-link`, {
      method: 'POST',
      body: JSON.stringify({ meetingLink }),
    }),
  acceptSessionOffer: (id: string) =>
    http<MentorshipSession>(`/api/mentorship/sessions/${id}/accept-offer`, { method: 'POST' }),
  declineSessionOffer: (id: string) =>
    http<MentorshipSession>(`/api/mentorship/sessions/${id}/decline-offer`, { method: 'POST' }),
  acceptSession: (id: string, meetingLink?: string, resourceLink?: string, resourceTitle?: string) =>
    http<MentorshipSession>(`/api/mentorship/sessions/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify({ meetingLink, resourceLink, resourceTitle }),
    }),
  rateSession: (id: string, rating: number, review?: string) =>
    http<MentorshipSession>(`/api/mentorship/sessions/${id}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating, review }),
    }),
  getMentorRatings: () =>
    http<Array<{ mentorId: string; avg: number; count: number }>>('/api/mentorship/ratings'),
  declineSession: (id: string) =>
    http<MentorshipSession>(`/api/mentorship/sessions/${id}/decline`, { method: 'POST' }),
  // durationMinutes/domain are what the profile record is built from; both
  // optional so the plain one-click complete still works.
  // followUp is the optional task that needs evidence — the only way one is
  // created; prep attached before the session never asks for evidence.
  completeSession: (
    id: string, durationMinutes?: number, domain?: string,
    followUp?: { title: string; url: string },
  ) =>
    http<MentorshipSession>(`/api/mentorship/sessions/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ durationMinutes, domain, followUpTitle: followUp?.title, followUpUrl: followUp?.url }),
    }),
  /** Mentor edits a session they are hosting. `scheduledAt` is the real
   *  instant — the server derives the displayed date/time labels from it, so
   *  what the card shows and when the reminder fires cannot drift apart. */
  editSession: (
    id: string,
    changes: { topic?: string; scheduledAt?: string; meetingLink?: string },
  ) => http<MentorshipSession>(`/api/mentorship/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  }),
  getMentorApplications: () => http<string[]>('/api/mentorship/applications'),
  approveMentor: (id: string) =>
    http<{ ok: boolean }>(`/api/mentorship/applications/${id}/approve`, { method: 'POST' }),
  declineMentor: (id: string, reviewNote?: string) =>
    http<{ ok: boolean }>(`/api/mentorship/applications/${id}/decline`, {
      method: 'POST',
      body: JSON.stringify({ reviewNote }),
    }),
  /** My own mentor application, or null if I have never submitted one. */
  getMyMentorApplication: () =>
    http<MentorApplication | null>('/api/mentorship/applications/me'),
  /** One application in full, with its proof-document metadata (admin). */
  getMentorApplication: (id: string) =>
    http<MentorApplication>(`/api/mentorship/applications/${id}`),
  /** Submit (or resubmit after a decline) a mentor application with evidence. */
  applyForMentor: (input: {
    claim: MentorClaim
    note?: string
    documents: { name: string; dataBase64: string; mediaType: string }[]
  }) =>
    http<{ status: string; claim: MentorClaim; documentCount: number }>(
      '/api/mentorship/applications',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  /**
   * Admin-only download of one proof document. Binary — bypasses the JSON
   * helper, like the resume/attachment/certificate downloads above.
   *
   * NOT a plain URL for an <a href>: the route is behind requireAuth, which
   * reads the Bearer header, and a browser navigation carries no header — so
   * every click on the old href-based link came back 401.
   */
  downloadMentorProof: async (userId: string, docId: string): Promise<Blob> => {
    const token = getToken()
    const res = await fetch(`/api/mentorship/applications/${userId}/documents/${docId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Download failed (${res.status})`)
    }
    return res.blob()
  },

  // startups
  getStartups: () => http<Startup[]>('/api/startups'),
  getStartupApplications: () => http<StartupApplication[]>('/api/startups/applications'),
  submitStartup: (s: { name: string; domain: Startup['domain']; stage: Startup['stage']; teamSize: number; description: string; visibility: 'network' | 'admin' }) =>
    http<Startup>('/api/startups', { method: 'POST', body: JSON.stringify(s) }),

  // notifications
  getNotifications: () => http<AppNotification[]>('/api/notifications'),
  markNotificationRead: (id: string) =>
    http<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    http<{ ok: boolean }>('/api/notifications/read-all', { method: 'POST' }),

  // admin: network overview
  getAdminStats: () =>
    http<{
      members: number
      membersThisWeek: number
      invitees: number
      invited: number
      posts: number
      comments: number
      communities: number
      sessions: { upcoming: number; requested: number; completed: number }
      startups: number
      pendingMentorApps: number
      jobApplications: number
      messages: number
      integrations: { google: boolean; smtp: boolean; ai: boolean }
      /** Base URL invite links are built from — shown in Settings to catch drift. */
      appUrl: string
      recentMembers: Array<{
        id: string
        name: string
        email: string
        city: string
        /** When the ACCOUNT was created — an invite does this on their behalf. */
        joinedAt: string
        /** When they actually signed in. null = no login recorded. */
        lastLoginAt: string | null
        passwordChanged: boolean
        /** Has used the account (onboarded/edited) even if no login was logged. */
        everActive: boolean
      }>
    }>('/api/admin/stats'),

  // admin: official content — pin=true announcement, pin=false quiet news update
  announce: (text: string, pin = true) =>
    http<Post>('/api/posts/announce', { method: 'POST', body: JSON.stringify({ text, pin }) }),
  unpinPost: (id: string) =>
    http<{ ok: boolean }>(`/api/posts/${id}/unpin`, { method: 'POST' }),

  // admin: invitee directory + invites (unchanged endpoints)
  getAlumni: () => http<Alumni[]>('/api/alumni'),
  addAlumni: (row: { name: string; phone: string; email: string }) =>
    http<Alumni>('/api/alumni', { method: 'POST', body: JSON.stringify(row) }),
  bulkAddAlumni: (rows: ContactRow[], batch?: string) =>
    http<{ added: Alumni[]; skipped: Array<{ email?: string; reason: string }>; batch: string }>(
      '/api/alumni/bulk',
      { method: 'POST', body: JSON.stringify({ rows, batch }) },
    ),
  sendInvites: (invites: Array<{ id: string; email: boolean; whatsapp: boolean }>) =>
    http<{
      emailCount: number
      whatsappCount: number
      total: number
      // Emailing an invitee creates their account, so a batch reports how many
      // were newly created vs. already had one.
      accountsCreated: number
      created: number
      reissued: number
      alreadyJoined: number
      failedCount: number
      results: Array<{ email: string; status: InviteStatus; error?: string }>
      message: string
    }>('/api/invites/batch', { method: 'POST', body: JSON.stringify({ invites }) }),

  /** The invite email a specific person was sent (password redacted). */
  getSentInviteEmail: (inviteeId: string) =>
    http<SentInviteEmail>(`/api/alumni/${inviteeId}/invite-email`),

  // admin: editable invite email copy
  getInviteEmailTemplate: () => http<InviteEmailTemplate>('/api/admin/email-template/invite'),
  saveInviteEmailTemplate: (subject: string, body: string) =>
    http<{ ok: boolean; preview: { subject: string; body: string } }>(
      '/api/admin/email-template/invite',
      { method: 'PUT', body: JSON.stringify({ subject, body }) },
    ),
  resetInviteEmailTemplate: () =>
    http<{ ok: boolean; subject: string; body: string }>('/api/admin/email-template/invite', {
      method: 'DELETE',
    }),

  // events
  getEvents: () => http<AppEvent[]>('/api/events'),
  createEvent: (e: {
    title: string
    description: string
    location: string
    meetingLink?: string
    startsAt: string
    isPaid?: boolean
    price?: number
    capacity?: number
    speakers?: { name: string; bio: string }[]
  }) => http<AppEvent>('/api/events', { method: 'POST', body: JSON.stringify(e) }),
  rsvpEvent: (id: string) => http<AppEvent>(`/api/events/${id}/rsvp`, { method: 'POST' }),
  unrsvpEvent: (id: string) => http<AppEvent>(`/api/events/${id}/rsvp`, { method: 'DELETE' }),
  cancelEvent: (id: string) => http<{ ok: boolean }>(`/api/events/${id}`, { method: 'DELETE' }),
  getPendingEvents: () => http<PendingEvent[]>('/api/events/pending'),
  approveEvent: (id: string) => http<{ ok: boolean }>(`/api/events/${id}/approve`, { method: 'POST' }),
  rejectEvent: (id: string) => http<{ ok: boolean }>(`/api/events/${id}/reject`, { method: 'POST' }),
  getEventAttendees: (id: string) => http<EventAttendee[]>(`/api/events/${id}/attendees`),
  getEventComments: (id: string) => http<Comment[]>(`/api/events/${id}/comments`),
  addEventComment: (id: string, text: string) =>
    http<Comment>(`/api/events/${id}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
  submitEventFeedback: (id: string, rating: number, comment: string) =>
    http<AppEvent>(`/api/events/${id}/feedback`, { method: 'POST', body: JSON.stringify({ rating, comment }) }),
  getEventFeedback: (id: string) => http<EventFeedbackEntry[]>(`/api/events/${id}/feedback`),
  downloadEventCertificate: async (id: string): Promise<Blob> => {
    const token = getToken()
    const res = await fetch(`/api/events/${id}/certificate`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`Download failed (${res.status})`)
    return res.blob()
  },

  // badges
  getBadges: (userId: string) => http<{ points: number; badges: Badge[] }>(`/api/users/${userId}/badges`),

  // reports / moderation
  report: (targetType: 'post' | 'user', targetId: string, reason: string, evidence?: string) =>
    http<{ ok: boolean; already?: boolean }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ targetType, targetId, reason, evidence }),
    }),
  getReports: () =>
    http<Array<{ id: string; targetType: 'post' | 'user'; targetId: string; reason: string; status: string; reporterName: string; summary: string; createdAt: string }>>('/api/reports'),
  resolveReport: (id: string, removePost: boolean) =>
    http<{ ok: boolean }>(`/api/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ removePost }),
    }),
  dismissReport: (id: string) =>
    http<{ ok: boolean }>(`/api/reports/${id}/dismiss`, { method: 'POST' }),

  // leaderboard
  getLeaderboard: () =>
    http<Array<{ id: string; name: string; photo?: string; designation: string; points: number }>>('/api/users/leaderboard'),

  // event calendar file
  downloadEventIcs: async (id: string): Promise<Blob> => {
    const token = getToken()
    const res = await fetch(`/api/events/${id}/ics`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error(`Download failed (${res.status})`)
    return res.blob()
  },

  // Ask Roo
  askRoo: (question: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    http<{ answer: string }>('/api/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question, history }),
    }),

  // resume parsing
  parseResume: (dataBase64?: string, mediaType?: string) =>
    http<ResumeParseResult>('/api/resume/parse', {
      method: 'POST',
      body: JSON.stringify({ dataBase64, mediaType }),
    }),

  // Career Guidance
  // The assessment autosaves per step (submit:false) and regenerates the
  // roadmap on submit (submit:true) — see backend/src/routes/career.routes.ts.
  getCareerDraft: () => http<CareerAssessment | null>('/api/career/assessment/draft'),
  getLastCareerAssessment: () => http<CareerAssessment | null>('/api/career/assessment/last'),
  saveCareerAssessment: (body: CareerAssessmentInput) =>
    http<CareerAssessment>('/api/career/assessment', {
      method: 'POST',
      body: JSON.stringify({ ...body, submit: false }),
    }),
  submitCareerAssessment: (body: CareerAssessmentInput) =>
    http<CareerRoadmap>('/api/career/assessment', {
      method: 'POST',
      body: JSON.stringify({ ...body, submit: true }),
    }),
  getCareerRoadmap: () => http<CareerRoadmap | null>('/api/career/roadmap'),
  setCareerStepStatus: (stepKey: string, status: CareerStageStatus) =>
    http<CareerRoadmap>(`/api/career/roadmap/steps/${encodeURIComponent(stepKey)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  // The member's own edits to their plan (rename/reorder/add/remove/pause).
  // Applied in place — regeneration is what creates a new version.
  editCareerRoadmap: (
    stages: { stepKey: string; title: string; status: CareerStageStatus; durationWeeks: number | null }[],
  ) => http<CareerRoadmap>('/api/career/roadmap', { method: 'PATCH', body: JSON.stringify({ stages }) }),
  getCareerAlumniHelp: () => http<AlumniHelper[]>('/api/career/alumni-help'),

  // Mentor workspace
  getMentees: () => http<Mentee[]>('/api/career/mentees'),

  // Group sessions
  getGroupSessions: () => http<GroupSession[]>('/api/group-sessions'),
  getMyGroupSessions: () => http<GroupSession[]>('/api/group-sessions/mine'),
  createGroupSession: (input: GroupSessionInput) =>
    http<GroupSession>('/api/group-sessions', { method: 'POST', body: JSON.stringify(input) }),
  joinGroupSession: (id: string) =>
    http<GroupSession>(`/api/group-sessions/${id}/join`, { method: 'POST' }),
  leaveGroupSession: (id: string) =>
    http<GroupSession>(`/api/group-sessions/${id}/leave`, { method: 'POST' }),
  getGroupSessionAttendees: (id: string) =>
    http<GroupSessionAttendee[]>(`/api/group-sessions/${id}/attendees`),
  completeGroupSession: (id: string, durationMinutes?: number, domain?: string) =>
    http<GroupSession>(`/api/group-sessions/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ durationMinutes, domain }),
    }),
  confirmGroupSession: (id: string) =>
    http<GroupSession>(`/api/group-sessions/${id}/confirm`, { method: 'POST' }),
  cancelGroupSession: (id: string) =>
    http<{ ok: boolean }>(`/api/group-sessions/${id}/cancel`, { method: 'POST' }),
  /** Host edits a scheduled group session (not pricing or who can join). */
  editGroupSession: (
    id: string,
    input: { topic: string; description: string; domain: string; scheduledAt: string; durationMinutes: number; capacity: number; meetingLink: string },
  ) => http<{ ok: boolean; notified: number }>(`/api/group-sessions/${id}/edit`, { method: 'POST', body: JSON.stringify(input) }),
  /** Schedule a new session for the same people who attended a past one —
   *  always invite_only, invited to exactly that roster. */
  repeatGroupSession: (id: string, input: { scheduledAt: string; meetingLink: string }) =>
    http<GroupSession>(`/api/group-sessions/${id}/repeat`, { method: 'POST', body: JSON.stringify(input) }),
  /** A mentee's roadmap. Allowed only where an accepted session exists. */
  getMenteeRoadmap: (userId: string) => http<MenteeRoadmap>(`/api/career/roadmap/of/${userId}`),
  getProfileStats: (userId: string) => http<ProfileStats>(`/api/mentorship/stats/${userId}`),
  /** AI briefing on a mentee. Same access rule as their roadmap. */
  getMenteeBrief: (userId: string) =>
    http<{ brief: MenteeBrief; generatedAt: string }>(`/api/career/mentee-brief/${userId}`),
  confirmSession: (id: string, durationMinutes?: number) =>
    http<MentorshipSession>(`/api/mentorship/sessions/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ durationMinutes }),
    }),

  // Mentor subscriptions
  getPlans: () =>
    http<{ plans: Plan[]; payments: { provider: string; live: boolean } }>('/api/subscription/plans'),
  getMySubscription: () => http<SubscriptionState>('/api/subscription/me'),
  startCheckout: (plan: PlanId, months = 1) =>
    http<CheckoutSession>('/api/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, months }),
    }),
  // Confirms a payment. With the stub provider this is what "completes" a
  // simulated purchase; with a real gateway the same route verifies its
  // signed callback.
  confirmCheckout: (reference: string, signature?: string) =>
    http<SubscriptionState>('/api/subscription/callback', {
      method: 'POST',
      body: JSON.stringify({ reference, signature }),
    }),
  cancelSubscription: () =>
    http<SubscriptionState>('/api/subscription/cancel', { method: 'POST' }),
  getAdminSubscriptions: () => http<AdminSubscriptionRow[]>('/api/subscription/admin'),
  // Admin: completed sessions still waiting on the mentee's confirmation.
  getPendingConfirmations: () =>
    http<PendingConfirmation[]>('/api/mentorship/admin/pending-confirmations'),
  // Re-notifies the mentee; the server allows one reminder per session per 24h.
  remindConfirmation: (sessionId: string) =>
    http<{ remindedAt: string }>(`/api/mentorship/admin/sessions/${sessionId}/remind-confirm`, {
      method: 'POST',
    }),
  grantSubscription: (userId: string, plan: PlanId, months = 1, note?: string) =>
    http<SubscriptionState>('/api/subscription/admin/grant', {
      method: 'POST',
      body: JSON.stringify({ userId, plan, months, note }),
    }),
  revokeSubscription: (userId: string) =>
    http<SubscriptionState>('/api/subscription/admin/revoke', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    }),
  getSubscriptionEvents: (userId: string) =>
    http<SubscriptionEvent[]>(`/api/subscription/admin/events/${userId}`),
  getMatchedServices: () => http<AlumniService[]>('/api/career/services/matched'),
  getAllServices: () => http<AlumniService[]>('/api/career/services'),
  getMyServices: () => http<AlumniService[]>('/api/career/services/mine'),
  createService: (body: ServiceInput) =>
    http<AlumniService>('/api/career/services', { method: 'POST', body: JSON.stringify(body) }),
  updateService: (id: string, body: Partial<ServiceInput> & { active?: boolean }) =>
    http<AlumniService>(`/api/career/services/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  // Permanent removal. Returns how many already-booked sessions were unlinked
  // from the service, so the panel can report the real consequence.
  deleteService: (id: string) =>
    http<{ unlinkedSessions: number }>(`/api/career/services/${id}`, { method: 'DELETE' }),

  // ---- Learning resources --------------------------------------------------
  // Returns everything the caller may see: their own resources, plus anything
  // attached to a mentorship session they are a party to. Passing a sessionId
  // narrows it to that one session, which is what the session view uses.
  // Without a sessionId it is paged: `limit` rows (server default 20, max 50)
  // older than `after`, the id of the last row already shown — with `afterAt`,
  // its createdAt, so paging survives that row being deleted. A page shorter
  // than the limit is the last one. `saved` keeps only what the member kept for
  // themselves — the Learning page's Saved Resources list.
  getCareerResources: (
    sessionId?: string,
    page?: { limit?: number; after?: string; afterAt?: string; saved?: boolean },
  ) => {
    const q = new URLSearchParams()
    if (sessionId) q.set('sessionId', sessionId)
    if (page?.limit) q.set('limit', String(page.limit))
    if (page?.after) q.set('after', page.after)
    if (page?.after && page.afterAt) q.set('afterAt', page.afterAt)
    if (page?.saved) q.set('scope', 'saved')
    const qs = q.toString()
    return http<CareerResource[]>(`/api/career-resources${qs ? `?${qs}` : ''}`)
  },
  // Totals counted on the server over everything the caller can see.
  getCareerResourceSummary: () => http<CareerResourceSummary>('/api/career-resources/summary'),
  // Someone else's public profile — the deliberately smaller shape, with no
  // stage, session or status attached (see PublicCareerResource).
  getPublicCareerResources: (userId: string) =>
    http<PublicCareerResource[]>(`/api/career-resources/of/${encodeURIComponent(userId)}`),
  createCareerResource: (body: CareerResourceInput) =>
    http<CareerResource>('/api/career-resources', { method: 'POST', body: JSON.stringify(body) }),
  // Only title/url/note/kind/status are editable — the stage and session links
  // are fixed at creation, because re-pointing a shared resource would move it
  // between people's lists without either of them acting.
  updateCareerResource: (
    id: string,
    body: Partial<Pick<CareerResourceInput, 'title' | 'url' | 'note' | 'kind' | 'status' | 'isPublic'>>,
  ) =>
    http<CareerResource>(`/api/career-resources/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteCareerResource: (id: string) =>
    http<void>(`/api/career-resources/${id}`, { method: 'DELETE' }),
  // The mentee proving they did a resource the mentor marked
  // requiresSubmission — a link, uploaded files (api.uploadLearningFile), or
  // both. Sending again replaces it while the mentor hasn't opened it yet, or
  // after they asked for it again; otherwise it is refused (409).
  // `replaces` is the submissionAt being replaced (none for a first send), so
  // a retried or out-of-date submit is refused instead of replacing itself.
  submitCareerResource: (id: string, url?: string, fileIds?: string[], replaces?: string | null) =>
    http<CareerResource>(`/api/career-resources/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ url, fileIds, replaces: replaces ?? null }),
    }),
  /** The mentor opened the evidence LINK (files are marked when downloaded).
   *  Names the submission seen, so newer work is never marked by mistake. */
  markEvidenceSeen: (id: string, submittedAt: string) =>
    http<void>(`/api/career-resources/${id}/evidence-seen`, {
      method: 'POST',
      body: JSON.stringify({ submittedAt }),
    }),
  /** The mentor asks the mentee to send their work again — naming the
   *  submission on screen, so newer work they haven't seen isn't reopened. */
  requestResubmission: (id: string, submittedAt: string) =>
    http<CareerResource>(`/api/career-resources/${id}/request-resubmission`, {
      method: 'POST',
      body: JSON.stringify({ submittedAt }),
    }),
  /** One attachment on an assigned resource as a Blob — private to the mentor
   *  and mentee, so it is fetched with the token (see getShareFile). */
  getCareerResourceFile: async (resourceId: string, fileId: string): Promise<Blob> => {
    const token = getToken()
    const res = await fetch(
      `/api/career-resources/${encodeURIComponent(resourceId)}/files/${encodeURIComponent(fileId)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    )
    if (!res.ok) throw await toHttpError(res)
    return res.blob()
  },
  // A mentor's side of direct assignments: what they gave this member without
  // a session, and the work sent back (submissionUrl and/or submissionFiles).
  // Newest first, up to 50.
  getAssignedByMe: (menteeId: string) =>
    http<CareerResource[]>(`/api/career-resources/assigned-by-me?menteeId=${encodeURIComponent(menteeId)}`),

  // ---- Learning hub (Learning Resources page) --------------------------------
  // One call on open: roadmap, banner data and the tab counts.
  getLearningOverview: () => http<LearningOverview>('/api/learning/overview'),
  // What alumni shared for one roadmap stage. When nobody has shared yet the
  // response carries the alumni who can help with it instead.
  getLearningStage: (stepKey?: string, offset = 0) => {
    const q = new URLSearchParams({ offset: String(offset) })
    if (stepKey) q.set('stepKey', stepKey)
    return http<StageShares>(`/api/learning/stage?${q}`)
  },
  // `after` is the last row already shown — its id and createdAt, so paging
  // survives that row being deleted.
  getLearningAssigned: (after?: Pick<CareerResource, 'id' | 'createdAt'>) =>
    http<CareerResource[]>(`/api/learning/assigned${afterQuery(after)}`),
  // The mentor's side: what I gave my mentees, with who it went to.
  getLearningGiven: (after?: Pick<CareerResource, 'id' | 'createdAt'>) =>
    http<CareerResource[]>(`/api/learning/given${afterQuery(after)}`),
  // The alum's side: stages this member can speak to, and where members are
  // waiting with nothing shared yet.
  getContributeStages: () => http<{ stages: ContributeStage[] }>('/api/learning/contribute'),
  getMyShares: (after?: Pick<LearningShare, 'id' | 'createdAt'>) =>
    http<LearningShare[]>(`/api/learning/mine${afterQuery(after)}`),
  // "All Resources": the whole network's shares, narrowed by the search box and
  // the Filter-by panel. `after` is the last item already shown — its id, plus
  // the position it was seen at, so paging survives that item being deleted;
  // `signal` lets a newer search cancel this one.
  browseLearning: (
    f: BrowseFilters,
    after?: Pick<LearningShare, 'id' | 'helpedCount' | 'createdAt'>,
    signal?: AbortSignal,
  ) => {
    const p = new URLSearchParams()
    if (f.q.trim()) p.set('q', f.q.trim())
    if (f.tags.length) p.set('tags', f.tags.join(','))
    if (f.types.length) p.set('types', f.types.join(','))
    if (f.difficulty.length) p.set('difficulty', f.difficulty.join(','))
    if (after) {
      p.set('after', after.id)
      p.set('afterHelped', String(after.helpedCount))
      p.set('afterAt', after.createdAt)
    }
    const qs = p.toString()
    return http<LearningShare[]>(`/api/learning/browse${qs ? `?${qs}` : ''}`, { signal })
  },
  // The Skill / Topic filter: most-used skills, or those starting with `q`.
  getLearningTags: (q?: string, signal?: AbortSignal) =>
    http<SkillTag[]>(`/api/learning/tags${q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`, { signal }),
  shareLearning: (body: {
    /** Optional: without one the share is not filed under a stage. */
    topicKey?: string
    /** Several stages (up to MAX_SHARE_STAGES); the first is the share's own. */
    topicKeys?: string[]
    kind: ShareKind
    title: string
    url?: string
    whyHelped: string
    about?: string
    skills: string[]
    difficulty: ProjectDifficulty
    estHours?: number
    /** Everyone (default) or My connections. */
    audience?: ShareAudience
  }) =>
    http<{ share: LearningShare; duplicate: boolean }>('/api/learning/shares', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  // ---- Add resource: files go up one request each, then the resource claims them.
  uploadLearningFile: (body: { name: string; mime: string; data: string }) =>
    http<ShareFile>('/api/learning/uploads', { method: 'POST', body: JSON.stringify(body) }),
  deleteLearningUpload: (id: string) =>
    http<void>(`/api/learning/uploads/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  addLearningResource: (body: {
    domains: string[]
    title: string
    fileIds: string[]
    whyHelped: string
    difficulty: ProjectDifficulty
    audience: ShareAudience
  }) => http<{ share: LearningShare }>('/api/learning/resources', { method: 'POST', body: JSON.stringify(body) }),
  /** One attached file as a Blob. A plain link cannot carry the bearer token,
   *  so the card fetches it here and opens an object URL. */
  getShareFile: async (shareId: string, fileId: string): Promise<Blob> => {
    const token = getToken()
    const res = await fetch(`/api/learning/shares/${encodeURIComponent(shareId)}/files/${encodeURIComponent(fileId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw await toHttpError(res)
    return res.blob()
  },
  deleteShare: (id: string) =>
    http<void>(`/api/learning/shares/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  saveShare: (id: string) =>
    http<{ savedResourceId: string; savedCount: number }>(`/api/learning/shares/${encodeURIComponent(id)}/save`, {
      method: 'POST',
    }),
  unsaveShare: (id: string) =>
    http<{ savedCount: number }>(`/api/learning/shares/${encodeURIComponent(id)}/save`, { method: 'DELETE' }),
  // "This helped me", with how much (1–5 stars): tells the network the share
  // is good and thanks the person who shared it, in one press. A rating is
  // final once given. Returns the share's updated standing.
  markShareHelped: (id: string, rating: number) =>
    http<HelpedResult>(`/api/learning/shares/${encodeURIComponent(id)}/helped`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }),
  reportShare: (id: string) =>
    http<{ reported: boolean; hidden: boolean }>(`/api/learning/shares/${encodeURIComponent(id)}/report`, {
      method: 'POST',
    }),
}

export interface CareerAssessmentInput {
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
}

export interface ServiceInput {
  serviceType: ServiceType
  title: string
  description: string
  tags: string[]
  pricingMode: 'free' | 'paid' | 'custom'
  amount?: number
  pricingUnit?: 'hour' | 'session'
}
