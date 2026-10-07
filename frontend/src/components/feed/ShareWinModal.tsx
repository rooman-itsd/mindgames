import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, X } from 'lucide-react'
import { Button } from '../ui'
import { LinkedInIcon } from '../icons/Brand'
import { SHARE_WIN_EVENT, type ShareWin } from './shareWin'

/**
 * "Share your win": draws a branded 1200×630 card (the size LinkedIn and
 * WhatsApp previews use) in the browser, then lets the member download it,
 * copy a caption, and open LinkedIn with the caption filled in.
 *
 * LinkedIn can't receive an image from another site — only a link — and posts
 * here are private, so the member attaches the downloaded image themselves.
 * The dialog says so. Open it from anywhere with openShareWin() (shareWin.ts).
 */

const W = 1200
const H = 630

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = w
      if (lines.length === maxLines) break
    } else line = next
  }
  if (lines.length < maxLines && line) lines.push(line)
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'
  return lines
}

function drawCard(canvas: HTMLCanvasElement, win: ShareWin) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = W
  canvas.height = H
  // Emerald gradient with a marigold glow — the Emerald Grove palette.
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0f5a47')
  bg.addColorStop(1, '#01372a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.15, 0, W * 0.85, H * 0.15, 520)
  glow.addColorStop(0, 'rgba(242,168,29,0.55)')
  glow.addColorStop(1, 'rgba(242,168,29,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  // A few network dots for texture.
  ctx.fillStyle = 'rgba(128,205,179,0.35)'
  for (let i = 0; i < 26; i++) {
    const x = (i * 197) % W
    const y = (i * 131) % H
    ctx.beginPath()
    ctx.arc(x, y, 3 + (i % 3), 0, Math.PI * 2)
    ctx.fill()
  }
  // Eyebrow, headline, name.
  ctx.fillStyle = '#f8c95a'
  ctx.font = '700 28px Inter, system-ui, sans-serif'
  ctx.fillText('🎉  A WIN IN THE NETWORK', 72, 120)
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 64px Inter, system-ui, sans-serif'
  wrap(ctx, win.headline, W - 144, 3).forEach((l, i) => ctx.fillText(l, 72, 220 + i * 78))
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '600 30px Inter, system-ui, sans-serif'
  ctx.fillText([win.name, win.role].filter(Boolean).join('  ·  '), 72, H - 72)
  // Logo mark, bottom right.
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  // roundRect is missing before Safari 16 / Firefox 112; a throw here would
  // blank the app (there is no error boundary), so fall back to a square tile.
  if (typeof ctx.roundRect === 'function') ctx.roundRect(W - 300, H - 108, 44, 44, 10)
  else ctx.rect(W - 300, H - 108, 44, 44)
  ctx.fill()
  ctx.fillStyle = '#0f5a47'
  ctx.font = '900 26px Inter, system-ui, sans-serif'
  ctx.fillText('R', W - 287, H - 76)
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 28px Inter, system-ui, sans-serif'
  ctx.fillText('Root Connect', W - 244, H - 76)
}

export function ShareWinModal() {
  const [win, setWin] = useState<ShareWin | null>(null)
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const onOpen = (e: Event) => {
      setCopied(false)
      setWin((e as CustomEvent<ShareWin>).detail)
    }
    window.addEventListener(SHARE_WIN_EVENT, onOpen)
    return () => window.removeEventListener(SHARE_WIN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!win || !canvasRef.current) return
    const canvas = canvasRef.current
    // Wait for Inter so the card isn't drawn in a fallback font.
    void document.fonts?.ready.then(() => drawCard(canvas, win))
    drawCard(canvas, win)
  }, [win])

  useEffect(() => {
    if (!win) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setWin(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [win])

  if (!win) return null
  const caption = `${win.headline}\n\nGrateful to the Rooman alumni network for the support along the way. #RootConnect #Rooman`

  const download = () => {
    const url = canvasRef.current?.toDataURL('image/png')
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = 'root-connect-win.png'
    a.click()
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(caption)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" onClick={() => setWin(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share your win"
        onClick={(e) => e.stopPropagation()}
        className="animate-slidein w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="font-bold text-ink">Share your win 🎉</p>
          <button type="button" onClick={() => setWin(null)} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-4 p-5">
          <canvas ref={canvasRef} className="aspect-[1200/630] w-full rounded-xl" aria-label={`Share card: ${win.headline}`} />
          <p className="text-sm text-muted">
            Download the image, then attach it to your LinkedIn post. LinkedIn opens with the caption filled in.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download size={16} />} onClick={download}>
              Download image
            </Button>
            <a
              href={`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(caption)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" icon={<LinkedInIcon size={16} />}>
                Open LinkedIn
              </Button>
            </a>
            <Button variant="ghost" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={copy}>
              {copied ? 'Caption copied' : 'Copy caption'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
