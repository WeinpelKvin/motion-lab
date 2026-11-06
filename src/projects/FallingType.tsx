/* MOTION MANIFEST
 * Track:           art
 * Technique:       rigid-body physics (matter-js) on Canvas 2D. Each letter is rasterised once in a
 *                  random typeface; its collision shape is the convex hull traced from the glyph's
 *                  pixels, so an "A" lands like a wedge and an "o" rolls.
 * Why:             real stacking (rotation, friction, resting contact, sleeping) is the whole piece;
 *                  a hand-rolled solver would jitter and sink. Hull shapes pile far more believably
 *                  than bounding boxes.
 * Timing:          fixed 60 Hz physics step (max 4 per frame, clamped dt). Hold to pour: first repeat
 *                  after 280 ms, then one letter every 110 ms. Old letters fade out over 400 ms.
 *                  Clear drops the floor for 1.4 s so the pile falls away.
 * Input:           Pointer Events, touch-action: none. Press = drop at the pointer (nudged upward
 *                  until it doesn't overlap the pile); hold = pour. With the canvas focused, any
 *                  printable key drops that character. Letter field + Clear button for touch.
 * Reduced motion:  letters fade in (220 ms) with no tilt or spin and no pouring; Clear fades the pile
 *                  out instead of dropping it through the floor. Listens for changes.
 * Perf budget:     <= 140 bodies (oldest fade out beyond that), hulls <= 20 vertices, matter sleeping
 *                  on, DPR cap 2, sprites pre-rendered. The loop stops when every body sleeps.
 * Seed:            n/a - typeface, size and colour are picked per drop with Math.random; the piece is
 *                  driven by input, so there is nothing to reproduce or share.
 * Libraries:       matter-js 0.20.0 - stable stacking and contact resolution.
 */
import { useEffect, useRef, useState } from 'react'
import Matter from 'matter-js'
import './FallingType.css'

const { Engine, Composite, Bodies, Body, Vertices, Query, Sleeping } = Matter

const FONT_CSS =
  'https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Archivo+Black&family=Bebas+Neue' +
  '&family=Bungee&family=Caveat:wght@700&family=DM+Serif+Display&family=Lobster&family=Pacifico' +
  '&family=Playfair+Display:wght@900&family=Righteous&family=Rubik+Mono+One&family=Space+Grotesk:wght@700' +
  '&display=swap'

const FACES: { family: string; weight: number }[] = [
  { family: 'Abril Fatface', weight: 400 },
  { family: 'Archivo Black', weight: 400 },
  { family: 'Bebas Neue', weight: 400 },
  { family: 'Bungee', weight: 400 },
  { family: 'Caveat', weight: 700 },
  { family: 'DM Serif Display', weight: 400 },
  { family: 'Lobster', weight: 400 },
  { family: 'Pacifico', weight: 400 },
  { family: 'Playfair Display', weight: 900 },
  { family: 'Righteous', weight: 400 },
  { family: 'Rubik Mono One', weight: 400 },
  { family: 'Space Grotesk', weight: 700 },
  { family: 'JetBrains Mono', weight: 800 },
]

// restrained palette: mostly off-white, some neon blue, a little grey
const COLORS = ['#e8e8e8', '#e8e8e8', '#e8e8e8', '#0088ff', '#0088ff', '#5ac8ff', '#8a8a8a']

const STEP = 1000 / 60
const MAX_BODIES = 140
const FADE_MS = 400
const MAX_HULL = 20

const DEFAULT = 'A'

const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
const lastGrapheme = (s: string) => {
  const g = seg ? [...seg.segment(s)].map(x => x.segment) : Array.from(s)
  return g[g.length - 1] ?? ''
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

type Pt = { x: number; y: number }
interface Sprite { img: HTMLCanvasElement; w: number; h: number; hull: Pt[]; centre: Pt }
interface Item { body: Matter.Body; sprite: Sprite; born: number; dying: number }

/** Andrew's monotone chain. Returns the hull counter-clockwise in screen space (y down). */
function convexHull(pts: Pt[]): Pt[] {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lo: Pt[] = [], up: Pt[] = []
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q) }
  lo.pop(); up.pop()
  return lo.concat(up)
}

