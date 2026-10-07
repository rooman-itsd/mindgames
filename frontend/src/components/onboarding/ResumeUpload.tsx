import { useRef, useState } from 'react'
import { FileText, Sparkles, UploadCloud } from 'lucide-react'
import { Button, cx } from '../ui'

export function ResumeUpload({
  parsing,
  onParse,
}: {
  parsing: boolean
  onParse: (file: File) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function pick(f: File) {
    if (/\.doc$/i.test(f.name)) {
      setError('Legacy .doc files are not supported — save your resume as PDF or .docx.')
      return
    }
    if (!/\.(pdf|docx)$/i.test(f.name)) {
      setError('Please upload a PDF or Word (.docx) file.')
      return
    }
    setError(null)
    setFile(f)
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
          const f = e.dataTransfer.files?.[0]
          if (f) pick(f)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        className={cx(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          parsing ? 'cursor-default' : 'cursor-pointer',
          dragging ? 'border-brand bg-brand-50' : 'border-line bg-page hover:border-brand-400',
        )}
      >
        <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-100 text-brand">
          {file ? <FileText size={24} /> : <UploadCloud size={24} />}
        </div>
        {file ? (
          <p className="font-medium text-ink">{file.name}</p>
        ) : (
          <div>
            <p className="font-medium text-ink">
              Drop your resume here, or <span className="text-brand">browse</span>
            </p>
            <p className="mt-1 text-xs text-muted">PDF or Word (.docx)</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) pick(f)
          }}
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <Button
        variant="ai"
        className="mt-4 w-full"
        icon={<Sparkles size={16} />}
        disabled={!file}
        loading={parsing}
        onClick={() => file && onParse(file)}
      >
        {parsing ? 'AI is parsing your resume…' : 'Parse with AI'}
      </Button>
    </div>
  )
}
