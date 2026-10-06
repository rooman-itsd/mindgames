import { useEffect, useRef } from 'react'

/**
 * The banyan network: branches grow from one seed (Rooman) and split until
 * each tip becomes a member; then glowing pulses run root to tip — referrals
 * and mentorships moving through the network.
 *
 * Node roles (each has its own colour prop):
 *   root   the seed at the top — largest, with a soft glow
 *   joint  every point where a branch splits ("parent" nodes)
 *   leaf   every branch tip (the members)
 *
 * The pattern is seeded, so it renders identically every time. `animate`
 * grows it on mount (~1.2s) and keeps several pulses flowing at once, paused
 * while the tab is hidden; `animate={false}` — or prefers-reduced-motion —
 * draws the finished tree once. Purely decorative: the canvas is aria-hidden.
 */

type Seg = { x: number; y: number; x2: number; y2: number; t0: number; dur: number; d: number; parent: Seg | null; leaf: boolean }

function buildTree(seed0: number, rootY: number) {
  let seed = seed0
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  const segs: Seg[] = []
  const grow = (x: number, y: number, a: number, len: number, d: number, t0: number, parent: Seg | null) => {
    const x2 = x + Math.cos(a) * len
    const y2 = y + Math.sin(a) * len
    // Each branch draws in 130–220ms, so the whole tree is up in ~1.2s.
    const s: Seg = { x, y, x2, y2, t0, dur: 130 + rnd() * 90, d, parent, leaf: false }
    segs.push(s)
    if (d >= 5 || x2 < 0.02 || x2 > 0.98 || y2 > 1.05) {
      s.leaf = true
      return
    }
    const kids = d < 2 ? 2 + (rnd() > 0.5 ? 1 : 0) : rnd() > 0.25 ? 2 : 1
    for (let i = 0; i < kids; i++) {
      const spread = (i - (kids - 1) / 2) * (0.55 + rnd() * 0.35)
      grow(x2, y2, a + spread + (rnd() - 0.5) * 0.3, len * (0.72 + rnd() * 0.12), d + 1, t0 + s.dur, s)
    }
  }
  grow(0.5, rootY, Math.PI / 2 - 0.9, 0.15, 0, 0, null)
  grow(0.5, rootY, Math.PI / 2 + 0.9, 0.15, 0, 60, null)
  grow(0.5, rootY, Math.PI / 2, 0.13, 0, 30, null)
  const leaves = segs.filter((s) => s.leaf)
  const end = segs.reduce((m, s) => Math.max(m, s.t0 + s.dur), 0)
  return { segs, leaves, end, rnd }
}

export function BanyanTree({
  animate = true,
  seed = 7,
  rootY = 0.06,
  line = 'rgba(128,205,179,0.5)',
  joint = '#4fbf86',
  leaf = '#f2a81d',
  root = '#f2a81d',
  pulse = '#f8c95a',
  className = '',
}: {
  animate?: boolean
  seed?: number
  /** Where the seed sits, as a fraction of the height. */
  rootY?: number
  line?: string
  /** Parent nodes — where branches split. */
  joint?: string
  /** Sub-nodes — the branch tips. */
  leaf?: string
  /** The seed node at the top. */
  root?: string
  pulse?: string
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    const still = !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tree = buildTree(seed, rootY)
    let W = 0
    let H = 0
    const size = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = r.width
      H = r.height
      cv.width = W * dpr
      cv.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    size()

    const pathTo = (tip: Seg) => {
      const p: Seg[] = []
      for (let s: Seg | null = tip; s; s = s.parent) p.unshift(s)
      return p
    }
    const dot = (x: number, y: number, r: number, color: string) => {
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    const glow = (x: number, y: number, r: number, color: string, blur: number) => {
      ctx.save()
      ctx.shadowColor = color
      ctx.shadowBlur = blur
      dot(x, y, r, color)
      ctx.restore()
    }

    let pulses: { p: Seg[]; t0: number; dur: number }[] = []
    let lastPulse = 0
    const start = performance.now()
    let raf = 0

    const draw = (now: number) => {
      const t = still ? tree.end + 1 : now - start
      ctx.clearRect(0, 0, W, H)
      ctx.lineCap = 'round'

      // Branches.
      for (const s of tree.segs) {
        if (t < s.t0) continue
        const p = 1 - Math.pow(1 - Math.min(1, (t - s.t0) / s.dur), 3)
        ctx.strokeStyle = line
        ctx.lineWidth = Math.max(1.2, 4 - s.d * 0.55)
        ctx.beginPath()
        ctx.moveTo(s.x * W, s.y * H)
        ctx.lineTo((s.x + (s.x2 - s.x) * p) * W, (s.y + (s.y2 - s.y) * p) * H)
        ctx.stroke()
      }
      // Nodes, once their branch has fully drawn: green joints, orange tips.
      for (const s of tree.segs) {
        if (t < s.t0 + s.dur) continue
        if (s.leaf) dot(s.x2 * W, s.y2 * H, 4.2, leaf)
        else dot(s.x2 * W, s.y2 * H, Math.max(3.2, 5.2 - s.d * 0.4), joint)
      }
      // Root: largest, with a soft glow.
      glow(0.5 * W, rootY * H, 9, root, 18)

      if (still) return
      // Several pulses at once, each running root to tip in ~1s.
      if (t > tree.end * 0.6 && now - lastPulse > 240) {
        lastPulse = now
        const tip = tree.leaves[Math.floor(tree.rnd() * tree.leaves.length)]
        pulses.push({ p: pathTo(tip), t0: now, dur: 850 + tree.rnd() * 350 })
      }
      pulses = pulses.filter((pl) => {
        const k = (now - pl.t0) / pl.dur
        if (k >= 1) return false
        const f = k * pl.p.length
        const s = pl.p[Math.min(pl.p.length - 1, Math.floor(f))]
        const u = f - Math.floor(f)
        ctx.globalAlpha = 1 - k * 0.35
        glow((s.x + (s.x2 - s.x) * u) * W, (s.y + (s.y2 - s.y) * u) * H, 4.6, pulse, 14)
        ctx.globalAlpha = 1
        return true
      })
      if (!document.hidden) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    const onResize = () => {
      size()
      if (still) draw(performance.now())
    }
    const onVisibility = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden && !still) raf = requestAnimationFrame(draw)
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [animate, seed, rootY, line, joint, leaf, root, pulse])

  return <canvas ref={ref} aria-hidden className={className} />
}
