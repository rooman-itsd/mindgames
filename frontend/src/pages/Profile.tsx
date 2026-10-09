import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  Briefcase,
  GraduationCap,
  MapPin,
  MessageSquare,
  Clock,
  Flag,
  Handshake,
  UserPlus,
  Edit2,
} from 'lucide-react'
import { useApp } from '../store/AppStore'
import { useLayout } from '../components/layout/LayoutContext'
import { Button, Card, VerifiedBadge, cx } from '../components/ui'
import { PostCard } from '../components/feed/PostCard'
import { EditProfileModal } from '../components/profile/EditProfileModal'
import { ProfilePhoto } from '../components/profile/ProfilePhoto'
import { ProfileBadges } from '../components/profile/ProfileBadges'
import { MentorshipRecord } from '../components/profile/MentorshipRecord'
import { PublicResourcesSection } from '../components/profile/PublicResourcesSection'
import { ProfileCompletenessMeter } from '../components/profile/ProfileCompletenessMeter'
import {
  AboutSection,
  AchievementsSection,
  CertificationsSection,
  DetailsSection,
  EducationSection,
  ExperienceSection,
  hasSharedDetails,
  MentorshipSection,
  OpenToSection,
  PrivateSection,
  ProjectsSection,
} from '../components/profile/ProfileSections'
import { ReportModal } from '../components/ReportModal'
import { ConnectNoteModal } from '../components/referral/ConnectNoteModal'
import { ReachOutModal } from '../components/referral/ReachOutModal'
import { CountUp, HoverLift, Reveal, motion } from '../components/profile/motion'
import { BannerThemePicker } from '../components/profile/BannerThemePicker'
import { roleLine } from '../lib/format'
import { api } from '../lib/api'
import { bannerThemeGradient, type Badge, type MentorApplication } from '../types'
import { EmptyState } from '../components/ui/EmptyState'
import { PenLine } from 'lucide-react'

type Tab = 'overview' | 'posts' | 'resources' | 'about'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'posts', label: 'Posts' },
  { key: 'resources', label: 'Resources' },
  { key: 'about', label: 'About' },
]

