import { useEffect, useRef } from 'react'

export default function Lissajous() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf: number
    let t = 0
    const trail: { x: number; y: number }[] = []
    const TRAIL_LEN = 2400

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio
      canvas.height = canvas.offsetHeight * devicePixelRatio
      ctx.scale(devicePixelRatio, devicePixelRatio)
    }

    const draw = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)

      const a = 3, b = 4
      const r = Math.min(w, h) * 0.38
      const cx = w / 2, cy = h / 2
      const delta = t * 0.0003

      const x = cx + r * Math.sin(a * t * 0.008 + delta)
      const y = cy + r * Math.sin(b * t * 0.008)

      trail.push({ x, y })
      if (trail.length > TRAIL_LEN) trail.shift()

      for (let i = 1; i < trail.length; i++) {
        const alpha = (i / trail.length) * 0.8
        const hue = (i / trail.length) * 40 + 195
        ctx.beginPath()
        ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${alpha})`
        ctx.lineWidth = 1.2
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y)
        ctx.lineTo(trail[i].x, trail[i].y)
        ctx.stroke()
      }

      // glowing head
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#0088ff'
      ctx.shadowColor = '#0088ff'
      ctx.shadowBlur = 12
      ctx.fill()
      ctx.shadowBlur = 0

      t++
      raf = requestAnimationFrame(draw)
    }

    resize()
    draw()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
}
