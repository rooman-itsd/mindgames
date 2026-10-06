import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Eye, EyeOff, Loader2 } from 'lucide-react'
import { avatarGradient, initials } from '../../lib/format'
import type { PostType, StatusTag } from '../../types'
import { POST_TYPE_STYLES, STATUS_STYLES } from '../../types'

// Tiny classnames joiner (used by Admin components).
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ---- Avatar ----------------------------------------------------------------
export function Avatar({
  name,
  src,
  size = 40,
  to,
}: {
  name: string
  /** Profile photo (data URL). Falls back to initials when absent. */
  src?: string | null
  size?: number
  to?: string
}) {
  const inner = src ? (
    <img
      src={src}
      alt={name}
      title={name}
      className="inline-block shrink-0 rounded-full object-cover select-none"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(
        name,
      )} font-semibold text-white select-none`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={name}
    >
      {initials(name)}
    </span>
  )
  if (to) return <Link to={to}>{inner}</Link>
  return inner
}

// ---- Overlapping avatar stack (e.g. "N alumni work here", +N overflow) -----
export function AvatarStack({
  people,
  total,
  size = 28,
  max = 4,
}: {
  people: { id: string; name: string; photo?: string }[]
  /** Real total, when it may exceed people.length (drives the "+N" badge). */
  total?: number
  size?: number
  max?: number
}) {
  const shown = people.slice(0, max)
  const extra = Math.max((total ?? people.length) - shown.length, 0)
  return (
    <div className="flex -space-x-2">
      {shown.map((p) => (
        <span key={p.id} className="rounded-full ring-2 ring-surface">
          <Avatar name={p.name} src={p.photo} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-page font-semibold text-muted ring-2 ring-surface select-none"
          style={{ width: size, height: size, fontSize: size * 0.35 }}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}

// ---- Company logo (falls back to an initials badge, like <Avatar>) --------
export function CompanyLogo({
  name,
  logoUrl,
  size = 48,
}: {
  name: string
  logoUrl?: string
  size?: number
}) {
  const [broken, setBroken] = useState(false)
  if (logoUrl && !broken) {
    return (
      <img
        src={logoUrl}
        alt={name}
        onError={() => setBroken(true)}
        className="rounded-xl bg-surface object-contain ring-1 ring-line"
        style={{ width: size, height: size, padding: size * 0.12 }}
      />
    )
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avatarGradient(name)} font-bold text-white select-none`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  )
}

// ---- Verified badge --------------------------------------------------------
// Auto-shown next to a member's name once their email is verified. Purely a
// signal — driven by user.emailVerified (see mappers.ts / email_verified_at).
export function VerifiedBadge({ verified, size = 16 }: { verified?: boolean; size?: number }) {
  if (!verified) return null
  return (
    <span title="Verified member" className="inline-flex shrink-0" aria-label="Verified member">
      <BadgeCheck size={size} className="text-[#1d9bf0]" />
    </span>
  )
}

// ---- Button ----------------------------------------------------------------
/**
 * A button's colour says what it does (Emerald Grove categories, index.css):
 *   primary  save / post / submit — emerald gradient, sweep, lift
 *   cta      join / accept invite / upgrade — marigold, at most one per screen
 *   social   connect / RSVP / join — lagoon outline, fills via aria-pressed
 *   danger   delete / remove / decline — solid rosewood, no sparkle
 *   ai       Ask Roo / autofill / suggest — amethyst → iris
 *   outline · ghost · subtle — secondary and quiet actions
 */
type Variant = 'primary' | 'outline' | 'ghost' | 'subtle' | 'cta' | 'social' | 'danger' | 'ai'

const VARIANTS: Record<Variant, string> = {
  // `btn-primary` (index.css) owns the emerald gradient, hover sweep, lift and
  // press. The gradient is a background IMAGE, so a caller recolouring a primary
  // Button must also pass `!bg-none` or its bg-* colour stays hidden underneath.
  primary: 'btn-primary border border-transparent',
  outline: 'btn-press bg-surface text-brand border border-brand hover:bg-brand-50',
  ghost: 'btn-press bg-transparent text-muted hover:bg-gray-100 border border-transparent',
  subtle: 'btn-press bg-gray-100 text-ink hover:bg-gray-200 border border-transparent',
  cta: 'btn-cta border border-transparent',
  social: 'btn-social border border-transparent',
  danger: 'btn-danger border border-transparent',
  ai: 'btn-ai border border-transparent',
}

export function Button({
  variant = 'primary',
  className = '',
  icon,
  loading = false,
  children,
  disabled,
  ...rest
}: {
  variant?: Variant
  icon?: ReactNode
  loading?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  // While loading the button is disabled (no double submits) but keeps its full
  // colour: the dimmed look is reserved for genuinely unavailable actions.
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full px-4 py-2 text-sm font-semibold ${
        loading ? 'cursor-wait' : 'disabled:cursor-not-allowed disabled:opacity-50'
      } ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {/* Submit slide (index.css): the label slides up and out, the spinner
          slides in from below. */}
      <span className={`btn-label inline-flex items-center gap-2 ${loading ? 'is-out' : ''}`}>
        {icon}
        {children}
      </span>
      <span aria-hidden className={`btn-spinner ${loading ? 'is-in' : ''}`}>
        <Loader2 size={16} className="animate-spin" />
      </span>
    </button>
  )
}

// ---- Password input (adds a show/hide eye toggle) -------------------------
export function PasswordInput({
  className = '',
  ...rest
}: { className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input type={visible ? 'text' : 'password'} className={`pr-10 ${className}`} {...rest} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-ink"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

// ---- Checkbox (Admin invite table) -----------------------------------------
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  ...rest
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (checked: boolean) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'checked' | 'type'>) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked
  }, [indeterminate, checked])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-brand"
      {...rest}
    />
  )
}

// ---- Status tag badge (Admin directory) ------------------------------------
export function StatusBadge({ tag }: { tag: StatusTag }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[tag]}`}>
      {tag}
    </span>
  )
}

// ---- Card ------------------------------------------------------------------
export function Card({
  children,
  className = '',
  id,
  ref,
}: {
  children: ReactNode
  className?: string
  id?: string
  /** Optional, for callers that need to measure or scroll the card into
   *  view. React 19 passes ref straight through as a prop. */
  ref?: Ref<HTMLDivElement>
}) {
  return (
    <div ref={ref} id={id} className={`rounded-xl border border-line bg-surface shadow-sm ${className}`}>
      {children}
    </div>
  )
}

// ---- Post-type badge -------------------------------------------------------
export function PostTypeBadge({ type }: { type: PostType }) {
  if (type === 'Update') return null
  const s = POST_TYPE_STYLES[type]
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.classes}`}>
      {s.label}
    </span>
  )
}

// ---- Generic pill ----------------------------------------------------------
export function Pill({
  children,
  active = false,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
        active
          ? 'bg-brand text-white'
          : 'bg-surface text-muted border border-line hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

// ---- Section heading -------------------------------------------------------
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-lg font-bold text-ink">{children}</h2>
  )
}
