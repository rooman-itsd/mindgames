// Resume autofill for an EXISTING member, from inside Edit Profile.
//
// Onboarding has always had this; members who signed up before the rich
// profile fields existed had no way to reach it without redoing onboarding.
// Same endpoint, same parser, same merge rule (fill blanks only) — the only
// difference is that it starts collapsed, because most visits to Edit Profile
// are to change one thing.

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { api } from '../../lib/api'
import { ResumeUpload } from '../onboarding/ResumeUpload'
import type { ResumeParseResult } from '../../types'

/** Read a File as base64 without the data-URL prefix. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function ResumeAutofill({ onParsed }: { onParsed: (r: ResumeParseResult) => void }) {
  const { notify } = useApp()
  const [open, setOpen] = useState(false)
  const [parsing, setParsing] = useState(false)

  async function parse(file: File) {
    setParsing(true)
    try {
      const dataBase64 = await toBase64(file)
      // Some platforms leave file.type empty — infer from the extension.
      const mediaType = file.type || (/\.docx$/i.test(file.name) ? DOCX_MIME : 'application/pdf')
      const result = await api.parseResume(dataBase64, mediaType)
      onParsed(result)
      setOpen(false)
      notify('Resume read — blank fields below are filled in. Review, then save.', 'success')
    } catch (err) {
      notify(
        err instanceof Error && err.message && !err.message.startsWith('Request failed')
          ? err.message
          : 'Could not parse that resume. You can still fill everything in manually.',
        'error',
      )
    } finally {
      setParsing(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-dashed border-brand/40 bg-brand-50/60 px-4 py-3 text-left hover:bg-brand-50"
      >
        <Sparkles size={16} className="shrink-0 text-brand" />
        <span>
          <span className="block text-sm font-semibold text-ink">Autofill from your resume</span>
          <span className="block text-xs text-muted">
            Fills your experience, education, projects, skills and more. Only blank fields change.
          </span>
        </span>
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Autofill from your resume</p>
        {!parsing && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-muted hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>
      <ResumeUpload parsing={parsing} onParse={parse} />
    </div>
  )
}
