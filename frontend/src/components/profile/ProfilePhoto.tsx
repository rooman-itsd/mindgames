import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Camera, Eye, Trash2, X } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { fileToPhotoDataUrl } from '../../lib/image'
import { Avatar } from '../ui'

/**
 * Clickable profile photo with a WhatsApp/LinkedIn-style menu:
 *   View photo · Upload/Change photo · Remove photo
 * On profiles you can't edit, clicking simply opens the fullscreen viewer.
 */
export function ProfilePhoto({
  name,
  photo,
  size = 88,
  canEdit,
  onChange,
}: {
  name: string
  photo?: string | null
  size?: number
  canEdit: boolean
  /** Receives the new data-URL photo, or null when removed. */
  onChange?: (photo: string | null) => void
}) {
  const { notify } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewing, setViewing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close the menu on any outside click.
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  function handleClick() {
    if (canEdit) setMenuOpen((v) => !v)
    else if (photo) setViewing(true)
  }

  async function pick(f: File) {
    try {
      onChange?.(await fileToPhotoDataUrl(f))
    } catch {
      notify('Could not read that image — try a different file.', 'error')
    }
  }

  const clickable = canEdit || !!photo

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        onClick={handleClick}
        className={`relative block rounded-full ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
        title={canEdit ? 'Photo options' : photo ? 'View photo' : name}
        aria-label={canEdit ? 'Profile photo options' : photo ? `View ${name}'s photo` : name}
      >
        <Avatar name={name} src={photo} size={size} />
        {canEdit && size >= 56 && (
          <span className="absolute right-0 bottom-0 grid h-7 w-7 place-items-center rounded-full border-2 border-surface bg-page text-ink">
            <Camera size={14} />
          </span>
        )}
      </button>

      {/* Options menu */}
      {menuOpen && (
        <div className="absolute top-full left-0 z-30 mt-2 w-44 rounded-xl border border-line bg-surface p-1 shadow-lg">
          {photo && (
            <MenuItem
              icon={<Eye size={15} />}
              label="View photo"
              onClick={() => {
                setMenuOpen(false)
                setViewing(true)
              }}
            />
          )}
          <MenuItem
            icon={<Camera size={15} />}
            label={photo ? 'Change photo' : 'Upload photo'}
            onClick={() => {
              setMenuOpen(false)
              fileRef.current?.click()
            }}
          />
          {photo && (
            <MenuItem
              icon={<Trash2 size={15} />}
              label="Remove photo"
              danger
              onClick={() => {
                setMenuOpen(false)
                onChange?.(null)
              }}
            />
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) pick(f)
          e.target.value = ''
        }}
      />

      {/* Fullscreen viewer */}
      {viewing && photo && (
        <div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-3 bg-black/85 p-6"
          onClick={() => setViewing(false)}
        >
          <button
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close photo viewer"
          >
            <X size={20} />
          </button>
          <img
            src={photo}
            alt={name}
            className="max-h-[75vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            style={{ minWidth: 260 }}
            onClick={(e) => e.stopPropagation()}
          />
          <p className="text-sm font-medium text-white/90">{name}</p>
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: ReactNode
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm ${
        danger ? 'text-red-500 hover:bg-red-50' : 'text-ink hover:bg-gray-50'
      }`}
    >
      {icon} {label}
    </button>
  )
}