/** Drop the vertex that contributes the least area until the hull is small enough. Stays convex. */
function simplify(h: Pt[], max: number): Pt[] {
  const out = h.slice()
  const area = (i: number) => {
    const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length]
    return Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  }
  while (out.length > 3) {
    let mi = 0, mv = Infinity
    for (let i = 0; i < out.length; i++) { const v = area(i); if (v < mv) { mv = v; mi = i } }
    if (out.length <= max && mv > 4) break
    out.splice(mi, 1)
  }
  return out
}

/** Render a glyph to a sprite (at device resolution) and trace its convex hull in CSS pixels. */
function rasterize(ch: string, px: number, face: { family: string; weight: number }, color: string, dpr: number): Sprite | null {
  const font = `${face.weight} ${px}px "${face.family}", Georgia, serif`
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const m = probe.measureText(ch)
  const pad = 3
  const left = m.actualBoundingBoxLeft, asc = m.actualBoundingBoxAscent
  const w = Math.ceil(left + m.actualBoundingBoxRight) + pad * 2
  const h = Math.ceil(asc + m.actualBoundingBoxDescent) + pad * 2
  if (w <= pad * 2 + 2 || h <= pad * 2 + 2) return null      // whitespace / empty glyph

  const img = document.createElement('canvas')
  img.width = Math.ceil(w * dpr); img.height = Math.ceil(h * dpr)
  const g = img.getContext('2d', { willReadFrequently: true })!
  g.scale(dpr, dpr)
  g.font = font
  g.fillStyle = color
  g.fillText(ch, pad + left, pad + asc)

  // trace: the leftmost and rightmost solid pixel of each row
  const { data, width: IW, height: IH } = g.getImageData(0, 0, img.width, img.height)
  const pts: Pt[] = []
  const rowStep = Math.max(1, Math.round(dpr))
  for (let y = 0; y < IH; y += rowStep) {
    let a = -1, b = -1
    for (let x = 0; x < IW; x++) if (data[(y * IW + x) * 4 + 3] > 110) { if (a < 0) a = x; b = x }
    if (a >= 0) {
      pts.push({ x: a / dpr, y: y / dpr }, { x: (b + 1) / dpr, y: y / dpr })
      pts.push({ x: a / dpr, y: (y + rowStep) / dpr }, { x: (b + 1) / dpr, y: (y + rowStep) / dpr })
    }
  }
  if (pts.length < 6) return null
  const hull = simplify(convexHull(pts), MAX_HULL)
  if (hull.length < 3) return null
  const centre = Vertices.centre(hull as Matter.Vector[])
  return { img, w, h, hull, centre }
}

