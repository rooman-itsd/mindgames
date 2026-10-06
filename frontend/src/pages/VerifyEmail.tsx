import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BadgeCheck, CircleAlert, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { Card } from '../components/ui'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

// Landing page for the emailed verification link (?token=…).
export function VerifyEmail() {
  useDocumentTitle('Verify your email · Root Connect')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setState('failed')
      setMessage('This page needs the link from your verification email.')
      return
    }
    api.verifyEmail(token).then(
      () => setState('done'),
      (err) => {
        setState('failed')
        setMessage(err instanceof Error ? err.message : 'Verification failed.')
      },
    )
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <Card className="w-full max-w-md p-8 text-center">
        {state === 'working' && (
          <>
            <Loader2 size={32} className="mx-auto animate-spin text-brand" />
            <p className="mt-4 text-sm text-muted">Verifying your email…</p>
          </>
        )}
        {state === 'done' && (
          <>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-100 text-green-600">
              <BadgeCheck size={30} />
            </span>
            <h1 className="mt-4 text-xl font-semibold text-ink">Email verified! ✅</h1>
            <p className="mt-1 text-sm text-muted">
              Thanks — your account is confirmed and you've earned the Verified badge.
            </p>
            {/* Full reload so the app picks up the fresh verified state. */}
            <a
              href="/home"
              className="mt-6 inline-block rounded-full btn-primary px-6 py-2.5 text-sm font-bold text-white"
            >
              Continue to Root Connect
            </a>
          </>
        )}
        {state === 'failed' && (
          <>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-100 text-red-500">
              <CircleAlert size={30} />
            </span>
            <h1 className="mt-4 text-xl font-semibold text-ink">Verification failed</h1>
            <p className="mt-1 text-sm text-muted">{message}</p>
            <p className="mt-4 text-sm text-muted">
              Sign in and use the "Resend link" option in the banner, or{' '}
              <Link to="/login" className="font-semibold text-brand hover:underline">
                go to sign in
              </Link>
              .
            </p>
          </>
        )}
      </Card>
    </div>
  )
}
