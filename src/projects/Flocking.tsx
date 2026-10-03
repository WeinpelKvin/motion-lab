import { useEffect, useRef } from 'react'

interface Boid {
  x: number; y: number
  vx: number; vy: number
}

const BOID_COUNT = 120
const PERCEPTION = 80
const MAX_SPEED = 3.2
const MAX_FORCE = 0.08
const BOID_RADIUS = 7        // hard exclusion radius
const SEP_RADIUS = 32        // soft separation radius

function limit(vx: number, vy: number, max: number) {
  const mag = Math.sqrt(vx * vx + vy * vy)
  if (mag > max) return [vx / mag * max, vy / mag * max]
  return [vx, vy]
}

export default function Flocking() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf: number
    const boids: Boid[] = []

    const resize = () => {
      canvas.width = canvas.offsetWidth * devicePixelRatio
      canvas.height = canvas.offsetHeight * devicePixelRatio
      ctx.scale(devicePixelRatio, devicePixelRatio)
    }

    const init = () => {
      boids.length = 0
      for (let i = 0; i < BOID_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2
        boids.push({
          x: Math.random() * canvas.offsetWidth,
          y: Math.random() * canvas.offsetHeight,
          vx: Math.cos(angle) * 1.5,
          vy: Math.sin(angle) * 1.5,
        })
      }
    }

    const steer = (b: Boid, tx: number, ty: number) => {
      const dx = tx - b.x, dy = ty - b.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      let [sx, sy] = limit(dx / d * MAX_SPEED - b.vx, dy / d * MAX_SPEED - b.vy, MAX_FORCE)
      return [sx, sy]
    }

    const update = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight

      for (const b of boids) {
        let sepX = 0, sepY = 0, sepCount = 0
        let aliX = 0, aliY = 0
        let cohX = 0, cohY = 0, cohCount = 0

        for (const other of boids) {
          if (other === b) continue
          const dx = other.x - b.x, dy = other.y - b.y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < PERCEPTION) {
            // separation — stronger weight when closer
            if (d < SEP_RADIUS) {
              const weight = (SEP_RADIUS - d) / SEP_RADIUS
              sepX -= (dx / d) * weight
              sepY -= (dy / d) * weight
              sepCount++
            }
            // alignment
            aliX += other.vx
            aliY += other.vy
            // cohesion
            cohX += other.x
            cohY += other.y
            cohCount++
          }
        }

        let ax = 0, ay = 0

        if (sepCount > 0) {
          const [sx, sy] = steer(b, b.x + sepX / sepCount, b.y + sepY / sepCount)
          ax += sx * 3.5
          ay += sy * 3.5
        }

        if (cohCount > 0) {
          const [cx, cy] = steer(b, cohX / cohCount, cohY / cohCount)
          ax += cx * 1.0
          ay += cy * 1.0
          const mag = Math.sqrt(aliX * aliX + aliY * aliY)
          if (mag > 0) {
            let [alsx, alsy] = limit(aliX / mag * MAX_SPEED - b.vx, aliY / mag * MAX_SPEED - b.vy, MAX_FORCE)
            ax += alsx * 1.2
            ay += alsy * 1.2
          }
        }

        // mouse attraction
        const mouse = mouseRef.current
        if (mouse) {
          const dx = mouse.x - b.x, dy = mouse.y - b.y
          const d = Math.sqrt(dx * dx + dy * dy)
          const strength = Math.min(1, 200 / (d + 1))
          const [mx, my] = steer(b, mouse.x, mouse.y)
          ax += mx * strength * 2.5
          ay += my * strength * 2.5
        }

        b.vx += ax
        b.vy += ay;
        [b.vx, b.vy] = limit(b.vx, b.vy, MAX_SPEED)

        b.x += b.vx
        b.y += b.vy

        // wrap edges
        if (b.x < -10) b.x = w + 10
        if (b.x > w + 10) b.x = -10
        if (b.y < -10) b.y = h + 10
        if (b.y > h + 10) b.y = -10
      }

      // hard positional separation — push overlapping boids apart
      const minDist = BOID_RADIUS * 2
      for (let i = 0; i < boids.length; i++) {
        for (let j = i + 1; j < boids.length; j++) {
          const dx = boids[j].x - boids[i].x
          const dy = boids[j].y - boids[i].y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < minDist && d > 0) {
            const push = (minDist - d) / 2
            const nx = dx / d, ny = dy / d
            boids[i].x -= nx * push
            boids[i].y -= ny * push
            boids[j].x += nx * push
            boids[j].y += ny * push
            // reflect velocity components along collision axis
            const dvx = boids[j].vx - boids[i].vx
            const dvy = boids[j].vy - boids[i].vy
            const dot = dvx * nx + dvy * ny
            if (dot < 0) {
              boids[i].vx += dot * nx * 0.5
              boids[i].vy += dot * ny * 0.5
              boids[j].vx -= dot * nx * 0.5
              boids[j].vy -= dot * ny * 0.5
            }
          }
        }
      }
    }

    const draw = () => {
      const w = canvas.offsetWidth, h = canvas.offsetHeight
      ctx.fillStyle = 'rgba(0,0,0,0.18)'
      ctx.fillRect(0, 0, w, h)

      const mouse = mouseRef.current

      // mouse cursor ring
      if (mouse) {
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, 24, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(0,136,255,0.15)'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0,136,255,0.5)'
        ctx.fill()
      }

      for (const b of boids) {
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy)
        const angle = Math.atan2(b.vy, b.vx)
        const size = 6

        // proximity to mouse → brighter
        let brightness = 0.5
        if (mouse) {
          const dx = mouse.x - b.x, dy = mouse.y - b.y
          const d = Math.sqrt(dx * dx + dy * dy)
          brightness = 0.4 + Math.min(0.6, 120 / (d + 1))
        }

        ctx.save()
        ctx.translate(b.x, b.y)
        ctx.rotate(angle)

        ctx.beginPath()
        ctx.moveTo(size, 0)
        ctx.lineTo(-size * 0.6, size * 0.4)
        ctx.lineTo(-size * 0.3, 0)
        ctx.lineTo(-size * 0.6, -size * 0.4)
        ctx.closePath()

        const speedRatio = speed / MAX_SPEED
        ctx.fillStyle = `hsla(${210 + speedRatio * 30}, 100%, ${50 + brightness * 25}%, ${brightness})`
        ctx.fill()
        ctx.restore()
      }

      update()
      raf = requestAnimationFrame(draw)
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = {
        x: (e.clientX - rect.left),
        y: (e.clientY - rect.top),
      }
    }

    const onMouseLeave = () => { mouseRef.current = null }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)

    resize()
    init()
    draw()

    const ro = new ResizeObserver(() => { resize(); init() })
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'none' }} />
}
