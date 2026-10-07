import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppEvent,
  AppNotification,
  Community,
  ConnectionState,
  MentorshipSession,
  MessageThread,
  Post,
  PostMeta,
  PostType,
  ProfilePatch,
  Startup,
  User,
  Visibility,
  SubscriptionState,
} from '../types'
import { celebrate } from '../components/ui/celebrate'
import { openShareWin } from '../components/feed/shareWin'
import { api, getToken, isPaymentRequired, setToken } from '../lib/api'
import { googleSignIn } from '../lib/google'
import { rankByMatch } from '../lib/matching'

// ---- Toasts ----------------------------------------------------------------
export type ToastKind = 'success' | 'error' | 'info'
/** Optional button on a toast, e.g. { label: 'Undo', onClick } — Gmail-style. */
export interface ToastAction {
  label: string
  onClick: () => void
}
export interface Toast {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
}

let toastSeq = 0

export type AuthMethod = 'google' | 'linkedin' | 'email'

// A placeholder used before bootstrap / when signed out so components that read
// `currentUser` synchronously never hit undefined.
const GUEST: User = {
  id: 'guest',
  name: 'Guest',
  email: '',
  avatar: 'Guest',
  batchYear: new Date().getFullYear(),
  course: '',
  company: '',
  designation: '',
  experienceYears: 0,
  domain: 'Web Dev',
  employmentType: 'Employed',
  city: '',
  bio: '',
  expertise: [],
  willingToMentor: false,
  interestedInStartup: false,
  connectionsCount: 0,
  isMentor: false,
}

export interface NewPostInput {
  type: PostType
  content: string
  image?: string
  domain?: Post['domain']
  city?: string
  batch?: number
  visibility: Visibility
  communityId?: string
  eventId?: string
  role?: string
  company?: string
  questions?: string[]
  wantsResume?: boolean
  meta?: PostMeta
}

interface AppContextValue {
  // auth / profile
  currentUser: User
  isAuthenticated: boolean
  loading: boolean
  /** True when real Google OAuth is configured; false = demo-account fallback. */
  googleReady: boolean
  login: (email: string, password: string) => Promise<User>
  signup: (ticket: string, name: string, password: string) => Promise<User>
  social: (provider: 'google' | 'linkedin') => Promise<User>
  updateProfile: (patch: ProfilePatch) => Promise<void>
  // Employer (work-email) verification — one-time, required before posting a job.
  startWorkEmailVerification: (email: string) => Promise<{ email: string; simulated: boolean }>
  verifyWorkEmail: (code: string) => Promise<void>
  signOut: () => void

  // people
  users: User[]
  userById: (id: string) => User | undefined
  connectionState: (id: string) => ConnectionState
  connectionIds: string[]
  suggestionIds: string[]
  pendingRequestIds: string[]
  sentRequestIds: string[]
  connectionNotes: Record<string, string>
  sendConnect: (id: string, note?: string) => void
  acceptRequest: (id: string) => void
  ignoreRequest: (id: string) => void
  cancelSentRequest: (id: string) => void
  refreshNetwork: () => Promise<void>
  /** The signed-in member's mentor plan, or null for non-mentors and before
   *  it has loaded. Drives the crown in the navbar and the session paywall. */
  subscription: SubscriptionState | null
  refreshSubscription: () => Promise<void>

  // posts
  posts: Post[]
  createPost: (input: NewPostInput) => void
  updatePost: (id: string, patch: Partial<Post>) => void
  toggleLike: (id: string) => void
  react: (id: string, emoji: string) => void
  toggleSave: (id: string) => void
  addComment: (postId: string, text: string) => void
  applyToJob: (postId: string, answers?: string[], resume?: { name: string; dataBase64: string; mediaType: string }) => void

  // communities
  communities: Community[]
  toggleJoin: (id: string) => void
  createCommunity: (c: { name: string; description: string; category: Community['category']; tag: string }) => void

  // mentorship + startups
  sessions: MentorshipSession[]
  bookSession: (mentorId: string, topic: string, date: string, time: string, serviceId?: string) => void
  /** Mentor offers a connection a slot; they accept or decline it.
   *  Same three-way result as acceptSession: 'error' means it genuinely
   *  failed and has already been reported, so the caller must not close the
   *  form as though the offer had been made. */
  offerSession: (
    menteeId: string, topic: string, date: string, time: string,
    meetingLink?: string, scheduledAt?: string,
    resourceLink?: string, resourceTitle?: string,
  ) => Promise<'ok' | 'payment-required' | 'error'>
  acceptSessionOffer: (id: string) => void
  declineSessionOffer: (id: string) => void
  /** Mentee confirms a completed session actually happened. */
  confirmSession: (id: string) => void
  /** Either side calls off a requested or upcoming session. */
  cancelSession: (id: string) => void
  /** Mentor adds or changes the join link; '' clears it. */
  setSessionMeetingLink: (id: string, meetingLink: string) => Promise<boolean>
  /** 'payment-required' means the mentor needs a plan and the caller should
   *  open the pricing page; 'error' means it genuinely failed and has already
   *  been reported to the member, so the caller must not treat it as done. */
  acceptSession: (id: string, meetingLink?: string, resourceLink?: string, resourceTitle?: string) => Promise<'ok' | 'payment-required' | 'error'>
  /** Keeps a session card's resource count in step after the Resources
   *  modal adds or removes one, without refetching every session. */
  setSessionResourceCount: (id: string, count: number) => void
  rateSession: (id: string, rating: number, review?: string) => void
  declineSession: (id: string) => void
  /** followUp: an optional task that needs evidence, set as the session closes. */
  completeSession: (
    id: string, durationMinutes?: number, domain?: string,
    followUp?: { title: string; url: string },
  ) => void
  /** Mentor-only: move a session, rename it, or change its joining link.
   *  scheduledAt is a real ISO instant — it is what makes the 6-hour
   *  reminder possible, since the date/time a session was booked with are
   *  free text nothing can be computed from. */
  editSession: (id: string, changes: { topic?: string; scheduledAt?: string; meetingLink?: string }) => Promise<boolean>
  becomeMentor: (rate: number) => void
  startups: Startup[]
  submitStartup: (
    s: { name: string; domain: Startup['domain']; stage: Startup['stage']; teamSize: number; description: string; visibility: 'network' | 'admin' },
    shareToFeed?: boolean,
  ) => void

