import { useEffect, useRef } from 'react'

export default function PulseGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf: number
    let t = 0

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio
      canvas.height = canvas.offsetHeight * devicePixelRatio
      ctx.scale(devicePixelRatio, devicePixelRatio)
    }

    const draw = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)

      const spacing = 40
      const cols = Math.ceil(w / spacing) + 1
      const rows = Math.ceil(h / spacing) + 1
      const offsetX = (w % spacing) / 2
      const offsetY = (h % spacing) / 2

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const px = offsetX + col * spacing
          const py = offsetY + row * spacing
          const dist = Math.sqrt(Math.pow(px - w / 2, 2) + Math.pow(py - h / 2, 2))
          const wave = Math.sin(dist * 0.03 - t * 0.06)
          const r = (wave * 0.5 + 0.5) * 3 + 0.5
          const alpha = wave * 0.4 + 0.45

          const hue = 210 + wave * 20

          ctx.beginPath()
          ctx.arc(px, py, r, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${alpha})`
          ctx.fill()
        }
      }

      // ripple overlay
      const maxR = Math.sqrt(w * w + h * h) * 0.6
      const rippleCount = 3
      for (let i = 0; i < rippleCount; i++) {
        const phase = (t * 1.5 + i * (maxR / rippleCount)) % maxR
        const alpha = (1 - phase / maxR) * 0.12
        ctx.beginPath()
        ctx.arc(w / 2, h / 2, phase, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(0, 136, 255, ${alpha})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

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
