import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GraduationCap, Lock } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { isValidEmail } from '../lib/csv'
import { landingRoute } from '../lib/landingRoute'
import { setPendingPassword } from '../lib/pendingPassword'
import { Button, Card, PasswordInput } from '../components/ui'
import { AuthBackdrop } from '../components/layout/AuthBackdrop'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// Sign-in for existing members. Authenticates against the backend (JWT) via the
// store, then lands in the app. Demo account: you@rooman.alumni / roomandemo.
//
// ?email=… — invite emails link here with the address pre-filled (see
// backend/src/email.ts). It's locked in that case: the account was created by
// an admin under exactly that address, so letting them retype it only invites
// a typo that reads back as "wrong password".
export function Login() {
  useDocumentTitle('Sign in · Root Connect')
  const navigate = useNavigate()
  const { login } = useApp()
  const [params] = useSearchParams()
  const invitedEmail = params.get('email')?.trim() ?? ''
  const fromInvite = isValidEmail(invitedEmail)

  // The address is locked when it arrives in the URL, so an invited member
  // types only their password. But ?email= is caller-supplied — anyone can
  // craft or forward a link carrying somebody else's address — so the lock
  // has to be escapable, or following such a link leaves a member unable to
  // sign in as themselves without hand-editing the URL.
  const [unlocked, setUnlocked] = useState(false)
  const [email, setEmail] = useState(fromInvite ? invitedEmail : '')
  const emailLocked = fromInvite && !unlocked
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidEmail(email)) return setError('Enter a valid email address.')
    if (!password) return setError('Enter your password.')
    setError(null)
    setLoading(true)
    try {
      const user = await login(email, password)
      // Invite-created accounts are still on the password we generated and
      // mailed them — offer to replace it before anything else. The password
      // they just typed is handed over in memory (see pendingPassword) rather
      // than router state, which would serialise it into window.history and
      // leave it there across reloads.
      if (user.mustChangePassword) {
        setPendingPassword(password)
        navigate('/set-password', { replace: true })
        return
      }
      navigate(landingRoute(user))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.')
      setLoading(false)
    }
  }

  const field =
    'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-100'

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4">
      <AuthBackdrop />
      <Card className="w-full max-w-md p-6 sm:p-8">
        <Link to="/" className="mb-6 inline-flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand text-white">
            <GraduationCap size={22} />
          </span>
          <span className="text-sm font-semibold text-muted">Rooman Alumni Network</span>
        </Link>

        <h1 className="text-xl font-semibold text-ink">
          {fromInvite ? 'Welcome to the network' : 'Welcome back'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {fromInvite
            ? 'Enter the password from your invitation email to sign in.'
            : 'Sign in to your alumni account.'}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3" noValidate>
          {emailLocked ? (
            <div>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-page px-3 py-2.5">
                <Lock size={14} className="shrink-0 text-muted" />
                <span className="truncate text-sm font-medium text-ink">{email}</span>
              </div>
              <p className="mt-1.5 text-xs text-muted">
                This is the address your invitation was sent to.{' '}
                <button
                  type="button"
                  onClick={() => {
                    setUnlocked(true)
                    setEmail('')
                  }}
                  className="font-medium text-brand hover:underline"
                >
                  Not you?
                </button>
              </p>
            </div>
          ) : (
            <input
              className={field}
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
          <PasswordInput
            className={field}
            placeholder="Password"
            autoFocus={emailLocked}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-xs font-semibold text-brand hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  )
}