export function Profile() {
  const { id } = useParams<{ id: string }>()
  const { currentUser, userById, posts, connectionState, updateProfile, notify } = useApp()
  const [showReferral, setShowReferral] = useState(false)
  const [reportingUser, setReportingUser] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const navigate = useNavigate()
  const { openComposer, openChatWith } = useLayout()
  const [editing, setEditing] = useState(false)

  const targetId = id ?? currentUser.id
  const user = userById(targetId)
  const isMe = targetId === currentUser.id

  const userPosts = useMemo(() => posts.filter((p) => p.authorId === targetId), [posts, targetId])

  // Reset to Overview when moving between profiles, so a tab chosen on one
  // person's page doesn't carry over to the next.
  useEffect(() => setTab('overview'), [targetId])

  if (!user) return <Navigate to="/home" replace />

  const conn = connectionState(user.id)
  const openEditor = () => setEditing(true)

  return (
    <div className="relative flex flex-col gap-4">
      {/* Ambient wash behind the whole page — two faint, static blobs (no
          motion: they sit behind scrolling content, so animating them would
          be wasted GPU work nobody tracks with their eyes). Keeps the page
          from reading as flat page-gray behind a stack of white cards. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[560px] w-[900px] -translate-x-1/2 opacity-[0.06]"
        style={{
          background:
            'radial-gradient(50% 50% at 20% 20%, var(--color-brand) 0%, transparent 70%),' +
            'radial-gradient(40% 40% at 85% 10%, var(--color-marigold) 0%, transparent 70%)',
        }}
      />

      {/* ---- Hero: banner, overlapping avatar, identity, actions -----------
          LinkedIn's arrangement, with a mesh-gradient banner instead of a flat
          bar so the page doesn't open on a solid orange slab. */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm"
      >
        <div className="relative h-32 bg-ink">
          {/* Background art gets its own clipped layer so it still respects
              the card's rounded top corners — the outer container can't
              carry overflow-hidden itself, or it would clip the cover-picker
              dropdown below, which needs to render past the banner's edge. */}
          <div className="absolute inset-0 overflow-hidden rounded-t-xl">
            {user.bannerImage ? (
              // A custom cover photo replaces the gradient (and its drifting
              // glow, which would just muddy a real photo) outright.
              <img
                src={user.bannerImage}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <>
                {/* Three offset radial washes read as depth where one linear
                    gradient reads as a printed band. Colours come from the
                    member's chosen cover theme — 'sunrise' (the default) is
                    pixel-identical to the original hardcoded look. */}
                <div
                  className="absolute inset-0"
                  style={{ background: bannerThemeGradient(user.bannerTheme) }}
                />
                {/* Slow drift, so the header is alive without demanding attention. */}
                <motion.div
                  aria-hidden
                  className="absolute -top-16 -right-10 h-52 w-52 rounded-full bg-white/15 blur-2xl"
                  animate={{ x: [0, 18, 0], y: [0, 10, 0] }}
                  transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
                />
              </>
            )}
          </div>
          {/* Direct edit control, right on the banner — not routed through
              Edit Profile or Quick View. Every choice here saves immediately. */}
          {isMe && <BannerThemePicker current={user.bannerTheme} image={user.bannerImage} />}
        </div>
        <div className="px-5 pb-5">
          <motion.span
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.12, type: 'spring', stiffness: 220, damping: 18 }}
            className="-mt-12 inline-block rounded-full ring-4 ring-surface"
          >
            <ProfilePhoto
              name={user.name}
              photo={user.photo}
              size={88}
              canEdit={isMe}
              onChange={async (photo) => {
                try {
                  await updateProfile({ photo })
                  notify(photo ? 'Profile photo updated.' : 'Profile photo removed.')
                } catch {
                  notify('Could not update your photo. Try again.', 'error')
                }
              }}
            />
          </motion.span>

          <div className="mt-3">
            <h1 className="flex items-center gap-1.5 text-xl font-bold text-ink">
              {user.name}
              <VerifiedBadge verified={user.emailVerified} size={18} />
            </h1>
            {roleLine(user) && (
              <p className="text-sm font-medium text-ink">{roleLine(user)}</p>
            )}
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {user.city && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} /> {user.city}
                </span>
              )}
              <span className="flex items-center gap-1">
                <GraduationCap size={12} /> Batch {user.batchYear} · {user.course}
              </span>
              <span className="flex items-center gap-1">
                <Briefcase size={12} />
                {user.experienceYears > 0 ? `${user.experienceYears} yrs · ` : ''}
                {user.domain}
              </span>
            </p>
          </div>

          {/* Labels follow the member's own answers — nothing to pick by hand. */}
          <div className="mt-3">
            <ProfileBadges user={user} />
          </div>

          {/* ---- Stat tiles, borrowed from Reddit ------------------------- */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat value={user.connectionsCount} label="Connections" />
            <Stat value={userPosts.length} label={userPosts.length === 1 ? 'Post' : 'Posts'} />
            <Stat value={user.sessionsConducted ?? 0} label="Sessions" />
            <Stat value={(user.experience ?? []).length} label="Roles" />
          </div>

          {/* The verified record: mentorship both sides confirmed, events
              actually attended, like involvement, and badges earned from all
              of it — additive to the tiles above, not a replacement. */}
          <div className="mt-3">
            <MentorshipRecord userId={user.id} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {isMe ? (
              <Button variant="outline" icon={<Edit2 size={15} />} onClick={openEditor}>
                Edit Profile
              </Button>
            ) : (
              <>
                <Button
                  icon={<UserPlus size={15} />}
                  variant={conn === 'none' ? 'primary' : 'subtle'}
                  disabled={conn !== 'none'}
                  onClick={() => setShowNoteModal(true)}
                >
                  {conn === 'connected'
                    ? 'Connected'
                    : conn === 'pending'
                      ? 'Request sent'
                      : 'Send Note'}
                </Button>
                {/* Only shown once connected — the backend refuses to open a
                    new DM otherwise, so an unconnected visitor gets "Send
                    Note" as the actionable button instead of one that would
                    just error when clicked. */}
                {conn === 'connected' && (
                  <Button
                    variant="outline"
                    icon={<MessageSquare size={15} />}
                    onClick={() => openChatWith(user.id)}
                  >
                    Message
                  </Button>
                )}
                {user.company && (
                  <Button
                    variant="subtle"
                    icon={<Handshake size={15} />}
                    onClick={() => setShowReferral(true)}
                  >
                    Request Referral
                  </Button>
                )}
                <button
                  onClick={() => setReportingUser(true)}
                  className="ml-auto rounded-full p-2 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                  title={`Report ${user.name}`}
                  aria-label={`Report ${user.name}`}
                >
                  <Flag size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* ---- Tabs, borrowed from Reddit: a few short pages instead of one
          very long scroll. Sticky under the 56px app header. */}
      <div className="sticky top-14 z-10 -mx-4 border-b border-line bg-page/95 px-4 backdrop-blur">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
              className={cx(
                'relative px-4 py-3 text-sm font-semibold transition-colors',
                tab === t.key ? 'text-brand' : 'text-muted hover:text-ink',
              )}
            >
              {t.label}
              {t.key === 'posts' && userPosts.length > 0 && (
                <span className="ml-1.5 text-xs font-normal">{userPosts.length}</span>
              )}
              {tab === t.key && (
                // layoutId lets the underline travel between tabs instead of
                // disappearing and reappearing.
                <motion.span
                  layoutId="profile-tab-underline"
                  className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-brand"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <div className="flex flex-col gap-4">
          {/* Feature row: the completeness meter, About and a verified
              Mentorship offer all earn full width — they carry the most
              information and, for Mentorship, the darkest visual weight on
              the page. Stacked, not gridded, so each reads top to bottom. */}
          {[
            isMe ? (
              <ProfileCompletenessMeter
                user={user}
                postCount={userPosts.length}
                onEdit={openEditor}
              />
            ) : null,
            <AboutSection user={user} isMe={isMe} onAdd={openEditor} />,
            <MentorshipSection
              user={user}
              onBook={isMe ? undefined : () => navigate('/mentorship')}
            />,
            // Only the owner ever sees this — someone else's application
            // status is not this profile's business to advertise.
            isMe ? <MentorshipStatusCard onEdit={openEditor} /> : null,
          ].map((node, i) =>
            node ? (
              <Reveal key={`feature-${i}`} index={i}>
                {node}
              </Reveal>
            ) : null,
          )}

          {/*
            Two independent stacks, not a grid: a grid row is as tall as its
            tallest card, so a short card next to a long one left a hole under
            it. Each column here stacks tight on its own, paired by what the
            cards are about — career (Experience | Education), proof of work
            (Projects | Certifications), then the smaller extras.

            Narrow: the column wrappers are `display: contents` (they vanish
            from layout), so every card is one list, put back in reading order
            with `order-N`. Columns follow the width of this column (a
            container query, `@…:`), not the window: the side rails leave it
            ~820px on a wide screen. `empty:hidden` drops the wrapper of a
            section that renders nothing (Open to, when unset) so it adds no gap.
          */}
          <div className="@container flex flex-col gap-4">
            <div className="flex flex-col gap-4 @2xl:flex-row @2xl:items-start">
              {(
                [
                  [
                    [<ExperienceSection user={user} isMe={isMe} onAdd={openEditor} />, 'order-1', 0],
                    [<ProjectsSection user={user} isMe={isMe} onAdd={openEditor} />, 'order-3', 2],
                    [<AchievementsSection user={user} isMe={isMe} onAdd={openEditor} />, 'order-5', 4],
                  ],
                  [
                    [<EducationSection user={user} isMe={isMe} onAdd={openEditor} />, 'order-2', 1],
                    [<CertificationsSection user={user} isMe={isMe} onAdd={openEditor} />, 'order-4', 3],
                    [<OpenToSection user={user} />, 'order-6', 5],
                  ],
                ] as const
              ).map((column, c) => (
                <div
                  key={`col-${c}`}
                  className="contents @2xl:flex @2xl:min-w-0 @2xl:flex-1 @2xl:flex-col @2xl:gap-4"
                >
                  {column.map(([node, order, i]) => (
                    <Reveal
                      key={`bento-${i}`}
                      index={i + 3}
                      className={`${order} @2xl:order-none empty:hidden`}
                    >
                      {node}
                    </Reveal>
                  ))}
                </div>
              ))}
            </div>
            <Reveal index={9}>
              <BadgesCard userId={user.id} isMe={isMe} />
            </Reveal>
          </div>
        </div>
      )}

      {tab === 'posts' && (
        <>
          {isMe && (
            <Button variant="outline" className="self-start" onClick={() => openComposer()}>
              New Post
            </Button>
          )}
          {userPosts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
          {userPosts.length === 0 &&
            (isMe ? (
              <EmptyState
                icon={<PenLine size={28} />}
                title="Share your first post"
                body="An update, a win, or what you're working on. Your network sees it on their feed."
                action={{ label: 'Create a post', onClick: () => openComposer() }}
              />
            ) : (
              <EmptyState icon={<PenLine size={28} />} title="No posts yet" />
            ))}
        </>
      )}

      {/* Recommended resources — moved here from the header card. */}
      {tab === 'resources' && (
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <PublicResourcesSection
            userId={user.id}
            empty={<p className="py-8 text-center text-sm text-muted">No resources shared yet.</p>}
          />
        </div>
      )}

      {tab === 'about' && <AboutTab user={user} isMe={isMe} onEdit={openEditor} />}

      {reportingUser && (
        <ReportModal
          targetType="user"
          targetId={user.id}
          targetLabel={user.name}
          onClose={() => setReportingUser(false)}
        />
      )}
      {editing && <EditProfileModal onClose={() => setEditing(false)} />}
      {showReferral && <ReachOutModal user={user} onClose={() => setShowReferral(false)} />}
      {showNoteModal && <ConnectNoteModal user={user} onClose={() => setShowNoteModal(false)} />}
    </div>
  )
}

/** One tile in the stat strip. Counts up the first time it's seen. */
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <HoverLift className="rounded-lg bg-page px-3 py-2 text-center">
      <CountUp to={value} className="block text-lg font-bold leading-tight text-ink" />
      <span className="text-[11px] font-medium tracking-wide text-muted uppercase">
        {label}
      </span>
    </HoverLift>
  )
}

