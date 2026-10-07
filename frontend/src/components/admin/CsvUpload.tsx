import { useRef, useState } from 'react'
import { UploadCloud, FileText, AlertTriangle } from 'lucide-react'
import type { ContactRow } from '../../types'
import { parseContactsCsv } from '../../lib/csv'
import { cx } from '../ui'

export function CsvUpload({
  onParsed,
}: {
  // The filename rides along so each import can be labelled as its own batch
  // (see invitees.routes.ts) — admins load one CSV per centre/course/year and
  // need to tell them apart afterwards.
  onParsed: (rows: ContactRow[], fileName: string) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setError(null)
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      setError('Please upload a .csv file.')
      return
    }
    const text = await file.text()
    const rows = parseContactsCsv(text)
    if (rows.length === 0) {
      setError('No rows found. Expected columns: Name, Phone, Email.')
      return
    }
    setFileName(file.name)
    onParsed(rows, file.name)
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void handleFile(file)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        className={cx(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          dragging ? 'border-brand bg-brand-50' : 'border-line bg-page hover:border-brand-400',
        )}
      >
        <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-100 text-brand">
          <UploadCloud size={24} />
        </div>
        <div>
          <p className="font-medium text-ink">
            Drag &amp; drop a CSV here, or <span className="text-brand">browse</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            We extract only <span className="text-ink">Name</span>,{' '}
            <span className="text-ink">Phone</span> and <span className="text-ink">Email</span>.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
      </div>

      {fileName && !error && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <FileText size={15} className="text-brand" /> Parsed <span className="text-ink">{fileName}</span>
        </p>
      )}
      {error && (
        <p className="mt-3 flex items-center gap-2 text-sm text-red-500">
          <AlertTriangle size={15} /> {error}
        </p>
      )}

      <p className="mt-4 text-xs text-muted">
        No file handy?{' '}
        <button
          className="text-brand underline-offset-2 hover:underline"
          onClick={() =>
            onParsed(
              parseContactsCsv(
                'Name,Phone,Email\n"Lee, Sam",+91 90000 12345,sam.lee@example.com\nPooja Rao,+91 90000 67890,pooja.rao@example.com\nIncomplete Row,+91 90000 00000,',
              ),
              'Sample rows',
            )
          }
        >
          Load sample rows
        </button>
      </p>
    </div>
  )
}
