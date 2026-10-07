import { useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, MailCheck } from 'lucide-react'
import { api } from '../lib/api'
import { isValidEmail } from '../lib/csv'
import { Button, Card } from '../components/ui'
import { AuthBackdrop } from '../components/layout/AuthBackdrop'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// Request a password-reset link by email.
export function ForgotPassword() {
  useDocumentTitle('Reset your password · Root Connect')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidEmail(email)) return setError('Enter a valid email address.')
    setError(null)
    setLoading(true)
    try {
      const res = await api.forgotPassword(email)
      setSent(true)
      setDevLink(res.devResetLink ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4">
      <AuthBackdrop />
      <Card className="w-full max-w-md p-6 sm:p-8">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-100 text-brand">
          <KeyRound size={22} />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-ink">Forgot your password?</h1>
        <p className="mt-1 text-sm text-muted">
          Enter your sign-in email and we'll send you a link to set a new one.
        </p>

        {sent ? (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-green-700">
              <MailCheck size={16} /> Check your inbox
            </p>
            <p className="mt-1 text-sm text-green-700/80">
              If an account exists for <strong>{email}</strong>, a reset link is on its way. The
              link stays valid for 1 hour.
            </p>
            {devLink && (
              <p className="mt-3 border-t border-green-200 pt-3 text-xs text-muted">
                Email isn't configured on this server (dev mode) — use this link directly:{' '}
                <a href={devLink} className="font-semibold text-brand underline break-all">
                  open reset link
                </a>
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder-muted focus:border-brand focus:ring-2 focus:ring-brand-100 focus:outline-none"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>
              Send reset link
            </Button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-muted">
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  )
}
