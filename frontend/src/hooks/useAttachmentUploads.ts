import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { toBase64 } from '../lib/file'
import { MAX_RESOURCE_FILES, MAX_RESOURCE_FILE_BYTES, isBlockedFile } from '../lib/learningHub'

/** A file in a form: uploading, uploaded (has its id), or refused. */
export type PendingFile = { key: string; name: string; size: number; id?: string; error?: string }

/**
 * Attachments for a form, through Add resource's upload pipeline
 * (api.uploadLearningFile): each file goes up as soon as it is picked, so the
 * form's submit only has to send the ids. Same rules as AddResourceForm,
 * which has its own copy of this logic:
 *   - one upload at a time — each file is read whole and base64-encoded, and
 *     ten large files at once could take a phone tab's memory with them;
 *   - a file removed (×), or the form closed, while uploading is deleted the
 *     moment its upload lands;
 *   - when the form goes away, finished uploads it never sent are deleted.
 * Call claimed() once the server has taken the files (resource saved, work
 * sent): they are no longer this form's to delete, and the list empties.
 */
export function useAttachmentUploads() {
  const [files, setFiles] = useState<PendingFile[]>([])
  const dropped = useRef(new Set<string>())
  const closed = useRef(false)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const uploaded = useRef(new Set<string>())

  useEffect(() => {
    // Set on every mount: StrictMode mounts, unmounts and mounts again in
    // development, and the first cleanup must not leave the form "closed".
    closed.current = false
    const ids = uploaded.current
    return () => {
      closed.current = true
      for (const id of ids) void api.deleteLearningUpload(id).catch(() => {})
      ids.clear()
    }
  }, [])

  const ready = files.filter((f) => f.id)
  const uploading = files.filter((f) => !f.id && !f.error).length
  const slots = MAX_RESOURCE_FILES - files.filter((f) => !f.error).length

  const patch = (key: string, p: Partial<PendingFile>) =>
    setFiles((cur) => cur.map((f) => (f.key === key ? { ...f, ...p } : f)))

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
      queue.current = queue.current.then(() =>
        closed.current || dropped.current.has(key)
          ? undefined
          : toBase64(file)
              .then((data) => api.uploadLearningFile({ name: file.name, mime: file.type || 'application/octet-stream', data }))
              .then(
                (up) => {
                  if (closed.current || dropped.current.has(key)) void api.deleteLearningUpload(up.id).catch(() => {})
                  else {
                    uploaded.current.add(up.id)
                    patch(key, { id: up.id })
                  }
                },
                (e) => patch(key, { error: e instanceof Error ? e.message : 'Upload failed' }),
              ),
      )
    }
  }

  const remove = (f: PendingFile) => {
    dropped.current.add(f.key)
    setFiles((cur) => cur.filter((x) => x.key !== f.key))
    if (f.id) {
      uploaded.current.delete(f.id)
      void api.deleteLearningUpload(f.id).catch(() => {})
    }
  }

  const claimed = () => {
    uploaded.current.clear()
    setFiles([])
  }

  return { files, ready, readyIds: ready.map((f) => f.id!), uploading, slots, attach, remove, claimed }
}

export type AttachmentUploads = ReturnType<typeof useAttachmentUploads>
