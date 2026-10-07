import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, Mail, RotateCcw, Send, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useApp } from '../../store/AppStore'
import type { InviteEmailTemplate } from '../../types'
import { Button } from '../ui'

// Edits the credentials email an invited member receives. Sending an invite
// creates their account and mails them a generated password, so this copy is
// the only place those credentials are ever shown — which is why {{password}}
// and {{link}} can't be removed (the backend rejects a body without them).
//
// A saved template is an override; "Reset to default" deletes it rather than
// writing the default text back, so the built-in copy stays the source of
// truth and can be improved in code later without stranding anyone.

/** Substitutes {{name}}-style tokens — mirrors renderTemplate on the backend. */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : whole,
  )
}

export function InviteEmailTemplateModal({
  onClose,
  // "Review before sending" mode: the send is held until the admin has seen
  // the copy and confirmed. onConfirmSend does the actual sending; the modal
  // saves any edits first so what's reviewed is what goes out.
  sendCount,
  onConfirmSend,
}: {
  onClose: () => void
  sendCount?: number
  onConfirmSend?: () => Promise<void>
}) {
  const { notify } = useApp()
  const [tpl, setTpl] = useState<InviteEmailTemplate | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const reviewMode = typeof sendCount === 'number' && !!onConfirmSend
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    api
      .getInviteEmailTemplate()
      .then((t) => {
        setTpl(t)
        setSubject(t.subject)
        setBody(t.body)
        // Reviewing before a send should open on the rendered result, not raw
        // placeholders — that's the thing being verified.
        if (reviewMode) setShowPreview(true)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the template.'))
      .finally(() => setLoading(false))
    // reviewMode is fixed for the life of this modal (it's derived from props
    // set at open time), so it needs no re-fetch — listed to satisfy the
    // exhaustive-deps rule without changing behaviour.
  }, [reviewMode])

  const dirty = !!tpl && (subject !== tpl.subject || body !== tpl.body)

  const preview = useMemo(() => {
    if (!tpl) return { subject: '', body: '' }
    return { subject: render(subject, tpl.sample), body: render(body, tpl.sample) }
  }, [subject, body, tpl])

  // Which required tokens the current draft has dropped — surfaced live so the
  // admin sees it while typing rather than only when Save is refused.
  // Probe through the same substitution the server uses, rather than a
  // literal `includes`: the server's regex tolerates `{{ password }}`, so a
  // literal check rejected valid bodies while telling the admin to add a
  // token that was already there.
  const missing = useMemo(() => {
    if (!tpl) return []
    const probe = render(
      body,
      Object.fromEntries(tpl.placeholders.map((name) => [name, `<<${name}>>`])),
    )
    return tpl.required.filter((name) => !probe.includes(`<<${name}>>`))
  }, [body, tpl])

  /** Drops a token in at the cursor, so the legend is usable, not just documentation. */
  function insert(token: string) {
    const el = bodyRef.current
    const text = `{{${token}}}`
    if (!el) return setBody((b) => b + text)
    const start = el.selectionStart ?? body.length
    const end = el.selectionEnd ?? body.length
    setBody(body.slice(0, start) + text + body.slice(end))
    // Restore focus and drop the caret after what we just inserted.
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
    })
  }

  async function save() {
    setError(null)
    setSaving(true)
    try {
      await api.saveInviteEmailTemplate(subject, body)
      notify('Invite email template saved — the next batch will use it.')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the template.')
    } finally {
      setSaving(false)
    }
  }

  /** Save any edits, then hand off to the caller to actually send. */
  async function confirmAndSend() {
    if (!onConfirmSend) return
    setError(null)
    setSending(true)
    try {
      if (dirty) await api.saveInviteEmailTemplate(subject, body)
      await onConfirmSend()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the invitations.')
      setSending(false)
    }
  }

  async function reset() {
    setError(null)
    setSaving(true)
    try {
      const d = await api.resetInviteEmailTemplate()
      setSubject(d.subject)
      setBody(d.body)
      setTpl((t) => (t ? { ...t, subject: d.subject, body: d.body, isCustom: false, updatedAt: null } : t))
      notify('Reverted to the default invite email.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset the template.')
    } finally {
      setSaving(false)
    }
  }

  const field =
    'w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-3xl rounded-xl bg-surface shadow-xl">
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <Mail size={18} className="text-brand" />
              {reviewMode ? 'Review before sending' : 'Invite Email Template'}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {reviewMode
                ? `This is what ${sendCount} recipient${sendCount === 1 ? '' : 's'} will receive. Edit it here if you need to.`
                : `${tpl?.isCustom ? 'Customised' : 'Using the built-in default'}${
                    tpl?.updatedAt ? ` · edited ${new Date(tpl.updatedAt).toLocaleDateString()}` : ''
                  }`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-gray-100 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted">Loading…</p>
          ) : (
            <>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Subject
              </label>
              <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} />

              <div className="mt-4 flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                  Body
                </label>
                <button
                  type="button"
                  onClick={() => setShowPreview((p) => !p)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
                >
                  <Eye size={13} /> {showPreview ? 'Hide preview' : 'Show preview'}
                </button>
              </div>

              {showPreview ? (
                <div className="mt-1 rounded-lg border border-line bg-page p-4">
                  <p className="mb-2 text-xs text-muted">
                    Preview with sample values — this is what a recipient sees.
                  </p>
                  <p className="mb-3 text-sm font-semibold text-ink">{preview.subject}</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words font-sans text-sm text-ink">
                    {preview.body}
                  </pre>
                </div>
              ) : (
                <textarea
                  ref={bodyRef}
                  className={`${field} mt-1 min-h-[260px] font-mono text-xs leading-relaxed`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  spellCheck={false}
                />
              )}

              {/* placeholder legend — click to insert at the cursor */}
              <div className="mt-3">
                <p className="mb-1.5 text-xs text-muted">
                  Click to insert. These are filled in per recipient when the invite is sent.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tpl?.placeholders.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => insert(name)}
                      disabled={showPreview}
                      title={tpl.required.includes(name) ? 'Required' : 'Optional'}
                      className="rounded-full border border-line bg-page px-2.5 py-1 font-mono text-xs text-ink transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {`{{${name}}}`}
                      {tpl.required.includes(name) && <span className="ml-1 text-brand">*</span>}
                    </button>
                  ))}
                </div>
              </div>

              {missing.length > 0 && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                  Add {missing.map((m) => `{{${m}}}`).join(' and ')} back to the body — without it the
                  invited member has no way to sign in, so this can't be saved.
                </p>
              )}

              {error && (
                <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4">
          <Button
            variant="ghost"
            icon={<RotateCcw size={15} />}
            onClick={reset}
            disabled={loading || saving || !tpl?.isCustom}
            title={tpl?.isCustom ? 'Revert to the built-in copy' : 'Already using the default'}
          >
            Reset to default
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            {reviewMode ? (
              <Button
                onClick={confirmAndSend}
                loading={sending}
                disabled={loading || missing.length > 0}
                icon={<Send size={15} />}
              >
                {dirty ? 'Save & send' : 'Send'} {sendCount} invitation{sendCount === 1 ? '' : 's'}
              </Button>
            ) : (
              <Button onClick={save} loading={saving} disabled={loading || !dirty || missing.length > 0}>
                Save template
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