export default function FallingType() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const api = useRef<{ clear: () => void } | null>(null)
  const letterRef = useRef(DEFAULT)
  const [value, setValue] = useState(DEFAULT)

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext('2d')!
    let disposed = false

    const rm = matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = rm.matches
    const onRm = (e: MediaQueryListEvent) => { reduced = e.matches }
    rm.addEventListener('change', onRm)

    // fonts: inject the stylesheet once, then warm every face in the background
    if (!document.getElementById('falling-type-fonts')) {
      const link = document.createElement('link')
      link.id = 'falling-type-fonts'; link.rel = 'stylesheet'; link.href = FONT_CSS
      document.head.appendChild(link)
    }
    const fontLoad = (face: { family: string; weight: number }, ch: string) =>
      document.fonts?.load ? document.fonts.load(`${face.weight} 64px "${face.family}"`, ch).catch(() => []) : Promise.resolve([])
    FACES.forEach(f => fontLoad(f, 'Aa'))

    /* ---------- world ---------- */
    const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 })
    engine.gravity.y = 1
    const world = engine.world
    let items: Item[] = []
    let walls: Matter.Body[] = []
    let floor: Matter.Body | null = null
    let cw = 0, ch = 0, dpr = 1
    let floorBackAt = 0

    const buildWalls = () => {
      walls.forEach(w => Composite.remove(world, w))
      const t = 200
      const opts = { isStatic: true, friction: 0.8, frictionStatic: 1 }
      floor = Bodies.rectangle(cw / 2, ch + t / 2, cw + t * 4, t, opts)
      walls = [
        floor,
        Bodies.rectangle(-t / 2, ch / 2 - ch, t, ch * 4, opts),
        Bodies.rectangle(cw + t / 2, ch / 2 - ch, t, ch * 4, opts),
      ]
      if (floorBackAt) Composite.add(world, walls.slice(1))
      else Composite.add(world, walls)
    }

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      if (r.width === cw && r.height === ch) return
      cw = r.width; ch = r.height
      dpr = Math.min(devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(cw * dpr))
      canvas.height = Math.max(1, Math.round(ch * dpr))
      buildWalls()
      // keep letters inside the new bounds
      for (const it of items) {
        const p = it.body.position
        if (p.x < 0 || p.x > cw) Body.setPosition(it.body, { x: Math.min(Math.max(p.x, 20), cw - 20), y: p.y })
        Sleeping.set(it.body, false)
      }
      wake()
    }

    /* ---------- dropping ---------- */
    const drop = (x: number, y: number, chr: string) => {
      if (!chr || !cw) return
      const face = pick(FACES)
      const color = pick(COLORS)
      const base = Math.min(cw, ch)
      const px = Math.round(Math.max(42, base * (0.09 + Math.random() * 0.1)))
      fontLoad(face, chr).then(() => {
        if (disposed) return
        const sprite = rasterize(chr, px, face, color, dpr)
        if (!sprite) return
        // nudge upward until the new letter doesn't overlap anything
        const half = Math.max(sprite.w, sprite.h) / 2
        const sx = Math.min(Math.max(x, half + 2), cw - half - 2)
        let sy = Math.min(y, ch - half - 2)
        const bodies = items.map(i => i.body)
        for (let k = 0; k < 40; k++) {
          const hits = Query.region(bodies, { min: { x: sx - half, y: sy - half }, max: { x: sx + half, y: sy + half } })
          if (!hits.length) break
          sy -= half * 0.5
        }
        const body = Bodies.fromVertices(sx, sy, [sprite.hull as Matter.Vector[]], {
          friction: 0.7, frictionStatic: 0.9, frictionAir: 0.01, restitution: 0.08, density: 0.0015,
          sleepThreshold: 40,
        })
        if (!reduced) {
          Body.setAngle(body, (Math.random() - 0.5) * 0.7)
          Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08)
        }
        Composite.add(world, body)
        items.push({ body, sprite, born: performance.now(), dying: 0 })
        // too many: fade the oldest living ones out
        let alive = items.filter(i => !i.dying).length
        for (const it of items) { if (alive <= MAX_BODIES) break; if (!it.dying) { it.dying = performance.now(); alive-- } }
        wake()
      })
    }

    const clear = () => {
      if (!items.length) return
      if (reduced) {
        const now = performance.now()
        items.forEach(i => { if (!i.dying) i.dying = now })
      } else if (floor) {
        Composite.remove(world, floor)
        floorBackAt = performance.now() + 1400
        items.forEach(i => Sleeping.set(i.body, false))
      }
      wake()
    }
    api.current = { clear }

    /* ---------- loop ---------- */
    let raf = 0, running = false, last = 0, acc = 0
    const render = (now: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const it of items) {
        const { body, sprite } = it
        let a = Math.min(1, (now - it.born) / (reduced ? 220 : 120))
        if (it.dying) a *= Math.max(0, 1 - (now - it.dying) / FADE_MS)
        if (a <= 0) continue
        const c = Math.cos(body.angle) * dpr, s = Math.sin(body.angle) * dpr
        ctx.setTransform(c, s, -s, c, body.position.x * dpr, body.position.y * dpr)
        ctx.globalAlpha = a
        ctx.drawImage(sprite.img, -sprite.centre.x, -sprite.centre.y, sprite.w, sprite.h)
      }
      ctx.globalAlpha = 1
    }

    const frame = (now: number) => {
      const dt = Math.min(now - last, 100)
      last = now
      acc += dt
      let n = 0
      while (acc >= STEP && n < 4) { Engine.update(engine, STEP); acc -= STEP; n++ }
      if (n === 4) acc = 0

      if (floorBackAt && now >= floorBackAt) {
        floorBackAt = 0
        if (floor) Composite.add(world, floor)
      }
      // retire faded and fallen letters
      const keep: Item[] = []
      for (const it of items) {
        const gone = (it.dying && now - it.dying > FADE_MS) || it.body.position.y > ch + 400
        if (gone) Composite.remove(world, it.body)
        else keep.push(it)
      }
      items = keep

      render(now)

      const busy = floorBackAt > 0 || items.some(i => !i.body.isSleeping || i.dying || now - i.born < 250)
      if (!busy) { running = false; return }
      raf = requestAnimationFrame(frame)
    }
    function wake() {
      if (running || disposed) return
      running = true
      last = performance.now(); acc = 0
      raf = requestAnimationFrame(frame)
    }

    /* ---------- input ---------- */
    let pour = 0, pourX = 0, pourY = 0, pourId = -1
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top] as const
    }
    const stopPour = () => { clearTimeout(pour); pour = 0; pourId = -1 }
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
      canvas.setPointerCapture(e.pointerId)
      const [x, y] = local(e)
      pourX = x; pourY = y; pourId = e.pointerId
      drop(x, y, letterRef.current)
      if (reduced) return
      const again = () => { drop(pourX + (Math.random() - 0.5) * 16, pourY, letterRef.current); pour = window.setTimeout(again, 110) }
      pour = window.setTimeout(again, 280)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pourId) return
      const [x, y] = local(e)
      pourX = x; pourY = y
    }
    const onUp = (e: PointerEvent) => { if (e.pointerId === pourId) stopPour() }
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.length !== 1 || e.key === ' ') return        // printable, single character
      e.preventDefault(); e.stopPropagation()                  // don't let j/k switch experiments
      letterRef.current = e.key
      setValue(e.key)
      drop(cw * (0.15 + Math.random() * 0.7), -40, e.key)
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('keydown', onKey)

    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()

    return () => {
      disposed = true
      api.current = null
      stopPour()
      cancelAnimationFrame(raf)
      ro.disconnect()
      rm.removeEventListener('change', onRm)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('keydown', onKey)
      Composite.clear(world, false)
      Engine.clear(engine)
    }
  }, [])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const c = lastGrapheme(e.target.value.trim())
    setValue(c)
    if (c) letterRef.current = c
  }

  return (
    <div className="ft" ref={wrapRef}>
      <canvas
        className="ft-canvas"
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label="A pile of falling letters. Click to drop a letter, hold to pour, or focus here and type."
      />
      <div className="ft-ui">
        <label className="ft-field">
          <span>Letter</span>
          <input
            className="ft-input"
            value={value}
            onChange={onChange}
            onFocus={e => e.target.select()}
            onBlur={() => { if (!value) setValue(letterRef.current) }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Letter to drop"
          />
        </label>
        <button className="ft-btn" onClick={() => api.current?.clear()}>Clear</button>
        <span className="ft-hint">Click to drop · hold to pour</span>
      </div>
    </div>
  )
}
