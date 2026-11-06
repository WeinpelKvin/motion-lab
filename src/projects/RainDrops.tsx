/* MOTION MANIFEST
 * Track:           art
 * Technique:       2D height-field wave sim (two buffers, neighbour average minus previous, damped)
 *                  on a coarse grid, shaded by surface slope through a neon-blue colour ramp,
 *                  soft exponential tone curve (no hard white clipping), upscaled with smoothing.
 * Why:             a real wave equation gives rings that spread, interfere and reflect for free;
 *                  drawing expanding circles can't cross or combine.
 * Timing:          fixed 120 Hz sim step (max 6 per frame). Click drop rings travel ~250 px/s and
 *                  fade out by ~3 s; the pointer wake fades in ~0.5 s. (Checked in an offline sim.)
 * Input:           Pointer Events on the canvas, touch-action: none. Primary press = large drop,
 *                  any move (mouse hover, or finger/pen drag) = a faint trail of small drops,
 *                  interpolated so fast moves stay continuous. pointercancel/leave reset the trail.
 * Reduced motion:  heavier damping (ripples die in well under a second), click drops at ~half
 *                  strength, pointer trail off, no opening drop. Listens for changes.
 * Perf budget:     grid capped at ~90k cells (cell size grows on big screens), typed arrays,
 *                  no allocation per frame, DPR cap 2. The loop sleeps once nothing is visible
 *                  and wakes on input, so an idle page uses no CPU.
 * Seed:            n/a - no randomness; every drop comes from user input (plus one centred
 *                  opening drop).
 * Libraries:       none
 */
import { useEffect, useRef } from 'react'

const STEP = 1 / 120
const MAX_STEPS = 6
const MAX_CELLS = 90_000
const SHADE = 0.0045   // slope -> brightness
const GLOW = 0.0016    // |height| -> brightness

// colour ramp: black -> deep blue -> neon blue -> icy highlight
const STOPS: [number, number, number, number][] = [
  [0.0, 0x00, 0x00, 0x00],
  [0.3, 0x00, 0x1e, 0x5c],
  [0.65, 0x00, 0x90, 0xff],
  [1.0, 0xc8, 0xf4, 0xff],
]

function buildLut(): Uint32Array {
  const lut = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let s = 0
    while (s < STOPS.length - 2 && t > STOPS[s + 1][0]) s++
    const [t0, r0, g0, b0] = STOPS[s]
    const [t1, r1, g1, b1] = STOPS[s + 1]
    const k = (t - t0) / (t1 - t0)
    const r = Math.round(r0 + (r1 - r0) * k)
    const g = Math.round(g0 + (g1 - g0) * k)
    const b = Math.round(b0 + (b1 - b0) * k)
    lut[i] = (255 << 24) | (b << 16) | (g << 8) | r   // ImageData is RGBA bytes = ABGR little-endian
  }
  return lut
}

