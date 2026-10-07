import { useEffect, useRef, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button, Card } from '../ui'
import { api, type ServiceInput } from '../../lib/api'
import { useApp } from '../../store/AppStore'
import { SERVICE_ICONS, serviceName, servicePrice } from '../../lib/careerServices'
import { SERVICE_CATEGORIES, SERVICE_LABELS, type AlumniService, type ServiceType } from '../../types'

const BLANK: ServiceInput = {
  serviceType: 'career_guidance',
  title: '',
  description: '',
  tags: [],
  pricingMode: 'free',
  pricingUnit: 'session',
}

/** Mentor-side panel: list, add, edit, pause and delete the services this
 *  member offers. Only reachable by approved mentors — the same verification
 *  bar the rest of mentorship already uses. */
export function ManageServicesPanel({
  onClose,
  hideHeading = false,
}: {
  onClose: () => void
  /** Set when the surrounding screen already carries the title and a way out,
   *  so the panel doesn't repeat "Services you offer" and offer a second close. */
  hideHeading?: boolean
}) {
  const { notify } = useApp()
  const [mine, setMine] = useState<AlumniService[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ServiceInput>(BLANK)
  const [tagText, setTagText] = useState('')
  /** Id of the service the form is editing, or null when the form adds a new
   *  one. One form serves both so the fields can never drift apart. */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AlumniService | null>(null)
  const [deleting, setDeleting] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  // This panel opens below the button that spawned it, and in Mentor Space
  // that button sits near the bottom of a long page — so the panel appeared
  // off-screen and pressing "Manage services" looked like it did nothing at
  // all. Bring it into view instead of leaving the member to guess.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  useEffect(() => {
    api
      .getMyServices()
      .then(setMine)
      .catch(() => notify('Could not load your services.', 'error'))
      .finally(() => setLoading(false))
  }, [notify])

  function resetForm() {
    setEditingId(null)
    setForm(BLANK)
    setTagText('')
  }

  /** Load an existing service into the shared form. The form sits at the
   *  bottom of a potentially long list, so bring it into view — otherwise
   *  pressing the pencil looks like it does nothing. */
  function startEdit(s: AlumniService) {
    setEditingId(s.id)
    setForm({
      serviceType: s.serviceType,
      title: s.title ?? '',
      description: s.description ?? '',
      tags: s.tags ?? [],
      pricingMode: s.pricingMode,
      amount: s.amount ?? undefined,
      pricingUnit: s.pricingUnit ?? 'session',
    })
    setTagText((s.tags ?? []).join(', '))
    requestAnimationFrame(() =>
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    )
  }

  async function save() {
    setSaving(true)
    const body: ServiceInput = {
      ...form,
      tags: tagText.split(',').map((t) => t.trim()).filter(Boolean),
    }
    try {
      if (editingId) {
        const updated = await api.updateService(editingId, body)
        setMine((list) => list.map((x) => (x.id === updated.id ? updated : x)))
        notify('Service updated.', 'success')
      } else {
        const created = await api.createService(body)
        setMine((list) => [created, ...list])
        notify('Service added.', 'success')
      }
      resetForm()
    } catch (err) {
      const fallback = editingId ? 'Could not save your changes.' : 'Could not add the service.'
      notify(err instanceof Error ? err.message : fallback, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(s: AlumniService) {
    try {
      const updated = await api.updateService(s.id, { active: !s.active })
      setMine((list) => list.map((x) => (x.id === updated.id ? updated : x)))
    } catch {
      notify('Could not update the service.', 'error')
    }
  }

  async function remove(s: AlumniService) {
    setDeleting(true)
    try {
      const { unlinkedSessions } = await api.deleteService(s.id)
      setMine((list) => list.filter((x) => x.id !== s.id))
      // The form would otherwise keep editing a service that no longer exists
      // and fail with a 404 on save.
      if (editingId === s.id) resetForm()
      setConfirmDelete(null)
      notify(
        unlinkedSessions > 0
          ? `Service deleted. ${unlinkedSessions} booked ${
              unlinkedSessions === 1 ? 'session keeps' : 'sessions keep'
            } its original price.`
          : 'Service deleted.',
        'success',
      )
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete the service.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card ref={panelRef} className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {!hideHeading && <h2 className="text-lg font-bold text-ink">Services you offer</h2>}
          <p className="text-sm text-muted">
            Listed to members whose roadmap matches what you provide. Pricing is shown to them —
            payment is arranged with you directly.
          </p>
        </div>
        {!hideHeading && (
          <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-gray-100" aria-label="Close">
            <X size={18} />
          </button>
        )}
      </div>

      {loading ? (
        <p className="py-4 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mb-5 flex flex-col gap-2">
          {mine.length === 0 && (
            <p className="rounded-lg bg-gray-50 px-4 py-4 text-sm text-muted">
              You haven’t listed any services yet.
            </p>
          )}
          {mine.map((s) => {
            const { icon: Icon, classes } = SERVICE_ICONS[s.serviceType] ?? SERVICE_ICONS.career_guidance
            const isEditing = editingId === s.id
            return (
              <div
                key={s.id}
                className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5 ${
                  isEditing ? 'border-brand bg-brand-50/40' : 'border-line'
                }`}
              >
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${classes}`}>
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{serviceName(s)}</p>
                  <p className="truncate text-xs text-muted">
                    {servicePrice(s)}
                    {s.tags.length > 0 && ` · ${s.tags.join(', ')}`}
                  </p>
                </div>
                <button
                  onClick={() => toggleActive(s)}
                  title={s.active ? 'Pause this service' : 'Make this service active again'}
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-muted'
                  }`}
                >
                  {s.active ? 'Active' : 'Paused'}
                </button>
                <RowBtn
                  label={isEditing ? 'Stop editing this service' : 'Edit this service'}
                  onClick={() => (isEditing ? resetForm() : startEdit(s))}
                >
                  {isEditing ? <X size={14} /> : <Pencil size={14} />}
                </RowBtn>
                <RowBtn label="Delete this service" danger onClick={() => setConfirmDelete(s)}>
                  <Trash2 size={14} />
                </RowBtn>
              </div>
            )
          })}
        </div>
      )}

      <div ref={formRef} className="border-t border-line pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">
            {editingId ? 'Edit service' : 'Add a service'}
          </h3>
          {editingId && (
            <button
              onClick={resetForm}
              className="text-xs font-semibold text-muted hover:text-ink hover:underline"
            >
              Cancel edit
            </button>
          )}
        </div>

        <label className="mb-1 block text-xs font-semibold text-muted">Type</label>
        <select
          value={form.serviceType}
          onChange={(e) => setForm({ ...form, serviceType: e.target.value as ServiceType })}
          className="mb-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        >
          {SERVICE_CATEGORIES.map((cat) => (
            <optgroup key={cat.label} label={cat.label}>
              {cat.types.map((t) => (
                <option key={t} value={t}>
                  {SERVICE_LABELS[t]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <label className="mb-1 block text-xs font-semibold text-muted">Title (optional)</label>
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder={SERVICE_LABELS[form.serviceType]}
          className="mb-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <label className="mb-1 block text-xs font-semibold text-muted">What you provide</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={2}
          className="mb-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <label className="mb-1 block text-xs font-semibold text-muted">
          Skills / domains it covers (comma separated)
        </label>
        <input
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          placeholder="python, llm, rag"
          className="mb-3 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand"
        />

        <label className="mb-1 block text-xs font-semibold text-muted">Pricing</label>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(['free', 'paid', 'custom'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setForm({ ...form, pricingMode: mode })}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium capitalize ${
                form.pricingMode === mode
                  ? 'border-brand bg-brand-50 text-brand'
                  : 'border-line text-ink hover:bg-gray-50'
              }`}
            >
              {mode === 'custom' ? 'On request' : mode}
            </button>
          ))}
          {form.pricingMode === 'paid' && (
            <>
              <span className="text-sm text-muted">₹</span>
              <input
                type="number"
                min={0}
                value={form.amount ?? ''}
                onChange={(e) => setForm({ ...form, amount: e.target.value === '' ? undefined : Number(e.target.value) })}
                className="w-24 rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-brand"
              />
              <select
                value={form.pricingUnit ?? 'session'}
                onChange={(e) => setForm({ ...form, pricingUnit: e.target.value as 'hour' | 'session' })}
                className="rounded-lg border border-line px-2 py-1.5 text-sm outline-none focus:border-brand"
              >
                <option value="hour">per hour</option>
                <option value="session">per session</option>
              </select>
            </>
          )}
        </div>

        <Button
          icon={editingId ? <Check size={14} /> : <Plus size={14} />}
          loading={saving}
          disabled={form.pricingMode === 'paid' && form.amount === undefined}
          onClick={save}
        >
          {editingId ? 'Save changes' : 'Add service'}
        </Button>
      </div>

      {confirmDelete && (
        <ConfirmDeleteService
          service={confirmDelete}
          busy={deleting}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => remove(confirmDelete)}
        />
      )}
    </Card>
  )
}

function RowBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line transition-colors ${
        danger
          ? 'text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-600'
          : 'text-muted hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

/** Deleting is permanent, and pausing already covers "not right now" — so the
 *  confirm spells out the difference rather than asking a bare "are you sure". */
function ConfirmDeleteService({
  service,
  busy,
  onCancel,
  onConfirm,
}: {
  service: AlumniService
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card className="p-5">
          <h3 className="text-lg font-bold text-ink">Delete “{serviceName(service)}”?</h3>
          <p className="mt-1 text-sm text-muted">
            This removes it from the marketplace permanently and cannot be undone. Sessions
            members already booked stay exactly as they are, at the price they were quoted.
          </p>
          <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-muted">
            Only taking a break? Close this and use the{' '}
            <span className="font-semibold text-ink">Active</span> toggle instead — a paused
            service is hidden from members but keeps everything you wrote.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            {/* Same destructive styling the admin dashboard uses for "remove". */}
            <Button
              variant="danger"
              loading={busy}
              icon={<Trash2 size={14} />}
              onClick={onConfirm}
            >
              Delete permanently
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
