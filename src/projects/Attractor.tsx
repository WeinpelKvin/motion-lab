import { useEffect, useRef } from 'react'

export default function Attractor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf: number

    // Clifford attractor parameters
    const a = -1.4, b = 1.6, c = 1.0, d = 0.7

    let x = 0.1, y = 0
    let plotted = 0
    const MAX_POINTS = 400000
    const BATCH = 3000

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio
      canvas.height = canvas.offsetHeight * devicePixelRatio
      ctx.scale(devicePixelRatio, devicePixelRatio)
    }

    const draw = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight
      const scale = Math.min(w, h) * 0.22
      const cx = w / 2, cy = h / 2

      if (plotted < MAX_POINTS) {
        ctx.fillStyle = 'rgba(0, 136, 255, 0.06)'
        for (let i = 0; i < BATCH; i++) {
          const nx = Math.sin(a * y) + c * Math.cos(a * x)
          const ny = Math.sin(b * x) + d * Math.cos(b * y)
          x = nx; y = ny
          const px = cx + x * scale
          const py = cy + y * scale
          ctx.fillRect(px, py, 1, 1)
        }
        plotted += BATCH
      }

      raf = requestAnimationFrame(draw)
    }

    resize()
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)
    draw()

    const ro = new ResizeObserver(() => {
      resize()
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight)
      plotted = 0; x = 0.1; y = 0
    })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
}
