import { useEffect, useRef, useState } from 'react'
import './Letter3D.css'

const DEFAULT = 'A'
const DEPTH = 0.22          // extrusion depth as a fraction of the font size
const TINTS = 12            // pre-coloured side slices, light (near the visible face) to dark
const MAX_SLICES = 200
const IDLE_SPIN = 0.35      // rad/s once the user has let go for a while
const IDLE_AFTER = 2500     // ms

interface Glyph { w: number; h: number; face: HTMLCanvasElement; back: HTMLCanvasElement; sides: HTMLCanvasElement[] }

const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
const lastGrapheme = (s: string) => {
  const g = seg ? [...seg.segment(s)].map(x => x.segment) : Array.from(s)
  return g[g.length - 1] ?? ''
}

function mix(a: number[], b: number[], t: number) {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`
}

/** Rasterise the letter once: a full-res face, a back face, and a ramp of half-res tinted silhouettes for the sides. */
function rasterize(ch: string, fontPx: number, faceColor: string): Glyph | null {
  const font = `800 ${fontPx}px "JetBrains Mono", ui-monospace, monospace`
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const m = probe.measureText(ch)
  const pad = Math.ceil(fontPx * 0.02)
  const left = m.actualBoundingBoxLeft, asc = m.actualBoundingBoxAscent
  const w = Math.ceil(left + m.actualBoundingBoxRight) + pad * 2
  const h = Math.ceil(asc + m.actualBoundingBoxDescent) + pad * 2
  if (w <= pad * 2 + 1 || h <= pad * 2 + 1) return null       // whitespace or an empty glyph

  const draw = (scale: number, color: string) => {
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale))
    const g = c.getContext('2d')!
    g.scale(scale, scale); g.font = font; g.fillStyle = color
    g.fillText(ch, pad + left, pad + asc)
    // flatten colour glyphs (emoji) into a solid silhouette
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in'
    g.fillRect(0, 0, c.width, c.height)
    return c
  }
  const near = [112, 112, 112], far = [26, 26, 26]
  const sides = Array.from({ length: TINTS }, (_, i) => draw(0.5, mix(near, far, i / (TINTS - 1))))
  return { w, h, face: draw(1, faceColor), back: draw(1, '#b4b4b4'), sides }
}

export default function Letter3D() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const api = useRef<{ setLetter: (ch: string) => void } | null>(null)
  const [value, setValue] = useState(DEFAULT)
  const current = useRef(DEFAULT)

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext('2d')!
    const rm = matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = rm.matches
    let disposed = false
    const faceColor = getComputedStyle(wrap).getPropertyValue('--text').trim() || '#e8e8e8'

    /* ---------- glyph ---------- */
    let letter = DEFAULT, glyph: Glyph | null = null, fontPx = 400, token = 0
    let growStart = -Infinity                                  // extrusion pop-in when the letter changes
    function build(animate: boolean) {
      const t = ++token
      const dpr = devicePixelRatio || 1
      fontPx = Math.min(1400, Math.round(Math.min(canvas!.offsetHeight * 0.6, canvas!.offsetWidth * 0.9) * dpr))
      const load = document.fonts?.load ? document.fonts.load(`800 100px "JetBrains Mono"`, letter) : Promise.resolve()
      load.catch(() => {}).then(() => {
        if (disposed || t !== token) return
        const g = rasterize(letter, fontPx, faceColor)
        if (!g) return                                         // keep showing the previous letter
        glyph = g
        if (animate && !reduced) growStart = performance.now()
        wake()
      })
    }

    /* ---------- rotation state ---------- */
    const rot = { yaw: -0.5, pitch: 0.25, vy: 0, vp: 0 }
    const drag = { on: false, id: -1, x: 0, y: 0, t: 0 }
    let lastTouch = -Infinity
    let raf = 0, last = 0

    function render(now: number) {
      const W = canvas!.width, H = canvas!.height
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, W, H)
      if (!glyph) return
      const g = glyph
      const ca = Math.cos(rot.yaw), sa = Math.sin(rot.yaw), cb = Math.cos(rot.pitch), sb = Math.sin(rot.pitch)
      // A slice at depth z maps affinely: X = ca·x + sa·z,  Y = sa·sb·x + cb·y − ca·sb·z.  Its view depth is z·ca·cb.
      const nz = ca * cb
      const p = Math.min(Math.max((now - growStart) / 450, 0), 1)
      const grow = 1 - Math.pow(1 - p, 3)
      const depth = fontPx * DEPTH * grow
      const slices = Math.min(MAX_SLICES, Math.max(2, Math.ceil(depth * Math.sqrt(Math.max(0, 1 - nz * nz))) + 2))
      const f = fontPx * 4                                     // focal length for a light perspective scale per slice
      const cx = W / 2, cy = H / 2
      for (let k = 0; k < slices; k++) {
        // far to near; t = 0 is the front face, t = 1 the back face
        const t = nz >= 0 ? 1 - k / (slices - 1) : k / (slices - 1)
        const z = (t - 0.5) * depth
        const s = f / (f + z * nz)
        const img = t === 0 ? g.face : t === 1 ? g.back : g.sides[Math.round((nz >= 0 ? t : 1 - t) * (TINTS - 1))]
        ctx.setTransform(s * ca, s * sa * sb, 0, s * cb, cx + s * sa * z, cy - s * ca * sb * z)
        ctx.drawImage(img, -g.w / 2, -g.h / 2, g.w, g.h)
      }
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      if (!drag.on) {
        if (reduced) { rot.vy = rot.vp = 0 }
        else if (now - lastTouch > IDLE_AFTER) {
          // ease into a slow turntable spin and settle the tilt
          rot.vy += (IDLE_SPIN - rot.vy) * (1 - Math.exp(-dt * 1.2))
          rot.vp = 0
          rot.pitch += (0.2 - rot.pitch) * (1 - Math.exp(-dt * 0.8))
        } else {
          const decay = Math.exp(-dt * 3.5)
          rot.vy *= decay; rot.vp *= decay
        }
        rot.yaw += rot.vy * dt
        rot.pitch = clampPitch(rot.pitch + rot.vp * dt)
      }
      render(now)
      const growing = now - growStart < 450
      if (reduced && !drag.on && !growing) { cancelAnimationFrame(raf); raf = 0 }
    }
    function wake() { if (!raf && !disposed) { last = performance.now(); raf = requestAnimationFrame(frame) } }
    const clampPitch = (v: number) => Math.max(-1.4, Math.min(1.4, v))

    /* ---------- input (Pointer Events) ---------- */
    const SPEED = 0.008
    const onDown = (e: PointerEvent) => {
      if (drag.on || (e.pointerType === 'mouse' && e.button !== 0)) return
      canvas.setPointerCapture(e.pointerId)
      Object.assign(drag, { on: true, id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp })
      rot.vy = rot.vp = 0; lastTouch = performance.now()
      wake()
    }
    const onMove = (e: PointerEvent) => {
      if (!drag.on || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      const dts = Math.max((e.timeStamp - drag.t) / 1000, 1 / 240)
      rot.yaw -= dx * SPEED
      rot.pitch = clampPitch(rot.pitch + dy * SPEED)
      // smoothed release velocity
      rot.vy += (-dx * SPEED / dts - rot.vy) * 0.5
      rot.vp += (dy * SPEED / dts - rot.vp) * 0.5
      Object.assign(drag, { x: e.clientX, y: e.clientY, t: e.timeStamp })
      lastTouch = performance.now()
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return
      drag.on = false; lastTouch = performance.now()
      if (e.timeStamp - drag.t > 80) rot.vy = rot.vp = 0     // held still before letting go: no fling
      wake()
    }
    const onKey = (e: KeyboardEvent) => {
      const step = 0.15
      if (e.key === 'ArrowLeft') rot.yaw += step
      else if (e.key === 'ArrowRight') rot.yaw -= step
      else if (e.key === 'ArrowUp') rot.pitch = clampPitch(rot.pitch - step)
      else if (e.key === 'ArrowDown') rot.pitch = clampPitch(rot.pitch + step)
      else return
      e.preventDefault(); e.stopPropagation()                  // don't let the gallery switch experiments
      rot.vy = rot.vp = 0; lastTouch = performance.now()
      wake(); if (reduced) render(performance.now())
    }
    const onRm = (e: MediaQueryListEvent) => { reduced = e.matches; wake() }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('keydown', onKey)
    rm.addEventListener('change', onRm)

    const ro = new ResizeObserver(() => {
      const dpr = devicePixelRatio || 1
      canvas.width = Math.round(canvas.offsetWidth * dpr)
      canvas.height = Math.round(canvas.offsetHeight * dpr)
      build(false)
      wake()
    })
    ro.observe(wrap)

    api.current = { setLetter: ch => { if (ch !== letter) { letter = ch; build(true) } } }
    build(true)

    return () => {
      disposed = true
      api.current = null
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('keydown', onKey)
      rm.removeEventListener('change', onRm)
    }
  }, [])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ch = lastGrapheme(e.target.value.trim())
    setValue(ch)
    if (ch) { current.current = ch; api.current?.setLetter(ch) }
  }

  return (
    <div className="l3" ref={wrapRef}>
      <canvas
        className="l3-canvas"
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label={`The letter ${current.current} in 3D. Drag or use the arrow keys to rotate.`}
      />
      <div className="l3-ui">
        <label className="l3-field">
          <span>Letter</span>
          <input
            className="l3-input"
            value={value}
            onChange={onChange}
            onFocus={e => e.target.select()}
            onBlur={() => { if (!value) setValue(current.current) }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label="Letter to show"
          />
        </label>
        <span className="l3-hint">Drag to rotate</span>
      </div>
    </div>
  )
}
