import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  GraduationCap,
  Link as LinkIcon,
  MapPin,
  MessageSquare,
  UserPlus,
  X,
} from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { useLayout } from '../layout/LayoutContext'
import { Avatar, Button, VerifiedBadge } from '../ui'
import { api } from '../../lib/api'
import { motion, useReducedMotion } from '../profile/motion'
import { bannerThemeGradient, type Badge } from '../../types'

// Slide-out quick view of a person — bio, expertise, proof-of-work links and
// badges, and Connect/Message CTAs — without leaving the current page.
//
// Visual language matches the redesigned profile page: a dark mesh-gradient
// header behind the avatar instead of a flat white top, and the same
// spring/stagger motion vocabulary (see components/profile/motion.tsx),
// so opening someone's quick view and then their full profile feels like
// one continuous surface rather than two different eras of the app.
export function ProfileQuickView({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { userById, currentUser, connectionState, sendConnect } = useApp()
  const { openChatWith } = useLayout()
  const user = userById(userId)
  const [badges, setBadges] = useState<Badge[] | null>(null)
  const reduced = useReducedMotion()

  useEffect(() => {
    setBadges(null)
    api.getBadges(userId).then(
      (d) => setBadges(d.badges.filter((b) => b.earned)),
      () => setBadges([]),
    )
  }, [userId])

  if (!user) return null
  const isMe = user.id === currentUser.id
  const conn = connectionState(user.id)
  const hasProofOfWork = !!user.linkedin || (badges?.length ?? 0) > 0

  // A tiny stagger on the body sections, mirroring the profile page's Reveal
  // cascade at a scale that suits a drawer rather than a full scrolling page.
  const listVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } },
  }
  const itemVariants = reduced
    ? { hidden: {}, show: {} }
    : { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="flex h-full w-[35vw] min-w-[320px] max-w-md flex-col overflow-y-auto bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        initial={reduced ? undefined : { x: '100%' }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      >
        {/* Header: the same near-black mesh-gradient banner as the full
            profile hero, so the two surfaces read as one design. */}
        <div className="relative h-24 shrink-0 overflow-hidden bg-ink">
          {user.bannerImage ? (
            <img
              src={user.bannerImage}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <>
              <div
                className="absolute inset-0"
                style={{ background: bannerThemeGradient(user.bannerTheme) }}
              />
              {!reduced && (
                <motion.div
                  aria-hidden
                  className="absolute -top-10 -right-8 h-36 w-36 rounded-full bg-white/15 blur-2xl"
                  animate={{ x: [0, 12, 0], y: [0, 8, 0] }}
                  transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
            </>
          )}
          <button
            onClick={onClose}
            aria-label="Close quick view"
            className="absolute top-3 right-3 rounded-full bg-black/20 p-1.5 text-white/80 backdrop-blur-sm hover:bg-black/30 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <motion.div
          className="flex flex-1 flex-col gap-4 px-5 pb-5"
          variants={listVariants}
          initial="hidden"
          animate="show"
        >
          <div className="flex flex-col items-center text-center">
            <motion.span
              initial={reduced ? undefined : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 240, damping: 18 }}
              className="-mt-10 rounded-full ring-4 ring-surface"
            >
              <Avatar name={user.name} src={user.photo} size={80} />
            </motion.span>
            <Link
              to={`/profile/${user.id}`}
              onClick={onClose}
              className="mt-3 inline-flex items-center gap-1 text-lg font-bold text-ink hover:underline"
            >
              {user.name}
              <VerifiedBadge verified={user.emailVerified} size={16} />
            </Link>
            {(user.designation || user.company) && (
              <p className="text-sm text-muted">
                {[user.designation, user.company].filter(Boolean).join(' · ')}
              </p>
            )}
            <p className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted">
              {user.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} /> {user.city}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <GraduationCap size={12} /> Batch {user.batchYear}
              </span>
            </p>
          </div>

          {!isMe && (
            <motion.div variants={itemVariants} className="flex gap-2">
              <Button
                className="flex-1"
                variant="social"
                aria-pressed={conn !== 'none'}
                disabled={conn !== 'none'}
                onClick={() => sendConnect(user.id)}
              >
                <UserPlus size={15} />
                {conn === 'connected' ? 'Connected' : conn === 'pending' ? 'Request sent' : 'Connect'}
              </Button>
              {/* Only once connected — same rule as everywhere else. */}
              {conn === 'connected' && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    openChatWith(user.id)
                    onClose()
                  }}
                >
                  <MessageSquare size={15} /> Message
                </Button>
              )}
            </motion.div>
          )}

          {user.bio && (
            <motion.p variants={itemVariants} className="text-sm leading-relaxed text-ink">
              {user.bio}
            </motion.p>
          )}

          <motion.div variants={itemVariants}>
            <ExpertiseTags expertise={user.expertise} />
          </motion.div>

          {hasProofOfWork && (
            <motion.div variants={itemVariants} className="border-t border-line pt-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
                Proof of work
              </p>
              {user.linkedin && (
                <a
                  href={user.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand-100"
                >
                  <LinkIcon size={14} /> LinkedIn
                </a>
              )}
              {badges && badges.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {badges.map((b) => (
                    <span
                      key={b.id}
                      title={b.description}
                      className="flex items-center gap-1 rounded-full border border-line bg-page px-2.5 py-1 text-xs font-semibold text-ink"
                    >
                      <span>{b.emoji}</span> {b.label}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          <Link
            to={`/profile/${user.id}`}
            onClick={onClose}
            className="group mt-auto flex items-center justify-center gap-1 pt-2 text-center text-sm font-semibold text-brand hover:underline"
          >
            View full profile
            <motion.span aria-hidden whileHover={{ x: 3 }} className="inline-block">
              →
            </motion.span>
          </Link>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

// Collapsed to a single row by default (long expertise lists were pushing
// "Proof of work" way down the drawer) — "Show more" expands to the full
// wrapped list on demand.
const COLLAPSED_SKILL_COUNT = 5

function ExpertiseTags({ expertise }: { expertise: string[] }) {
  const [expanded, setExpanded] = useState(false)
  if (expertise.length === 0) return null

  const hiddenCount = expertise.length - COLLAPSED_SKILL_COUNT
  const shown = expanded || hiddenCount <= 0 ? expertise : expertise.slice(0, COLLAPSED_SKILL_COUNT)

  return (
    <div className={`flex gap-1.5 ${expanded ? 'flex-wrap' : 'overflow-hidden'}`}>
      {shown.map((e) => (
        <span
          key={e}
          className="shrink-0 rounded-full bg-page px-2.5 py-1 text-xs font-medium whitespace-nowrap text-muted"
        >
          {e}
        </span>
      ))}
      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-brand hover:bg-brand-100"
        >
          {expanded ? 'Show less' : `+${hiddenCount} more`}
        </button>
      )}
    </div>
  )
}
