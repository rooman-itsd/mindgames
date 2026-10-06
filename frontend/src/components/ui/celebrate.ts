/**
 * Celebration effects for genuine wins — applied, connected, published,
 * approved — never routine saves, or they stop meaning anything.
 *
 *   celebrate(el)        confetti burst in the Emerald Grove family colours
 *   heartBurst(el, '👍') a few of the chosen emoji thrown up from a button
 *
 * Both are no-ops under prefers-reduced-motion. They draw on one shared,
 * lazily created full-screen canvas / a few short-lived spans, and clean up
 * after themselves, so callers just fire and forget.
 */

const COLORS = ['#0f5a47', '#f2a81d', '#017b80', '#7c58a3', '#a54b55', '#80cdb3', '#f8c95a', '#5864b0']

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

type Bit = { x: number; y: number; vx: number; vy: number; s: number; r: number; vr: number; c: string; life: number }

let canvas: HTMLCanvasElement | null = null
let bits: Bit[] = []
let running = false

function ensureCanvas() {
  if (canvas) return canvas
  canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '70' })
  document.body.appendChild(canvas)
  return canvas
}

function tick() {
  const c = canvas
  const ctx = c?.getContext('2d')
  if (!c || !ctx) return
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
  bits = bits.filter((b) => {
    b.life++
    b.vy += 0.28
    b.vx *= 0.985
    b.x += b.vx
    b.y += b.vy
    b.r += b.vr
    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.rotate(b.r)
    ctx.globalAlpha = Math.max(0, 1 - b.life / 110)
    ctx.fillStyle = b.c
    ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2)
    ctx.restore()
    return b.life < 110
  })
  if (bits.length) requestAnimationFrame(tick)
  else {
    running = false
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
  }
}

/** Confetti from the centre of `origin` (or the middle of the screen). */
export function celebrate(origin?: Element | null) {
  if (reduced()) return
  const c = ensureCanvas()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  if (c.width !== window.innerWidth * dpr) {
    c.width = window.innerWidth * dpr
    c.height = window.innerHeight * dpr
    c.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  // A modal that closed on success has taken its button with it; a detached
  // element measures as 0,0, so fall back to the middle of the screen.
  const r = origin?.isConnected ? origin.getBoundingClientRect() : undefined
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2
  const y = r ? r.top + r.height / 2 : window.innerHeight / 3
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 4 + Math.random() * 7
    bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, s: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLORS[i % COLORS.length], life: 0 })
  }
  if (!running) {
    running = true
    requestAnimationFrame(tick)
  }
}

/** A handful of hearts (or the chosen emoji) thrown up from a reaction button. */
export function heartBurst(origin?: Element | null, glyph = '♥') {
  if (reduced() || !origin?.isConnected) return
  const r = origin.getBoundingClientRect()
  for (let i = 0; i < 6; i++) {
    const h = document.createElement('span')
    h.className = 'grove-heart'
    h.setAttribute('aria-hidden', 'true')
    h.textContent = glyph
    h.style.left = `${r.left + r.width / 2 - 6 + (Math.random() - 0.5) * 16}px`
    h.style.top = `${r.top}px`
    h.style.setProperty('--dx', `${(Math.random() - 0.5) * 70}px`)
    h.style.setProperty('--dy', `${-30 - Math.random() * 40}px`)
    h.style.setProperty('--rot', `${(Math.random() - 0.5) * 60}deg`)
    document.body.appendChild(h)
    window.setTimeout(() => h.remove(), 950)
  }
}
