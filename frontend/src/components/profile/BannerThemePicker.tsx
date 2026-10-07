// Direct edit control for the profile hero's cover — a pencil button sitting
// right on the banner itself, not tucked into Edit Profile or Quick View.
// Two ways to set it, both applying immediately with no separate save step:
//   - pick one of five on-brand gradient themes, or
//   - upload a photo, cropped to fill the banner exactly.
// The two are mutually exclusive: uploading a photo overrides the gradient,
// and picking a theme clears any uploaded photo — the banner is always
// unambiguously "the gradient" or "this photo", never both at once.

import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Pencil, Trash2 } from 'lucide-react'
import { useApp } from '../../store/AppStore'
import { fileToBannerDataUrl } from '../../lib/image'
import { BANNER_THEMES, bannerThemeGradient, type BannerTheme } from '../../types'

export function BannerThemePicker({
  current,
  image,
}: {
  current?: string
  /** The member's uploaded cover photo, if any. */
  image?: string | null
}) {
  const { updateProfile, notify } = useApp()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function pickTheme(theme: BannerTheme) {
    if (!image && theme.id === (current ?? 'sunrise')) return setOpen(false)
    setBusy(true)
    try {
      // Clearing bannerImage is what makes the gradient visible again — see
      // the mutual-exclusivity note above.
      await updateProfile({ bannerTheme: theme.id, bannerImage: null })
      setOpen(false)
    } catch {
      notify('Could not update your cover. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function pickFile(file: File) {
    setBusy(true)
    try {
      const dataUrl = await fileToBannerDataUrl(file)
      await updateProfile({ bannerImage: dataUrl })
      setOpen(false)
    } catch (err) {
      notify(
        err instanceof Error && err.message.includes('read')
          ? err.message
          : 'Could not update your cover photo. Try again.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto() {
    setBusy(true)
    try {
      await updateProfile({ bannerImage: null })
      setOpen(false)
    } catch {
      notify('Could not remove your cover photo. Try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={wrapRef} className="absolute top-3 right-3 z-10">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Change cover"
        aria-label="Change cover"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/40"
      >
        <Pencil size={13} /> Edit cover
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 rounded-xl border border-line bg-surface p-3 shadow-lg">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2.5 text-sm font-medium text-brand hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60"
          >
            <Camera size={14} /> {image ? 'Change cover photo' : 'Upload cover photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) pickFile(f)
              e.target.value = ''
            }}
          />
          {image && (
            <button
              onClick={removePhoto}
              disabled={busy}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-muted hover:bg-gray-50 hover:text-red-500 disabled:cursor-wait"
            >
              <Trash2 size={12} /> Remove photo — use a colour instead
            </button>
          )}

          <p className="mt-3 mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
            Or pick a colour
          </p>
          <div className="flex gap-2">
            {BANNER_THEMES.map((theme) => {
              // "Active" only means anything while no custom photo is set —
              // with a photo showing, no swatch is the current banner.
              const active = !image && theme.id === (current ?? 'sunrise')
              return (
                <button
                  key={theme.id}
                  onClick={() => pickTheme(theme)}
                  title={theme.label}
                  aria-label={`${theme.label} cover colour${active ? ' (current)' : ''}`}
                  disabled={busy}
                  className="group flex flex-col items-center gap-1 disabled:cursor-wait"
                >
                  <span
                    className="relative grid h-9 w-9 place-items-center rounded-full transition-transform group-hover:scale-105"
                    style={{
                      background: bannerThemeGradient(theme.id),
                      // The "selected" ring is an inline outline rather than a
                      // Tailwind ring utility: its colour has to be
                      // conditional on `active`, which a static class can't do.
                      outline: active ? '2px solid var(--color-brand)' : '2px solid transparent',
                      outlineOffset: 2,
                    }}
                  >
                    {active && <Check size={14} className="text-white drop-shadow" />}
                  </span>
                  <span className="text-[10px] font-medium text-muted">{theme.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
