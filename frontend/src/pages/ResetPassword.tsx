import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LockKeyhole } from 'lucide-react'
import { api } from '../lib/api'
import { Button, Card } from '../components/ui'
import { AuthBackdrop } from '../components/layout/AuthBackdrop'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// Set a new password from the emailed reset link (?token=…).
export function ResetPassword() {
  useDocumentTitle('Choose a new password · Root Connect')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setError(null)
    setLoading(true)
    try {
      await api.resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
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
          <LockKeyhole size={22} />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-ink">Set a new password</h1>

        {!token ? (
          <p className="mt-3 text-sm text-muted">
            This page needs the link from your reset email.{' '}
            <Link to="/forgot-password" className="font-semibold text-brand hover:underline">
              Request a new one
            </Link>
            .
          </p>
        ) : done ? (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            Password updated! Taking you to sign in…
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 6 characters)"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder-muted focus:border-brand focus:ring-2 focus:ring-brand-100 focus:outline-none"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink placeholder-muted focus:border-brand focus:ring-2 focus:ring-brand-100 focus:outline-none"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>
              Update password
            </Button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-muted">
          <Link to="/login" className="font-semibold text-brand hover:underline">
            Back to sign in
          </Link>
        </p>
      </Card>
    </div>
  )
}
