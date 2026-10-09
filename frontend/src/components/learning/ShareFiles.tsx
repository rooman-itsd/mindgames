import { useState } from 'react'
import { Paperclip } from 'lucide-react'
import { api } from '../../lib/api'
import { fileSizeLabel, opensInTab } from '../../lib/learningHub'
import { useApp } from '../../store/AppStore'
import type { ShareFile } from '../../types'

/**
 * A resource's attached files on its card. A link cannot carry the bearer
 * token, so a file is fetched as a Blob and opened from an object URL: in a
 * new tab for types browsers show (the tab is opened on the click itself, so
 * pop-up blockers allow it), as a download for everything else.
 *
 * `fetchFile` lets another kind of attachment (an assigned resource's, which
 * has its own private route) use the same list; without it, a share's file.
 */
export function ShareFiles({
  shareId,
  files,
  fetchFile,
}: {
  shareId?: string
  files: ShareFile[]
  fetchFile?: (fileId: string) => Promise<Blob>
}) {
  const { notify } = useApp()
  const [busy, setBusy] = useState<string | null>(null)

  const open = async (f: ShareFile) => {
    const inTab = opensInTab(f.mime)
    const tab = inTab ? window.open('', '_blank') : null
    setBusy(f.id)
    try {
      const blob = fetchFile ? await fetchFile(f.id) : await api.getShareFile(shareId ?? '', f.id)
      const url = URL.createObjectURL(blob)
      if (tab) {
        tab.location.href = url
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = f.name
        a.click()
      }
      // Long enough for the tab or download to read it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      tab?.close()
      notify(e instanceof Error ? e.message : 'Could not open that file', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <ul className="mt-1.5 grid gap-0.5">
      {files.map((f) => (
        <li key={f.id}>
          <button
            type="button"
            onClick={() => void open(f)}
            disabled={busy === f.id}
            className="flex w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[11px] text-brand hover:bg-brand-50 disabled:opacity-60"
          >
            <Paperclip size={11} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="shrink-0 text-muted">{busy === f.id ? 'Opening…' : fileSizeLabel(f.size)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