  // events
  events: AppEvent[]
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
  }) => Promise<void>
  toggleRsvp: (id: string) => void
  cancelEvent: (id: string) => void
  submitEventFeedback: (id: string, rating: number, comment: string) => Promise<void>

  // admin: announcements + mentor approvals
  pinnedPostIds: string[]
  announce: (text: string, pin?: boolean) => void
  unpinAnnouncement: (id: string) => void
  pendingMentorIds: string[]
  approveMentor: (id: string) => void
  declineMentor: (id: string, reviewNote?: string) => void

  // notifications
  notifications: AppNotification[]
  unreadNotifications: number
  markNotificationsRead: () => void
  markNotificationRead: (id: string) => void

  // messages
  threads: MessageThread[]
  unreadMessages: number
  sendMessage: (
    threadId: string,
    text: string,
    attachment?: { name: string; dataBase64: string; mediaType: string },
  ) => void
  editMessage: (threadId: string, messageId: string, text: string) => void
  markThreadRead: (threadId: string) => void
  messageUser: (userId: string) => Promise<string>
  refreshThreads: () => Promise<void>

  // search
  query: string
  setQuery: (q: string) => void

  // toasts
  toasts: Toast[]
  notify: (message: string, kind?: ToastKind, action?: ToastAction) => void
  dismissToast: (id: number) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  // ---- auth + server-backed data ------------------------------------------
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [bootstrapped, setBootstrapped] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [users, setUsers] = useState<User[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [connectionIds, setConnectionIds] = useState<string[]>([])
  const [sentRequestIds, setSentRequestIds] = useState<string[]>([])
  const [pendingRequestIds, setPendingRequestIds] = useState<string[]>([])
  const [connectionNotes, setConnectionNotes] = useState<Record<string, string>>({})
  const [threads, setThreads] = useState<MessageThread[]>([])
  const [communities, setCommunities] = useState<Community[]>([])
  const [sessions, setSessions] = useState<MentorshipSession[]>([])
  const [startups, setStartups] = useState<Startup[]>([])
  const [events, setEvents] = useState<AppEvent[]>([])
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [pendingMentorIds, setPendingMentorIds] = useState<string[]>([])

  const [query, setQuery] = useState('')

  // ---- toasts --------------------------------------------------------------
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const notify = useCallback(
    (message: string, kind: ToastKind = 'success', action?: ToastAction) => {
      const id = ++toastSeq
      setToasts((t) => [...t, { id, kind, message, action }])
      // A toast with a button stays long enough to reach it (see Toaster's countdown bar).
      setTimeout(() => dismissToast(id), action ? 6000 : 3500)
    },
    [dismissToast],
  )

  // ---- bootstrap: load users, feed & connections for the signed-in user ---
  // Every call runs in parallel via allSettled — NOT Promise.all — because a
  // hiccup in any *one* of these (a slow/flaky endpoint, a transient 500) must
  // not be treated as "the token is invalid". Only api.me() failing means the
  // session itself is gone; every other slice just degrades to empty on
  // failure instead of forcing a full sign-out.
  const bootstrap = useCallback(async () => {
    const [meR, usersR, feedR, graphR, threadsR, commsR, sessR, supsR, notifsR, evtsR] = await Promise.allSettled([
      api.me(),
      api.getUsers(),
      api.getFeed(),
      api.getConnections(),
      api.getThreads(),
      api.getCommunities(),
      api.getSessions(),
      api.getStartups(),
      api.getNotifications(),
      api.getEvents(),
    ])

    if (meR.status === 'rejected') {
      // Token missing/expired — drop it so the app falls back to signed-out.
      setToken(null)
      setTokenState(null)
      setCurrentUserId(null)
      setBootstrapped(true)
      return
    }

    const me = meR.value
    const allUsers = usersR.status === 'fulfilled' ? usersR.value : []
    const graph = graphR.status === 'fulfilled' ? graphR.value : { connectionIds: [], sentRequestIds: [], pendingRequestIds: [], connectionNotes: {} }
    // Prefer the /auth/me copy of our own record over the directory copy: the
    // directory is the public projection and withholds the private fields
    // (phone, notice period, preferred locations, mentorship wanted).
    setUsers(
      allUsers.some((u) => u.id === me.id)
        ? allUsers.map((u) => (u.id === me.id ? me : u))
        : [me, ...allUsers],
    )
    setCurrentUserId(me.id)
    setPosts(feedR.status === 'fulfilled' ? feedR.value : [])
    setEvents(evtsR.status === 'fulfilled' ? evtsR.value : [])
    setConnectionIds(graph.connectionIds)
    setSentRequestIds(graph.sentRequestIds)
    setPendingRequestIds(graph.pendingRequestIds)
    setConnectionNotes(graph.connectionNotes || {})
    setThreads(threadsR.status === 'fulfilled' ? threadsR.value : [])
    setCommunities(commsR.status === 'fulfilled' ? commsR.value : [])
    setSessions(sessR.status === 'fulfilled' ? sessR.value : [])
    setStartups(supsR.status === 'fulfilled' ? supsR.value : [])
    setNotifications(notifsR.status === 'fulfilled' ? notifsR.value : [])
    // Mentor approvals are an admin-only view.
    if (me.isAdmin) {
      api.getMentorApplications().then(setPendingMentorIds, () => {})
    }
    // Only mentors have a plan, so this is not worth a request for everyone
    // else — the crown falls back to its call-to-action state without it.
    if (me.isMentor) {
      api.getMySubscription().then(setSubscription, () => setSubscription(null))
    }
    setBootstrapped(true)
  }, [])

  // Which social providers are real (backend reports GOOGLE_CLIENT_ID).
  const [googleClientId, setGoogleClientId] = useState<string | null>(null)

  // Run once on mount: if we have a token, hydrate from the API.
  useEffect(() => {
    if (getToken()) bootstrap()
    else setBootstrapped(true)
    api.getAuthConfig().then((c) => setGoogleClientId(c.googleClientId), () => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isAuthenticated = !!currentUserId
  const loading = !!token && !bootstrapped

  // ---- profile -------------------------------------------------------------
  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? GUEST,
    [users, currentUserId],
  )
  // For callbacks that fire later (toast actions) and must see the latest profile.
  const currentUserRef = useRef(currentUser)
  useEffect(() => {
    currentUserRef.current = currentUser
  }, [currentUser])

  async function afterAuth(auth: { token: string; user: User }) {
    setToken(auth.token)
    setTokenState(auth.token)
    setBootstrapped(false)
    await bootstrap()
  }

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password)
    await afterAuth(res)
    return res.user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signup = useCallback(async (ticket: string, name: string, password: string) => {
    const res = await api.signup(ticket, name, password)
    await afterAuth(res)
    return res.user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const social = useCallback(async (provider: 'google' | 'linkedin') => {
    // Real Google OAuth when the backend has a client id; simulated otherwise.
    if (provider === 'google' && googleClientId) {
      const accessToken = await googleSignIn(googleClientId)
      const res = await api.googleAuth(accessToken)
      await afterAuth(res)
      return res.user
    }
    const res = await api.social(provider)
    await afterAuth(res)
    return res.user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId])

  const signOut = useCallback(() => {
    setToken(null)
    setTokenState(null)
    setCurrentUserId(null)
    setUsers([])
    setPosts([])
    setConnectionIds([])
    setSentRequestIds([])
    setPendingRequestIds([])
    setThreads([])
    setCommunities([])
    setSessions([])
    setStartups([])
    setNotifications([])
    setPendingMentorIds([])
  }, [])

  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      const updated = await api.updateProfile(patch)
      setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)))
    },
    [],
  )

  const startWorkEmailVerification = useCallback(async (email: string) => {
    const r = await api.startWorkEmailVerification(email)
    return { email: r.email, simulated: r.simulated }
  }, [])

  const verifyWorkEmail = useCallback(async (code: string) => {
    const updated = await api.verifyWorkEmail(code)
    setUsers((list) => list.map((u) => (u.id === updated.id ? updated : u)))
  }, [])

  const userById = useCallback((id: string) => users.find((u) => u.id === id), [users])

  // Mentor plan. Kept in the store rather than fetched per-component because
  // the navbar crown, the session paywall and the mentor workspace all need
  // the same answer, and they must agree the moment a plan is activated.
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null)
  const refreshSubscription = useCallback(async () => {
    if (!getToken()) return
    try {
      setSubscription(await api.getMySubscription())
    } catch {
      // A member who is not a mentor has nothing to show here; the crown
      // falls back to its call-to-action state rather than erroring.
      setSubscription(null)
    }
  }, [])

  // Re-pull the social state (connection graph, notifications, directory) so
  // requests sent by OTHER users show up without a full reload. Called when
  // My Network mounts and by a background poll.
  const refreshNetwork = useCallback(async () => {
    if (!getToken()) return
    try {
      // The feed is re-pulled alongside the graph, not just at bootstrap:
      // a private member's posts become visible the moment their connection
      // request is accepted, and without this they stayed missing until a
      // reload even though their profile had already unlocked on this poll.
      //
      // allSettled, not Promise.all — for the same reason bootstrap uses it.
      // This runs on a 30s timer, and one failing call (the feed is the
      // largest and slowest) must not take the connection graph,
      // notifications, the directory and refreshThreads down with it.
      const startedAt = Date.now()
      const [graphR, notifsR, allUsersR, feedR] = await Promise.allSettled([
        api.getConnections(),
        api.getNotifications(),
        api.getUsers(),
        api.getFeed(),
      ])

      if (graphR.status === 'fulfilled') {
        const graph = graphR.value
        setConnectionIds(graph.connectionIds)
        setSentRequestIds(graph.sentRequestIds)
        setPendingRequestIds(graph.pendingRequestIds)
        setConnectionNotes(graph.connectionNotes || {})
      }
      if (notifsR.status === 'fulfilled') setNotifications(notifsR.value)
      if (feedR.status === 'fulfilled') {
        const feed = feedR.value
        setPosts((prev) => {
          // Replacing the array wholesale drops anything published while
          // this fetch was already in flight: the snapshot predates the new
          // post, so the "Your post is live" toast fired and the post then
          // vanished until the next poll. Carry those forward.
          const incoming = new Set(feed.map((p) => p.id))
          const publishedSinceFetch = prev.filter(
            (p) => !incoming.has(p.id) && +new Date(p.createdAt) >= startedAt,
          )
          return [...publishedSinceFetch, ...feed]
        })
      }
      if (allUsersR.status === 'fulfilled') {
        const allUsers = allUsersR.value
        setUsers((prev) => {
          const me = prev.find((u) => u.id === currentUserId)
          // Keep my own row from local state (it may hold an in-flight edit).
          return allUsers.map((u) => (u.id === currentUserId && me ? me : u))
        })
      }
      // Outside the guard on purpose: an early return here would make the
      // directory's failure stop chat updating, which is the very coupling
      // allSettled was introduced to break.
      await refreshThreads() // incoming chat messages + unread badge
    } catch {
      /* transient network failure — next poll retries */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId])

  // Realtime: SSE pokes make chat + notifications update the moment they
  // change; the 30s poll below stays as a safety net for missed events.
  useEffect(() => {
    if (!isAuthenticated || !token) return
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`)
    // Connection and mentorship notifications ("X accepted your request",
    // "X confirmed your session" — which also connects the two of you) change
    // the network itself, so those re-pull it: graph, counts and the feed's
    // private posts together. Others (likes, comments) don't, and re-pulling
    // on those would keep overwriting a Connect click still in flight.
    const onNotification = (e: MessageEvent) => {
      api.getNotifications().then(setNotifications, () => {})
      let type: unknown
      try {
        type = (JSON.parse(e.data || '{}') as { type?: unknown }).type
      } catch {
        /* older payload with no data */
      }
      if (type === 'connection' || type === 'mentorship') void refreshNetwork()
    }
    const onMessage = () => void refreshThreads()
    es.addEventListener('notification', onNotification)
    es.addEventListener('message', onMessage)
    return () => es.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token])

  // Background poll (30s) while signed in — fallback behind the SSE stream.
  useEffect(() => {
    if (!isAuthenticated) return
    const interval = setInterval(refreshNetwork, 30_000)
    return () => clearInterval(interval)
  }, [isAuthenticated, refreshNetwork])

  // ---- connections ---------------------------------------------------------
  const connectionState = useCallback(
    (id: string): ConnectionState => {
      if (connectionIds.includes(id)) return 'connected'
      if (sentRequestIds.includes(id)) return 'pending'
      return 'none'
    },
    [connectionIds, sentRequestIds],
  )

  // People-you-may-know: everyone who isn't me, an admin/org account, or
  // already linked.
  //
  // Deliberately NOT filtered by profile completeness: hiding real members
  // from suggestions to punish a thin profile costs the network more than it
  // gains. Completeness only affects the ORDER (see rankByMatch).
  const suggestionIds = useMemo(
    () =>
      rankByMatch(
        users.filter(
          (u) =>
            u.id !== currentUserId &&
            !u.isAdmin &&
            u.id !== 'rooman' &&
            !connectionIds.includes(u.id) &&
            !sentRequestIds.includes(u.id) &&
            !pendingRequestIds.includes(u.id),
        ),
        currentUser,
      ).map((u) => u.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [users, currentUserId, currentUser, connectionIds, sentRequestIds, pendingRequestIds],
  )

  // Bump the displayed connection count for me + the other user after an
  // accepted connection (mirrors the DB-side increment).
  const bumpCounts = useCallback(
    (otherId: string) => {
      setUsers((list) =>
        list.map((u) =>
          u.id === otherId || u.id === currentUserId
            ? { ...u, connectionsCount: u.connectionsCount + 1 }
            : u,
        ),
      )
    },
    [currentUserId],
  )

  const sendConnect = useCallback(
    (id: string, note?: string) => {
      setSentRequestIds((s) => (s.includes(id) ? s : [...s, id]))
      const u = users.find((x) => x.id === id)
      // The button that started this — confetti bursts from it on success.
      const origin = document.activeElement
      api.connect(id, note).then(
        (r) => {
          celebrate(origin)
          if (r.state === 'connected') {
            // The other side had already requested me — instantly connected.
            setSentRequestIds((s) => s.filter((x) => x !== id))
            setPendingRequestIds((p) => p.filter((x) => x !== id))
            setConnectionIds((c) => (c.includes(id) ? c : [...c, id]))
            bumpCounts(id)
            notify(`You are now connected with ${u?.name ?? 'member'}.`)
          } else {
            notify(`Connection request sent to ${u?.name ?? 'member'}.`)
          }
        },
        () => {
          setSentRequestIds((s) => s.filter((x) => x !== id))
          notify('Could not send request. Try again.', 'error')
        },
      )
    },
    [notify, users, bumpCounts],
  )

  const acceptRequest = useCallback(
    (id: string) => {
      setPendingRequestIds((p) => p.filter((x) => x !== id))
      setConnectionIds((c) => (c.includes(id) ? c : [...c, id]))
      const u = users.find((x) => x.id === id)
      api.acceptConnection(id).then(
        () => {
          bumpCounts(id)
          notify(`You are now connected with ${u?.name ?? 'member'}.`)
        },
        () => {
          // Re-read the real state rather than guess it. A failure can mean
          // the request is still pending (back to Requests), or that the two
          // are already connected — e.g. a session agreement connected them
          // a moment earlier — in which case they must stay in My Network.
          notify('Could not accept the request.', 'error')
          void refreshNetwork()
        },
      )
    },
    [notify, users, bumpCounts, refreshNetwork],
  )

  const ignoreRequest = useCallback((id: string) => {
    setPendingRequestIds((p) => p.filter((x) => x !== id))
    api.ignoreConnection(id).catch(() => {})
  }, [])

  const cancelSentRequest = useCallback((id: string) => {
    setSentRequestIds((s) => s.filter((x) => x !== id))
    api.cancelSentRequest(id).catch(() => {})
  }, [])

  // ---- posts ---------------------------------------------------------------
  const createPost = useCallback(
    (input: NewPostInput) => {
      api.createPost({
        type: input.type,
        content: input.content.trim(),
        image: input.image,
        visibility: input.visibility,
        communityId: input.communityId,
        eventId: input.eventId,
        domain: input.domain,
        city: input.city,
        batch: input.batch,
        role: input.role,
        company: input.company,
        questions: input.questions,
        wantsResume: input.wantsResume,
        meta: input.meta,
      }).then(
        (created) => {
          // Published: the composer has closed, so this bursts mid-screen.
          celebrate()
          setPosts((p) => [created, ...p])
          // An Achievement is a win worth sharing outside the network too.
          if (input.type === 'Achievement')
            notify('Your post is live.', 'success', {
              label: 'Make a share card',
              onClick: () =>
                openShareWin({
                  headline: input.content.trim().split('\n')[0].slice(0, 120),
                  name: currentUserRef.current.name,
                  role: [currentUserRef.current.designation, currentUserRef.current.company].filter(Boolean).join(' · '),
                }),
            })
          else notify('Your post is live.')
        },
        (err) => notify(err instanceof Error ? err.message : 'Could not publish your post.', 'error'),
      )
    },
    [notify],
  )

  const toggleLike = useCallback(
    (id: string) => {
      const post = posts.find((p) => p.id === id)
      if (!post) return
      const liking = !post.likedByMe
      // optimistic
      setPosts((list) =>
        list.map((p) =>
          p.id === id ? { ...p, likedByMe: liking, likes: p.likes + (liking ? 1 : -1) } : p,
        ),
      )
      const call = liking ? api.likePost(id) : api.unlikePost(id)
      call.then(
        (r) =>
          setPosts((list) =>
            list.map((p) => (p.id === id ? { ...p, likedByMe: r.likedByMe, likes: r.likes } : p)),
          ),
        () => {
          // revert to the server truth we knew before
          setPosts((list) =>
            list.map((p) =>
              p.id === id ? { ...p, likedByMe: post.likedByMe, likes: post.likes } : p,
            ),
          )
          notify('Could not update like.', 'error')
        },
      )
    },
    [posts, notify],
  )

  // Set, change, or clear (tapping your current emoji again) a reaction.
  const react = useCallback(
    (id: string, emoji: string) => {
      const post = posts.find((p) => p.id === id)
      if (!post) return
      const prev = post.myReaction
      const clearing = prev === emoji
      // optimistic: adjust counts and my reaction locally
      setPosts((list) =>
        list.map((p) => {
          if (p.id !== id) return p
          const reactions: Record<string, number> = { ...(p.reactions ?? {}) }
          if (prev) reactions[prev] = Math.max((reactions[prev] ?? 1) - 1, 0)
          if (!clearing) reactions[emoji] = (reactions[emoji] ?? 0) + 1
          for (const k of Object.keys(reactions)) if (!reactions[k]) delete reactions[k]
          return { ...p, reactions, myReaction: clearing ? undefined : emoji }
        }),
      )
      const call = clearing ? api.unreact(id) : api.react(id, emoji)
      call.then(
        (r) =>
          setPosts((list) =>
            list.map((p) =>
              p.id === id
                ? { ...p, reactions: Object.keys(r.reactions).length ? r.reactions : undefined, myReaction: r.myReaction ?? undefined }
                : p,
            ),
          ),
        () => {
          // revert to the server truth we knew before
          setPosts((list) =>
            list.map((p) => (p.id === id ? { ...p, reactions: post.reactions, myReaction: post.myReaction } : p)),
          )
          notify('Could not save your reaction.', 'error')
        },
      )
    },
    [posts, notify],
  )

  const toggleSave = useCallback(
    (id: string) => {
      const post = posts.find((p) => p.id === id)
      if (!post) return
      const saving = !post.saved
      setPosts((list) => list.map((p) => (p.id === id ? { ...p, saved: saving } : p)))
      const call = saving ? api.savePost(id) : api.unsavePost(id)
      call.then(
        () =>
          saving
            ? notify('Saved to your bookmarks.', 'info')
            : notify('Removed from saved.', 'info', { label: 'Undo', onClick: () => toggleSaveRef.current(id) }),
        () => {
          setPosts((list) => list.map((p) => (p.id === id ? { ...p, saved: post.saved } : p)))
          notify('Could not update saved.', 'error')
        },
      )
    },
    [posts, notify],
  )

  // Undo buttons fire seconds later, after state has moved on, so they must call
  // the latest version of these actions rather than the one captured back then.
  const toggleSaveRef = useRef(toggleSave)
  useEffect(() => {
    toggleSaveRef.current = toggleSave
  }, [toggleSave])

  const addComment = useCallback(
    (postId: string, text: string) => {
      if (!text.trim()) return
      api.addComment(postId, text.trim()).then(
        (comment) =>
          setPosts((list) =>
            list.map((p) =>
              p.id === postId ? { ...p, comments: [...p.comments, comment] } : p,
            ),
          ),
        () => notify('Could not post your comment.', 'error'),
      )
    },
    [notify],
  )

  const updatePost = useCallback(
    (id: string, patch: Partial<Post>) => {
      api.updatePost(id, patch).then(
        (updated) => {
          setPosts((list) => list.map((p) => (p.id === id ? updated : p)))
          notify('Job post updated.')
        },
        (err) => notify(err instanceof Error ? err.message : 'Could not update the post.', 'error'),
      )
    },
    [notify],
  )

  const applyToJob = useCallback(
    (postId: string, answers?: string[], resume?: { name: string; dataBase64: string; mediaType: string }) => {
      const post = posts.find((p) => p.id === postId)
      if (!post || post.appliedByMe) return
      // optimistic
      setPosts((list) =>
        list.map((p) =>
          p.id === postId
            ? { ...p, appliedByMe: true, applicantsCount: (p.applicantsCount ?? 0) + 1 }
            : p,
        ),
      )
      const origin = document.activeElement
      api.applyToJob(postId, answers, resume).then(
        (r) => {
          celebrate(origin)
          setPosts((list) =>
            list.map((p) =>
              p.id === postId ? { ...p, appliedByMe: true, applicantsCount: r.applicantsCount } : p,
            ),
          )
          const author = users.find((u) => u.id === post.authorId)
          notify(`Application sent to ${author?.name ?? 'the poster'} for "${post.role ?? 'the role'}".`)
        },
        (err) => {
          setPosts((list) =>
            list.map((p) =>
              p.id === postId
                ? { ...p, appliedByMe: post.appliedByMe, applicantsCount: post.applicantsCount }
                : p,
            ),
          )
          notify(err instanceof Error ? err.message : 'Could not send your application.', 'error')
        },
      )
    },
    [posts, users, notify],
  )

  // ---- communities (RDS-backed) --------------------------------------------
  const toggleJoin = useCallback(
    (id: string) => {
      const c = communities.find((x) => x.id === id)
      if (!c) return
      const joining = !c.joined
      // optimistic flip
      setCommunities((list) =>
        list.map((x) =>
          x.id === id
            ? { ...x, joined: joining, memberCount: x.memberCount + (joining ? 1 : -1) }
            : x,
        ),
      )
      const call = joining ? api.joinCommunity(id) : api.leaveCommunity(id)
      const origin = document.activeElement
      call.then(
        (updated) => {
          if (joining) celebrate(origin)
          setCommunities((list) => list.map((x) => (x.id === id ? updated : x)))
          if (joining) notify(`Joined ${c.name}.`, 'info')
          else notify(`Left ${c.name}.`, 'info', { label: 'Undo', onClick: () => toggleJoinRef.current(id) })
        },
        () => {
          setCommunities((list) => list.map((x) => (x.id === id ? c : x)))
          notify('Could not update membership.', 'error')
        },
      )
    },
    [communities, notify],
  )
  const toggleJoinRef = useRef(toggleJoin)
  useEffect(() => {
    toggleJoinRef.current = toggleJoin
  }, [toggleJoin])

  const createCommunity = useCallback(
    (c: { name: string; description: string; category: Community['category']; tag: string }) => {
      api.createCommunity(c).then(
        (created) => {
          setCommunities((list) => [created, ...list])
          notify(
            created.status === 'pending'
              ? `"${created.name}" submitted — it goes live once the Rooman team approves it.`
              : `Community "${created.name}" created.`,
          )
        },
        () => notify('Could not create the community.', 'error'),
      )
    },
    [notify],
  )

  // ---- mentorship + startups (RDS-backed) ----------------------------------
  const bookSession = useCallback(
    (mentorId: string, topic: string, date: string, time: string, serviceId?: string) => {
      api.bookSession(mentorId, topic, date, time, serviceId).then(
        (session) => {
          setSessions((s) => [session, ...s])
          const m = users.find((u) => u.id === mentorId)
          notify(`Session requested with ${m?.name ?? 'mentor'} for ${date} at ${time}.`)
        },
        (err) =>
          notify(err instanceof Error ? err.message : 'Could not book the session.', 'error'),
      )
    },
    [notify, users],
  )

  // Mentor actions on a session request; each returns the updated session.
  // Resolves true only when the write actually landed. Callers that own a
  // dialog need that answer: closing on a rejected promise throws away what
  // the user typed while the error toast scrolls past. Actions that ignore
  // the result are unaffected -- a void-typed field accepts any return.
  const sessionAction = useCallback(
    (call: Promise<MentorshipSession>, successMsg: string) =>
      call.then(
        (updated) => {
          setSessions((list) => list.map((s) => (s.id === updated.id ? updated : s)))
          notify(successMsg)
          return true
        },
        (err) => {
          notify(err instanceof Error ? err.message : 'Could not update the session.', 'error')
          return false
        },
      ),
    [notify],
  )

  // Returns the outcome rather than swallowing it: a 402 here means the
  // mentor needs a plan, and the caller opens the pricing page instead of
  // showing a toast the member cannot act on.
  const acceptSession = useCallback(
    async (id: string, meetingLink?: string, resourceLink?: string, resourceTitle?: string): Promise<'ok' | 'payment-required' | 'error'> => {
      try {
        const updated = await api.acceptSession(id, meetingLink, resourceLink, resourceTitle)
        setSessions((list) => list.map((s) => (s.id === updated.id ? updated : s)))
        // Accepting connects mentor and mentee on the server — re-pull the
        // network so they show in My Network with the right counts.
        void refreshNetwork()
        notify('Session confirmed. The mentee has been notified.')
        return 'ok'
      } catch (err) {
        if (isPaymentRequired(err)) return 'payment-required'
        notify(err instanceof Error ? err.message : 'Could not update the session.', 'error')
        // 'error', not 'ok'. The union had no way to say "this failed", so a
        // real failure was reported to the caller as success — the member saw
        // an error toast while the UI carried on as though the session had
        // been accepted.
        return 'error'
      }
    },
    [notify, refreshNetwork],
  )
  const setSessionResourceCount = useCallback((id: string, count: number) => {
    // Returns the same array when nothing changed, so opening the modal on a
    // session whose count is already right doesn't re-render every card.
    setSessions((list) =>
      list.some((s) => s.id === id && s.resourceCount !== count)
        ? list.map((s) => (s.id === id ? { ...s, resourceCount: count } : s))
        : list,
    )
  }, [])

  // A mentor offering a slot is gated by the same plan check as accepting a
  // request, so this reports 'payment-required' the same way acceptSession
  // does rather than showing a toast the mentor can't act on.
  const offerSession = useCallback(
    async (
      menteeId: string, topic: string, date: string, time: string,
      meetingLink?: string, scheduledAt?: string,
      resourceLink?: string, resourceTitle?: string,
    ): Promise<'ok' | 'payment-required' | 'error'> => {
      try {
        const session = await api.offerSession(menteeId, topic, date, time, meetingLink, scheduledAt, resourceLink, resourceTitle)
        setSessions((s) => [session, ...s])
        notify('Session offered — waiting for them to accept.')
        return 'ok'
      } catch (err) {
        if (isPaymentRequired(err)) return 'payment-required'
        notify(err instanceof Error ? err.message : 'Could not offer the session.', 'error')
        // 'error', not 'ok' — the same defect already fixed in acceptSession.
        // Returning 'ok' told the caller the offer had been made, so the Host
        // a session form closed and threw away everything the mentor typed
        // while an error toast went past.
        return 'error'
      }
    },
    [notify],
  )
  const acceptSessionOffer = useCallback(
    (id: string) => sessionAction(api.acceptSessionOffer(id), 'Session confirmed — see My Sessions.'),
    [sessionAction],
  )
  const declineSessionOffer = useCallback(
    (id: string) => sessionAction(api.declineSessionOffer(id), 'Offer declined.'),
    [sessionAction],
  )
  // The mentee's half of mutual confirmation. Until both sides confirm, a
  // session counts toward nobody's stats or badges.
  const confirmSession = useCallback(
    (id: string) =>
      sessionAction(api.confirmSession(id), 'Confirmed — it now counts towards both your records. 🎓'),
    [sessionAction],
  )
  const cancelSession = useCallback(
    (id: string) => sessionAction(api.cancelSession(id), 'Session cancelled.'),
    [sessionAction],
  )
  const setSessionMeetingLink = useCallback(
    (id: string, meetingLink: string) =>
      sessionAction(
        api.setSessionMeetingLink(id, meetingLink),
        meetingLink ? 'Meeting link saved — your mentee has been notified.' : 'Meeting link removed.',
      ),
    [sessionAction],
  )
  const rateSession = useCallback(
    (id: string, rating: number, review?: string) =>
      sessionAction(api.rateSession(id, rating, review), 'Thanks — your rating helps other alumni. ⭐'),
    [sessionAction],
  )
  const declineSession = useCallback(
    (id: string) => sessionAction(api.declineSession(id), 'Session declined.'),
    [sessionAction],
  )
  const editSession = useCallback(
    (id: string, changes: { topic?: string; scheduledAt?: string; meetingLink?: string }) =>
      sessionAction(api.editSession(id, changes), 'Session updated. Your mentee has been notified.'),
    [sessionAction],
  )
  const completeSession = useCallback(
    (id: string, durationMinutes?: number, domain?: string, followUp?: { title: string; url: string }) => {
      sessionAction(
        api.completeSession(id, durationMinutes, domain, followUp),
        'Session marked completed — waiting for your mentee to confirm it. 🎓',
      )
      // reflect the mentor's new session count locally
      setUsers((list) =>
        list.map((u) =>
          u.id === currentUserId ? { ...u, sessionsConducted: (u.sessionsConducted ?? 0) + 1 } : u,
        ),
      )
    },
    [sessionAction, currentUserId],
  )

  const becomeMentor = useCallback(
    (rate: number) => {
      updateProfile({ isMentor: true, willingToMentor: true, mentorRate: rate, sessionsConducted: 0 })
        .then(() => notify('You are now listed as a mentor. 🎉'))
        // Mentoring is gated (2+ years' experience, a postgraduate degree, or a
        // passed assessment). The server's rejection names which requirement is
        // missing — repeat it rather than hiding it behind a generic failure.
        .catch((err) =>
          notify(
            err instanceof Error && err.message && !err.message.startsWith('Request failed')
              ? err.message
              : 'Could not update your mentor status.',
            'error',
          ),
        )
    },
    [notify, updateProfile],
  )

  const createEvent = useCallback(
    async (e: {
      title: string
      description: string
      location: string
      meetingLink?: string
      startsAt: string
      isPaid?: boolean
      price?: number
      capacity?: number
      speakers?: { name: string; bio: string }[]
    }) => {
      const created = await api.createEvent(e)
      setEvents((list) =>
        [...list, created].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
      )
      notify(
        created.status === 'pending'
          ? 'Event submitted — an admin will review it before it goes live.'
          : 'Your event is live — the network has been notified. 🎉',
        created.status === 'pending' ? 'info' : 'success',
      )
    },
    [notify],
  )

  const toggleRsvp = useCallback(
    (id: string) => {
      const ev = events.find((x) => x.id === id)
      if (!ev) return
      const going = ev.rsvpedByMe || ev.waitlistedByMe
      const call = going ? api.unrsvpEvent : api.rsvpEvent
      const origin = document.activeElement
      call(id).then(
        (updated) => {
          setEvents((list) => list.map((x) => (x.id === id ? updated : x)))
          if (!going && updated.rsvpedByMe) celebrate(origin)
        },
        () => notify('Could not update your RSVP. Try again.', 'error'),
      )
    },
    [events, notify],
  )

  const submitEventFeedback = useCallback(
    async (id: string, rating: number, comment: string) => {
      const updated = await api.submitEventFeedback(id, rating, comment)
      setEvents((list) => list.map((x) => (x.id === id ? updated : x)))
    },
    [],
  )

  const cancelEvent = useCallback(
    (id: string) => {
      api.cancelEvent(id).then(
        () => {
          setEvents((list) => list.filter((x) => x.id !== id))
          notify('Event cancelled — attendees have been notified.')
        },
        (err) => notify(err instanceof Error ? err.message : 'Could not cancel the event.', 'error'),
      )
    },
    [notify],
  )

  const submitStartup = useCallback(
    (
      s: { name: string; domain: Startup['domain']; stage: Startup['stage']; teamSize: number; description: string; visibility: 'network' | 'admin' },
      shareToFeed = false,
    ) => {
      api.submitStartup(s).then(
        (created) => {
          setStartups((list) => [created, ...list])
          notify('StartupVarsity application submitted.')
          // Optionally announce the idea to the whole network as a feed post.
          if (shareToFeed) {
            api
              .createPost({
                type: 'StartupVarsity',
                content: `🚀 ${s.name} — ${s.description}\n\nStage: ${s.stage} · Team of ${s.teamSize} · ${s.domain}. Just applied to StartupVarsity!`,
                domain: s.domain,
                visibility: 'All Alumni',
              })
              .then((post) => setPosts((p) => [post, ...p]))
              .catch(() => notify('Idea saved, but sharing to the feed failed.', 'error'))
          }
        },
        () => notify('Could not submit your application.', 'error'),
      )
    },
    [notify],
  )

  // ---- admin: announcements + mentor approvals (RDS-backed) ---------------
  const pinnedPostIds = posts.filter((p) => p.pinned).map((p) => p.id)

  const announce = useCallback(
    (text: string, pin = true) => {
      if (!text.trim()) return
      api.announce(text.trim(), pin).then(
        (post) => {
          setPosts((p) => [post, ...p])
          notify(pin ? 'Announcement pinned to the feed.' : 'News update published.')
        },
        () => notify('Could not publish.', 'error'),
      )
    },
    [notify],
  )

  const unpinAnnouncement = useCallback(
    (id: string) => {
      api.unpinPost(id).then(
        () => {
          setPosts((list) => list.map((p) => (p.id === id ? { ...p, pinned: undefined } : p)))
          notify('Announcement unpinned.', 'info')
        },
        () => notify('Could not unpin the announcement.', 'error'),
      )
    },
    [notify],
  )

  const approveMentor = useCallback(
    (id: string) => {
      const u = users.find((x) => x.id === id)
      const origin = document.activeElement
      api.approveMentor(id).then(
        () => {
          celebrate(origin)
          // Mirrors exactly what the approve route writes. mentorVerified is
          // the half isBookableMentor() checks on top of isMentor, so leaving
          // it out kept a just-approved mentor off the Mentors tab until the
          // admin reloaded.
          setUsers((list) =>
            list.map((x) =>
              x.id === id
                ? {
                    ...x,
                    isMentor: true,
                    willingToMentor: true,
                    mentorVerified: true,
                    mentorRate: x.mentorRate ?? 1000,
                    sessionsConducted: x.sessionsConducted ?? 0,
                  }
                : x,
            ),
          )
          setPendingMentorIds((p) => p.filter((x) => x !== id))
          notify(`${u?.name ?? 'Alumnus'} approved as a mentor.`)
        },
        () => notify('Could not approve the application.', 'error'),
      )
    },
    [notify, users],
  )

  const declineMentor = useCallback(
    (id: string, reviewNote?: string) => {
      const u = users.find((x) => x.id === id)
      api.declineMentor(id, reviewNote).then(
        () => {
          // The decline route also withdraws the listing (is_mentor,
          // willing_to_mentor, mentor_verified_at). Without mirroring that, a
          // previously approved member whose resubmission was declined stayed
          // listed and bookable in this session.
          setUsers((list) =>
            list.map((x) =>
              x.id === id
                ? { ...x, isMentor: false, willingToMentor: false, mentorVerified: false }
                : x,
            ),
          )
          setPendingMentorIds((p) => p.filter((x) => x !== id))
          notify(`${u?.name ?? 'Application'} declined.`, 'info')
        },
        () => notify('Could not decline the application.', 'error'),
      )
    },
    [notify, users],
  )

  // ---- notifications (RDS-backed) ------------------------------------------
  const unreadNotifications = notifications.filter((n) => !n.read).length
  const markNotificationsRead = useCallback(() => {
    if (!notifications.some((n) => !n.read)) return
    setNotifications((list) => list.map((n) => ({ ...n, read: true })))
    api.markAllNotificationsRead().catch(() => {})
  }, [notifications])

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)))
    api.markNotificationRead(id).catch(() => {})
  }, [])

  // ---- messages / chats (RDS-backed) --------------------------------------
  const unreadMessages = threads.reduce((sum, t) => sum + t.unread, 0)

  // Skip applying poll results while a send is in flight so a just-sent
  // message can't briefly vanish (poll snapshot may predate the send).
  const sendsInFlight = useRef(0)

  const refreshThreads = useCallback(async () => {
    if (!getToken() || sendsInFlight.current > 0) return
    try {
      const fresh = await api.getThreads()
      if (sendsInFlight.current === 0) setThreads(fresh)
    } catch {
      /* transient — next poll retries */
    }
  }, [])

  const sendMessage = useCallback(
    (
      threadId: string,
      text: string,
      attachment?: { name: string; dataBase64: string; mediaType: string },
    ) => {
      if (!text.trim() && !attachment) return
      sendsInFlight.current++
      api.sendMessage(threadId, text.trim(), attachment)
        .then(
          (msg) =>
            setThreads((list) =>
              list.map((t) =>
                t.id === threadId
                  ? {
                      ...t,
                      unread: 0,
                      lastMessage: msg.text || (msg.attachment ? `📎 ${msg.attachment.name}` : ''),
                      messages: [...t.messages, msg],
                    }
                  : t,
              ),
            ),
          () => notify('Message failed to send.', 'error'),
        )
        .finally(() => {
          sendsInFlight.current--
        })
    },
    [notify],
  )

  const editMessage = useCallback(
    (threadId: string, messageId: string, text: string) => {
      if (!text.trim()) return
      api.editMessage(threadId, messageId, text.trim())
        .then((msg) =>
          setThreads((list) =>
            list.map((t) => {
              if (t.id !== threadId) return t
              const messages = t.messages.map((m) => (m.id === messageId ? msg : m))
              const last = messages[messages.length - 1]
              return {
                ...t,
                messages,
                lastMessage: last
                  ? last.text || (last.attachment ? `📎 ${last.attachment.name}` : '')
                  : t.lastMessage,
              }
            }),
          ),
        )
        .catch((err) => notify(err instanceof Error ? err.message : 'Could not edit message.', 'error'))
    },
    [notify],
  )

  const markThreadRead = useCallback((threadId: string) => {
    setThreads((list) => list.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)))
    api.markThreadRead(threadId).catch(() => {})
  }, [])

  // Open (or create) a conversation with a user; returns the thread id.
  const messageUser = useCallback(async (userId: string) => {
    const thread = await api.startThread(userId)
    setThreads((list) => (list.some((t) => t.id === thread.id) ? list : [thread, ...list]))
    return thread.id
  }, [])

  const value: AppContextValue = {
    currentUser,
    startWorkEmailVerification,
    verifyWorkEmail,
    isAuthenticated,
    loading,
    googleReady: !!googleClientId,
    login,
    signup,
    social,
    updateProfile,
    signOut,
    users,
    userById,
    connectionState,
    connectionIds,
    suggestionIds,
    pendingRequestIds,
    sentRequestIds,
    connectionNotes,
    sendConnect,
    acceptRequest,
    ignoreRequest,
    cancelSentRequest,
    refreshNetwork,
    subscription,
    refreshSubscription,
    posts,
    createPost,
    updatePost,
    toggleLike,
    react,
    toggleSave,
    addComment,
    applyToJob,
    communities,
    toggleJoin,
    createCommunity,
    sessions,
    bookSession,
    offerSession,
    acceptSessionOffer,
    declineSessionOffer,
    confirmSession,
    cancelSession,
    setSessionMeetingLink,
    acceptSession,
    setSessionResourceCount,
    rateSession,
    declineSession,
    completeSession,
    editSession,
    becomeMentor,
    startups,
    submitStartup,
    events,
    createEvent,
    toggleRsvp,
    cancelEvent,
    submitEventFeedback,
    pinnedPostIds,
    announce,
    unpinAnnouncement,
    pendingMentorIds,
    approveMentor,
    declineMentor,
    notifications,
    unreadNotifications,
    markNotificationsRead,
    markNotificationRead,
    threads,
    unreadMessages,
    sendMessage,
    editMessage,
    markThreadRead,
    messageUser,
    refreshThreads,
    query,
    setQuery,
    toasts,
    notify,
    dismissToast,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
