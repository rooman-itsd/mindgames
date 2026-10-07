import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, LogOut, Moon, Pencil, ShieldCheck } from 'lucide-react'
import { useApp } from '../store/AppStore'
import { api } from '../lib/api'
import { Avatar, Button, Card } from '../components/ui'
import { EditProfileModal } from '../components/profile/EditProfileModal'
import { useTheme } from '../hooks/useTheme'

export function Settings() {
  const [theme, setTheme] = useTheme()
  const { currentUser, signOut, notify } = useApp()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)

  // change password form
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // request an email change
  const [requestingEmailChange, setRequestingEmailChange] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailReason, setEmailReason] = useState('')
  const [sendingEmailRequest, setSendingEmailRequest] = useState(false)

  const field =
    'w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand'

  async function requestEmailChange(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail.trim()) return
    setSendingEmailRequest(true)
    try {
      await api.requestEmailChange(newEmail.trim(), emailReason.trim() || undefined)
      notify('Request sent. Your administrator will follow up by email.')
      setRequestingEmailChange(false)
      setNewEmail('')
      setEmailReason('')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not send the request.', 'error')
    } finally {
      setSendingEmailRequest(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (next.length < 6) return setError('New password must be at least 6 characters.')
    if (next !== confirm) return setError('New passwords do not match.')
    setError(null)
    setSaving(true)
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      notify('Password updated. Use it the next time you sign in.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-ink">Settings</h1>

      {/* Account */}
      <Card className="p-5">
        <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-ink">
          <ShieldCheck size={18} className="text-brand" /> Account
        </h2>
        <div className="flex items-center gap-4">
          <Avatar name={currentUser.name} src={currentUser.photo} size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{currentUser.name}</p>
            <p className="truncate text-sm text-muted">{currentUser.email}</p>
            <p className="text-xs text-muted">
              Batch {currentUser.batchYear} · {currentUser.course || 'Course not set'}
              {currentUser.isAdmin ? ' · Admin' : ''}
            </p>
          </div>
          <Button variant="outline" icon={<Pencil size={15} />} onClick={() => setEditing(true)}>
            Edit Profile
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted">
          Your email is your sign-in identity and can't be changed here.{' '}
          {!requestingEmailChange && (
            <button
              type="button"
              className="font-medium text-brand hover:underline"
              onClick={() => setRequestingEmailChange(true)}
            >
              Request a change
            </button>
          )}
        </p>
        {requestingEmailChange && (
          <form onSubmit={requestEmailChange} className="mt-3 flex max-w-md flex-col gap-2">
            <input
              className={field}
              type="email"
              placeholder="New email address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
            />
            <input
              className={field}
              type="text"
              placeholder="Reason (optional)"
              value={emailReason}
              onChange={(e) => setEmailReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={sendingEmailRequest}>
                {sendingEmailRequest ? 'Sending…' : 'Send request'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRequestingEmailChange(false)
                  setNewEmail('')
                  setEmailReason('')
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Change password */}
      <Card className="p-5">
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-ink">
          <KeyRound size={18} className="text-brand" /> Change Password
        </h2>
        <p className="mb-4 text-sm text-muted">
          Signed up with Google? Leave the current password empty to set one.
        </p>
        <form onSubmit={changePassword} className="flex max-w-md flex-col gap-3">
          <input
            className={field}
            type="password"
            placeholder="Current password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
          <input
            className={field}
            type="password"
            placeholder="New password (min 6 chars)"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
          <input
            className={field}
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="self-start" loading={saving}>
            Update Password
          </Button>
        </form>
      </Card>

      {/* Appearance — opt-in dark mode, remembered on this device. */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <Moon size={18} className="text-brand" /> Dark mode
            </h2>
            <p className="mt-1 text-sm text-muted">Easier on the eyes at night. Saved on this device only.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label="Dark mode"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${theme === 'dark' ? 'bg-brand' : 'bg-gray-300'}`}
          >
            <span
              aria-hidden
              className={`absolute top-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${theme === 'dark' ? 'translate-x-5' : ''}`}
            />
          </button>
        </div>
      </Card>

      {/* Session */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-bold text-ink">Session</h2>
        <Button
          variant="outline"
          icon={<LogOut size={15} />}
          onClick={() => {
            signOut()
            navigate('/')
          }}
        >
          Sign out
        </Button>
      </Card>

      {editing && <EditProfileModal onClose={() => setEditing(false)} />}
    </div>
  )
}
