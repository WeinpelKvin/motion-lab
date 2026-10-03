import { useEffect, useRef } from 'react'

export default function WaveMorph() {
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

      const layers = 6
      for (let l = 0; l < layers; l++) {
        const phase = (l / layers) * Math.PI * 2
        const amp = h * 0.06 + l * h * 0.025
        const freq = 2 + l * 0.5
        const yBase = h * 0.5 + (l - layers / 2) * h * 0.08
        const alpha = 0.12 - l * 0.01
        const hue = 200 + l * 10

        ctx.beginPath()
        ctx.moveTo(0, yBase)

        for (let x = 0; x <= w; x += 2) {
          const y = yBase
            + amp * Math.sin((x / w) * Math.PI * freq + t * 0.012 + phase)
            + amp * 0.3 * Math.sin((x / w) * Math.PI * freq * 2.3 + t * 0.018 + phase)
          ctx.lineTo(x, y)
        }

        ctx.lineTo(w, h)
        ctx.lineTo(0, h)
        ctx.closePath()

        ctx.fillStyle = `hsla(${hue}, 100%, 55%, ${alpha})`
        ctx.fill()

        // stroke on top
        ctx.beginPath()
        ctx.moveTo(0, yBase)
        for (let x = 0; x <= w; x += 2) {
          const y = yBase
            + amp * Math.sin((x / w) * Math.PI * freq + t * 0.012 + phase)
            + amp * 0.3 * Math.sin((x / w) * Math.PI * freq * 2.3 + t * 0.018 + phase)
          ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `hsla(${hue}, 100%, 70%, 0.5)`
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