export default function RainDrops() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const off = document.createElement('canvas')
    const octx = off.getContext('2d')!
    const lut = buildLut()

    const rm = matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = rm.matches
    const onRm = (e: MediaQueryListEvent) => { reduced = e.matches }
    rm.addEventListener('change', onRm)

    let cw = 0, ch = 0, cell = 4, W = 0, H = 0
    let cur = new Float32Array(0), prev = new Float32Array(0)
    let img: ImageData | null = null
    let pix = new Uint32Array(0)

    let raf = 0, running = false, last = 0, acc = 0

    let opened = false
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      if (r.width === cw && r.height === ch && img) return   // RO fires once on observe; keep state
      cw = r.width; ch = r.height
      const dpr = Math.min(devicePixelRatio, 2)
      canvas.width = Math.max(1, Math.round(cw * dpr))
      canvas.height = Math.max(1, Math.round(ch * dpr))
      cell = Math.max(3, Math.ceil(Math.sqrt((cw * ch) / MAX_CELLS)))
      W = Math.max(3, Math.ceil(cw / cell) + 1)
      H = Math.max(3, Math.ceil(ch / cell) + 1)
      cur = new Float32Array(W * H)
      prev = new Float32Array(W * H)
      off.width = W; off.height = H
      img = octx.createImageData(W, H)
      pix = new Uint32Array(img.data.buffer)
      pix.fill(lut[0])
      render()
      // one opening drop so the piece announces itself (once we have a real size)
      if (!opened && cw > 0 && ch > 0) {
        opened = true
        if (!reduced) drop(cw / 2, ch / 2, 550, 7)
      }
    }

    /** Add a smooth bump of height `amp` with radius `rad` (in cells) at CSS-pixel point x,y. */
    const drop = (x: number, y: number, amp: number, rad: number) => {
      const gx = x / cell, gy = y / cell
      const r = Math.ceil(rad)
      const x0 = Math.max(1, Math.floor(gx - r)), x1 = Math.min(W - 2, Math.ceil(gx + r))
      const y0 = Math.max(1, Math.floor(gy - r)), y1 = Math.min(H - 2, Math.ceil(gy + r))
      for (let j = y0; j <= y1; j++) {
        for (let i = x0; i <= x1; i++) {
          const d = Math.hypot(i - gx, j - gy)
          if (d < rad) cur[j * W + i] += amp * 0.5 * (1 + Math.cos((Math.PI * d) / rad))
        }
      }
      wake()
    }

    const step = () => {
      const damp = reduced ? 0.97 : 0.993   // per 120 Hz step
      for (let y = 1; y < H - 1; y++) {
        let i = y * W + 1
        for (let x = 1; x < W - 1; x++, i++) {
          prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - W] + cur[i + W]) * 0.5 - prev[i]) * damp
        }
      }
      const t = cur; cur = prev; prev = t
    }

    /** Shade the grid; returns the brightest LUT index so the loop knows when to sleep. */
    const render = (): number => {
      if (!img) return 0
      let peak = 0   // brightest LUT index drawn
      for (let y = 1; y < H - 1; y++) {
        let i = y * W + 1
        for (let x = 1; x < W - 1; x++, i++) {
          const h = cur[i]
          const a = h < 0 ? -h : h
          // light from the top-left: slopes facing it brighten
          const s = ((cur[i - 1] - cur[i + 1]) + (cur[i - W] - cur[i + W])) * SHADE
          let v = (s > 0 ? s : s * 0.25) + a * GLOW
          if (v < 0) v = 0
          const idx = ((1 - Math.exp(-1.6 * v)) * 255) | 0   // soft roll-off into the highlight
          if (idx > peak) peak = idx
          pix[i] = lut[idx]
        }
      }
      octx.putImageData(img, 0, 0)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      // grid cell (0,0) sits at CSS (0,0); scale so W cells span W*cell CSS px
      const sx = canvas.width / cw
      ctx.drawImage(off, 0, 0, W * cell * sx, H * cell * sx)
      return peak
    }

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 20)
      last = now
      acc += dt
      let n = 0
      while (acc >= STEP && n < MAX_STEPS) { step(); acc -= STEP; n++ }
      if (n === MAX_STEPS) acc = 0
      const peak = render()
      if (peak < 3) {            // nothing visible: clear residue and sleep until input
        cur.fill(0); prev.fill(0); render()
        running = false
        return
      }
      raf = requestAnimationFrame(frame)
    }

    function wake() {
      if (running) return
      running = true
      last = performance.now()
      acc = 0
      raf = requestAnimationFrame(frame)
    }

    // ---- input ----
    let lx = -1, ly = -1
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top] as const
    }

    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
      const [x, y] = local(e)
      drop(x, y, reduced ? 300 : 550, 7)
      lx = x; ly = y
    }

    const onMove = (e: PointerEvent) => {
      if (!e.isPrimary || reduced) return
      if (e.pointerType !== 'mouse' && e.buttons === 0) return   // touch/pen: only while pressed
      const [x, y] = local(e)
      if (lx < 0) { lx = x; ly = y; return }
      const dist = Math.hypot(x - lx, y - ly)
      if (dist < 1) return
      // faint wake, stronger for quicker strokes but always gentle
      const amp = 26 + Math.min(dist, 60) * 0.5
      const spacing = cell * 1.5
      const steps = Math.max(1, Math.floor(dist / spacing))
      for (let s = 1; s <= steps; s++) {
        const k = s / steps
        drop(lx + (x - lx) * k, ly + (y - ly) * k, amp / Math.sqrt(steps), 2.2)
      }
      lx = x; ly = y
    }

    const onLeave = () => { lx = -1; ly = -1 }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('pointercancel', onLeave)

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      running = false
      ro.disconnect()
      rm.removeEventListener('change', onRm)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointercancel', onLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: 'crosshair' }}
    />
  )
}