/**
 * Contact, links and preferences — plus the owner-only block. Both halves can
 * be empty, so the tab falls back to a prompt rather than a blank screen.
 */
function AboutTab({
  user,
  isMe,
  onEdit,
}: {
  user: Parameters<typeof DetailsSection>[0]['user']
  isMe: boolean
  onEdit: () => void
}) {
  // Asks <DetailsSection> itself rather than re-listing its fields: the old
  // hand-written list left out other links, address, age and salary, so a
  // profile sharing only one of those rendered the card AND "No details
  // shared." at the same time.
  const hasDetails = hasSharedDetails(user)

  return (
    <>
      <DetailsSection user={user} />
      {isMe && <PrivateSection user={user} />}
      {!hasDetails && (
        <div className="rounded-xl border border-line bg-surface py-12 text-center text-sm text-muted shadow-sm">
          {isMe ? (
            <>
              Nothing here yet.{' '}
              <button onClick={onEdit} className="font-semibold text-brand hover:underline">
                Add your links and details
              </button>
            </>
          ) : (
            'No details shared.'
          )}
        </div>
      )}
    </>
  )
}

/**
 * "Mentorship application pending/declined", shown ONLY to the profile owner
 * and ONLY while they have a submission that isn't approved yet. Nothing
 * renders for a verified mentor (MentorshipSection already covers that), for
 * someone who never applied, or on anyone else's profile — a member's
 * application status is theirs to see, not the network's.
 */
