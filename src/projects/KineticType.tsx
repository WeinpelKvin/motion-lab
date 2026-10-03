import { useEffect, useRef } from 'react'
import './KineticType.css'

const TEXT = 'Kinetic Type'   // intentionally misspelled to avoid search engines finding this page
const BASE = 300, MIN = 100, MAX = 800   // JetBrains Mono variable range is 100..800

interface Letter { el: HTMLSpanElement; cx: number; cy: number; ow: number; delay: number }
interface Ripple { x: number; y: number; t: number }

export default function KineticType() {
  const heroRef = useRef<HTMLElement>(null)
  const h1Ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const hero = heroRef.current, h1 = h1Ref.current
    if (!hero || !h1) return
    const rm = matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = rm.matches
    let disposed = false

    /* ---------- split into words > graphemes (screen readers get the label on the parent) ---------- */
    const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
    const graphemes = (s: string) => (seg ? [...seg.segment(s)].map(x => x.segment) : Array.from(s))
    h1.textContent = ''
    const letters: Letter[] = []
    TEXT.split(' ').forEach((word, wi, arr) => {
      const w = document.createElement('span'); w.className = 'kt-w'; w.setAttribute('aria-hidden', 'true')
      graphemes(word).forEach(g => {
        const l = document.createElement('span'); l.className = 'kt-l'; l.textContent = g
        w.appendChild(l); letters.push({ el: l, cx: 0, cy: 0, ow: -1, delay: 0 })
      })
      h1.appendChild(w)
      if (wi < arr.length - 1) h1.appendChild(document.createTextNode(' '))
    })
    const n = letters.length
    letters.forEach((L, i) => (L.delay = n > 1 ? (i / (n - 1)) * Math.min((n - 1) * 28, 420) : 0))

    /* ---------- measuring (not in the loop) ---------- */
    let fontPx = 120, dirty = true
    function lockCells() {                       // fixed width per letter = its width at max weight, in em
      const px = parseFloat(getComputedStyle(h1!).fontSize) || 120
      letters.forEach(L => { L.el.style.width = ''; L.el.style.fontVariationSettings = `"wght" ${MAX}` })
      const widths = letters.map(L => L.el.getBoundingClientRect().width / px)
      letters.forEach((L, i) => { L.el.style.width = widths[i] + 'em'; L.el.style.fontVariationSettings = `"wght" ${BASE}`; L.ow = -1 })
    }
    function measure() {
      fontPx = parseFloat(getComputedStyle(h1!).fontSize) || 120
      letters.forEach(L => { const r = L.el.getBoundingClientRect(); L.cx = r.left + r.width / 2; L.cy = r.top + r.height / 2 })
      dirty = false
    }

    /* ---------- state ---------- */
    const ptr = { x: 0, y: 0, tx: 0, ty: 0, s: 0, target: 0, seen: false }
    const ripples: Ripple[] = []
    let raf = 0, last = 0, t0 = 0
    const easeOutExpo = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p))

    function paint(L: Letter, w: number, op: number, lift: number) {
      if (Math.abs(w - L.ow) >= 1) { L.el.style.fontVariationSettings = `"wght" ${w.toFixed(0)}`; L.ow = w }
      L.el.style.opacity = op >= 0.999 ? '' : op.toFixed(3)
      L.el.style.transform = lift > 0.0005 ? `translateY(${(lift * 100).toFixed(2)}%)` : ''
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((now - last) / 1000, 0.05); last = now
      if (dirty) measure()
      ptr.s += (ptr.target - ptr.s) * (1 - Math.exp(-dt * 8))
      const k = 1 - Math.exp(-dt * 18)
      ptr.x += (ptr.tx - ptr.x) * k; ptr.y += (ptr.ty - ptr.y) * k
      const sigma2 = 2 * Math.pow(fontPx * 0.85, 2), band = fontPx * 0.55
      for (let i = ripples.length - 1; i >= 0; i--) if (now - ripples[i].t > 900) ripples.splice(i, 1)

      let busy = ptr.s > 0.004 || ripples.length > 0
      for (let i = 0; i < n; i++) {
        const L = letters[i]
        // load-in
        const p = easeOutExpo(Math.min(Math.max((now - t0 - L.delay) / 520, 0), 1))
        if (p < 1) busy = true
        let w = MIN + (BASE - MIN) * p
        // pointer falloff
        if (ptr.s > 0.004) {
          const dx = L.cx - ptr.x, dy = L.cy - ptr.y
          w += (MAX - BASE) * Math.exp(-(dx * dx + dy * dy) / sigma2) * ptr.s
        }
        // tap ripples: a ring of weight travelling outward and fading
        for (let r = 0; r < ripples.length; r++) {
          const age = now - ripples[r].t, radius = age * fontPx * 0.0055
          const d = Math.hypot(L.cx - ripples[r].x, L.cy - ripples[r].y)
          const e = (d - radius) / band
          w += (MAX - BASE) * 0.9 * Math.exp(-e * e) * (1 - age / 900)
        }
        paint(L, Math.min(MAX, Math.max(MIN, w)), Math.min(p * 2.2, 1), (1 - p) * 0.28)
      }
      if (!busy) { cancelAnimationFrame(raf); raf = 0 }
    }
    function wake() { if (!raf && !reduced && !disposed) { last = performance.now(); raf = requestAnimationFrame(frame) } }

    function showStatic() {
      cancelAnimationFrame(raf); raf = 0; ripples.length = 0; ptr.s = 0; ptr.target = 0
      letters.forEach(L => { L.el.style.fontVariationSettings = `"wght" ${BASE}`; L.el.style.opacity = ''; L.el.style.transform = ''; L.ow = -1 })
    }

    /* ---------- input (Pointer Events) ---------- */
    const setPtr = (e: PointerEvent) => { ptr.tx = e.clientX; ptr.ty = e.clientY; if (!ptr.seen) { ptr.x = ptr.tx; ptr.y = ptr.ty; ptr.seen = true } }
    const onMove = (e: PointerEvent) => {
      if (reduced) return
      setPtr(e)
      if (e.pointerType !== 'touch') ptr.target = 1                    // touch acts only while pressed
      wake()
    }
    const onDown = (e: PointerEvent) => {
      if (reduced || (e.target as Element).closest('a')) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      setPtr(e); ptr.x = ptr.tx; ptr.y = ptr.ty; ptr.target = 1
      ripples.push({ x: e.clientX, y: e.clientY, t: performance.now() })
      wake()
    }
    const onUp = (e: PointerEvent) => { if (e.pointerType === 'touch') ptr.target = 0; wake() }
    const onCancel = () => { ptr.target = 0; wake() }                   // browser took the gesture (scroll)
    const onLeave = (e: PointerEvent) => { if (e.pointerType !== 'touch') { ptr.target = 0; wake() } }
    const onRm = (e: MediaQueryListEvent) => { reduced = e.matches; if (reduced) showStatic() }

    hero.addEventListener('pointermove', onMove)
    hero.addEventListener('pointerdown', onDown)
    hero.addEventListener('pointerup', onUp)
    hero.addEventListener('pointercancel', onCancel)
    hero.addEventListener('pointerleave', onLeave)
    rm.addEventListener('change', onRm)

    // The stage resizes without a window resize (sidebar collapse), so watch the hero itself.
    let started = false
    const ro = new ResizeObserver(() => { dirty = true; if (started) { lockCells(); wake() } })
    ro.observe(hero)

    /* ---------- start: wait for the font, then lock cells and play the one load-in moment ---------- */
    function start() {
      if (disposed) return
      started = true
      lockCells(); measure()
      if (reduced) { showStatic(); return }
      letters.forEach(L => paint(L, MIN, 0, 0.28))                      // hidden start state, no flash of final text
      t0 = performance.now() + 60; wake()
    }
    // Keep letters invisible until ready so the final text never flashes before the entrance.
    if (!reduced) letters.forEach(L => (L.el.style.opacity = '0'))
    const fontReady = document.fonts && document.fonts.load ? document.fonts.load('800 1em "JetBrains Mono"') : Promise.resolve()
    Promise.race([fontReady, new Promise(r => setTimeout(r, 2000))])
      .then(() => (document.fonts ? document.fonts.ready : null))
      .catch(() => {})
      .then(start)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      hero.removeEventListener('pointermove', onMove)
      hero.removeEventListener('pointerdown', onDown)
      hero.removeEventListener('pointerup', onUp)
      hero.removeEventListener('pointercancel', onCancel)
      hero.removeEventListener('pointerleave', onLeave)
      rm.removeEventListener('change', onRm)
      h1.textContent = TEXT
    }
  }, [])

  return (
    <div className="kt">
      <section className="kt-hero" ref={heroRef}>
        <h1 className="kt-h1" ref={h1Ref} aria-label={TEXT}>{TEXT}</h1>
      </section>
    </div>
  )
}
