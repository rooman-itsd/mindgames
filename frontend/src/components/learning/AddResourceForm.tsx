import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Paperclip, X } from 'lucide-react'
import { api } from '../../lib/api'
import { toBase64 } from '../../lib/file'
import {
  AUDIENCE_LABEL,
  DIFFICULTY_FILTERS,
  MAX_RESOURCE_DOMAINS,
  MAX_RESOURCE_FILES,
  MAX_RESOURCE_FILE_BYTES,
  fileSizeLabel,
  isBlockedFile,
  resourceDomains,
  resourceFormProblem,
} from '../../lib/learningHub'
import { useApp } from '../../store/AppStore'
import { Button } from '../ui'
import type { ProjectDifficulty, ShareAudience } from '../../types'
import { DomainSelect } from './DomainSelect'

/** A file in the form: uploading, uploaded (has its id), or refused. */
type Pending = { key: string; name: string; size: number; id?: string; error?: string }

/**
 * "Add resource" on Learning Resources: a resource for any domain, made of
 * attached files. Deliberately small — Domain, Title, Resources, Why it
 * helped, Difficulty, Who can see it. Each file uploads as soon as it is
 * picked (one request per file), so Add only has to link them.
 * On phones it opens as a sheet from the bottom of the screen.
 */
export function AddResourceForm({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { notify } = useApp()
  const [picked, setPicked] = useState<string[]>([])
  const [custom, setCustom] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [files, setFiles] = useState<Pending[]>([])
  const [whyHelped, setWhyHelped] = useState('')
  const [difficulty, setDifficulty] = useState<ProjectDifficulty>('beginner')
  const [audience, setAudience] = useState<ShareAudience>('everyone')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Files dropped (×) or the form closed while an upload was still going:
  // when that upload lands, it is deleted at once instead of being left over.
  const dropped = useRef(new Set<string>())
  const closed = useRef(false)

  const domains = resourceDomains(picked, custom)
  const ready = files.filter((f) => f.id)
  const uploading = files.filter((f) => !f.id && !f.error).length
  const slots = MAX_RESOURCE_FILES - files.filter((f) => !f.error).length

  const patch = (key: string, p: Partial<Pending>) => setFiles((cur) => cur.map((f) => (f.key === key ? { ...f, ...p } : f)))

  const attach = (list: FileList | null) => {
    if (!list) return
    for (const file of Array.from(list).slice(0, Math.max(slots, 0))) {
      const key = `${file.name}-${file.size}-${Math.random()}`
      const refused = isBlockedFile(file.name)
        ? 'Programs and web pages cannot be attached'
        : file.size === 0
          ? 'That file is empty'
          : file.size > MAX_RESOURCE_FILE_BYTES
            ? 'Too large (10 MB max)'
            : ''
      setFiles((cur) => [...cur, { key, name: file.name, size: file.size, error: refused || undefined }])
      if (refused) continue
      toBase64(file)
        .then((data) => api.uploadLearningFile({ name: file.name, mime: file.type || 'application/octet-stream', data }))
        .then(
          (up) => {
            if (closed.current || dropped.current.has(key)) void api.deleteLearningUpload(up.id).catch(() => {})
            else patch(key, { id: up.id })
          },
          (e) => patch(key, { error: e instanceof Error ? e.message : 'Upload failed' }),
        )
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  const remove = (f: Pending) => {
    dropped.current.add(f.key)
    setFiles((cur) => cur.filter((x) => x.key !== f.key))
    if (f.id) void api.deleteLearningUpload(f.id).catch(() => {})
  }

  const close = () => {
    // Tidy uploads that will never be used — finished ones now, ones still
    // in flight when they land (the server also sweeps after a day).
    closed.current = true
    for (const f of ready) void api.deleteLearningUpload(f.id!).catch(() => {})
    onClose()
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const problem = resourceFormProblem({ domains, title, files: ready.length, uploading, whyHelped })
    if (problem) return setError(problem)
    setSaving(true)
    setError('')
    try {
      await api.addLearningResource({
        domains,
        title: title.trim(),
        fileIds: ready.map((f) => f.id!),
        whyHelped: whyHelped.trim(),
        difficulty,
        audience,
      })
      notify('Added — thank you. Others can now find it in All Resources.')
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add it — please try again')
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid items-end bg-black/40 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="add-resource-title">
      <form
        onSubmit={submit}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="add-resource-title" className="text-base font-bold text-ink">
            Add a resource
          </h2>
          <button type="button" onClick={close} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink">Domain</p>
            <DomainSelect picked={picked} onPicked={setPicked} custom={custom} onCustom={setCustom} max={MAX_RESOURCE_DOMAINS} />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="e.g. SQL window functions: a visual guide"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>

          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink">Resources</p>
            {slots > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink hover:border-brand/40"
                >
                  <Paperclip size={15} /> Attach files
                </button>
                <input ref={inputRef} type="file" multiple hidden onChange={(e) => attach(e.target.files)} />
              </>
            )}
            {files.length > 0 && (
              <ul className="mt-2 divide-y divide-line text-[13px]">
                {files.map((f) => (
                  <li key={f.key} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                    <span className={`shrink-0 text-xs ${f.error ? 'text-red-600' : 'text-muted'}`}>
                      {f.error ?? (f.id ? fileSizeLabel(f.size) : 'Uploading…')}
                    </span>
                    <button type="button" onClick={() => remove(f)} aria-label={`Remove ${f.name}`} className="shrink-0 p-1 text-muted hover:text-ink">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-xs text-muted">
              {ready.length ? `${ready.length} of ${MAX_RESOURCE_FILES} files` : `Up to ${MAX_RESOURCE_FILES} files, 10 MB each.`}
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">Why it helped</span>
            <textarea
              value={whyHelped}
              onChange={(e) => setWhyHelped(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="One or two sentences"
              className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as ProjectDifficulty)}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm"
              >
                {DIFFICULTY_FILTERS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Who can see it</span>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as ShareAudience)}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 text-sm"
              >
                {(Object.keys(AUDIENCE_LABEL) as ShareAudience[]).map((a) => (
                  <option key={a} value={a}>
                    {AUDIENCE_LABEL[a]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Add
            </Button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  )
}