function MentorshipStatusCard({ onEdit }: { onEdit: () => void }) {
  const [app, setApp] = useState<MentorApplication | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    api
      .getMyMentorApplication()
      .then((a) => live && setApp(a))
      .catch(() => live && setApp(null))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [])

  if (loading || !app || app.status === 'approved') return null
  const pending = app.status === 'pending'

  return (
    <div
      className={cx(
        'rounded-xl border p-5',
        pending ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50',
      )}
    >
      <h2 className="flex items-center gap-2 text-base font-bold text-ink">
        <Clock size={17} className={pending ? 'text-amber-600' : 'text-red-500'} />
        {pending ? 'Mentorship application pending' : 'Mentorship application declined'}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink/70">
        {pending
          ? 'An admin is reviewing the proof you submitted — this usually takes a couple of days. Your profile will show you as a mentor once approved.'
          : app.reviewNote ||
            'Your last submission was not accepted. You can attach clearer proof and try again.'}
      </p>
      {!pending && (
        <button
          onClick={onEdit}
          className="mt-3 rounded-full btn-primary px-4 py-2 text-xs font-bold text-white"
        >
          Resubmit proof
        </button>
      )}
    </div>
  )
}

/** Computed badges + activity points, fetched per profile. */
function BadgesCard({ userId, isMe }: { userId: string; isMe: boolean }) {
  const [data, setData] = useState<{ points: number; badges: Badge[] } | null>(null)

  useEffect(() => {
    setData(null)
    api.getBadges(userId).then(setData, () => setData(null))
  }, [userId])

  const earned = data?.badges.filter((b) => b.earned) ?? []
  if (!data || earned.length === 0) return null

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-ink">Badges</h2>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand">
          ⭐ {data.points} points
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {earned.map((b) => (
          <span
            key={b.id}
            title={b.description}
            className="flex cursor-default items-center gap-1.5 rounded-full border border-line bg-page px-3 py-1.5 text-sm font-semibold text-ink"
          >
            <span>{b.emoji}</span> {b.label}
          </span>
        ))}
      </div>
      {isMe && data.badges.some((b) => !b.earned) && (
        <p className="mt-3 text-xs text-muted">
          {data.badges.filter((b) => b.earned).length}/{data.badges.length} earned — keep posting,
          connecting and mentoring to unlock the rest.
        </p>
      )}
    </Card>
  )
}
