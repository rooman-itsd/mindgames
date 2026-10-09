import { useRef } from 'react'
import { Paperclip, X } from 'lucide-react'
import { MAX_RESOURCE_FILES, fileSizeLabel } from '../../lib/learningHub'
import type { AttachmentUploads } from '../../hooks/useAttachmentUploads'

/**
 * "Attach files" and the list of what is attached, for a form using
 * useAttachmentUploads. Looks like Add resource's Resources field. `compact`
 * is the smaller size for a card.
 */
export function AttachmentPicker({
  att,
  disabled = false,
  compact = false,
}: {
  att: AttachmentUploads
  disabled?: boolean
  compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      {att.slots > 0 && (
        <>
          {/* Locked while saving: a file attached or removed mid-save would be
              orphaned or pulled out from under the submit. */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className={
              compact
                ? 'inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink hover:border-brand/40 disabled:opacity-50'
                : 'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink hover:border-brand/40 disabled:opacity-50'
            }
          >
            <Paperclip size={compact ? 12 : 15} /> Attach files
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              att.attach(e.target.files)
              e.target.value = ''
            }}
          />
        </>
      )}
      {att.files.length > 0 && (
        <ul className={`mt-2 divide-y divide-line ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
          {att.files.map((f) => (
            <li key={f.key} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
              <span className={`shrink-0 text-xs ${f.error ? 'text-red-600' : 'text-muted'}`}>
                {f.error ?? (f.id ? fileSizeLabel(f.size) : 'Uploading…')}
              </span>
              <button
                type="button"
                onClick={() => att.remove(f)}
                disabled={disabled}
                aria-label={`Remove ${f.name}`}
                className="shrink-0 p-1 text-muted hover:text-ink disabled:opacity-50"
              >
                <X size={compact ? 12 : 14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!compact && (
        <p className="mt-1.5 text-xs text-muted">
          {att.ready.length
            ? `${att.ready.length} of ${MAX_RESOURCE_FILES} files`
            : `Up to ${MAX_RESOURCE_FILES} files, 10 MB each.`}
        </p>
      )}
    </div>
  )
}
